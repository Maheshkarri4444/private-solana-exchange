//! Swap fees to LP holders, privately.
//!
//! Every swap adds its fee to the pool's encrypted "fee growth" (fee per LP
//! unit). `collect_lp_fees` pays one holder balance × (growth − checkpoint)
//! into their private USDC and token balances and moves their checkpoint up.
//! Anyone may trigger it (the backend does, after trades); the funds always go
//! to the holder, who also gets their lifetime total encrypted to them.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::*,
    error::ErrorCode,
    events::LpFeesPaid,
    state::*,
    ArciumSignerAccount, ID, ID_CONST,
};

#[derive(Accounts)]
pub struct OpenLpPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: the LP holder; any wallet (the position only ever pays them).
    pub owner: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [LP_POSITION_SEED, pool.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub position: Box<Account<'info, LpPosition>>,
    pub system_program: Program<'info, System>,
}

pub fn open_lp_position_handler(ctx: Context<OpenLpPosition>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    position.pool = ctx.accounts.pool.key();
    position.owner = ctx.accounts.owner.key();
    position.bump = ctx.bumps.position;
    Ok(())
}

#[queue_computation_accounts("lp_collect", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CollectLpFees<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Checked in the handler instead of by constraints: Solana's 4 KB stack.
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub position: Box<Account<'info, LpPosition>>,
    /// CHECK: the holder's LP token account (an ETA), decoded in the handler.
    /// Only read: its ciphertext goes to Arcium as is.
    pub lp_eta: UncheckedAccount<'info>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LP_COLLECT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

pub fn collect_lp_fees_handler(ctx: Context<CollectLpFees>, computation_offset: u64) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;
    let owner = a.position.owner;

    require_keys_eq!(*a.lp_eta.owner, ID, ErrorCode::WrongAccount);
    let lp = {
        let data = a.lp_eta.try_borrow_data()?;
        Box::new(EncryptedTokenAccount::try_deserialize(&mut &data[..])?)
    };
    require!(
        a.position.pool == a.pool.key()
            && lp.owner == owner
            && lp.mint == a.pool.lp_mint
            && a.usdc_eta.owner == owner
            && a.usdc_eta.mint == a.config.usdc_mint
            && a.token_eta.owner == owner
            && a.token_eta.mint == a.pool.token_mint,
        ErrorCode::WrongAccount
    );
    require!(
        lp.enc_pubkey == a.usdc_eta.enc_pubkey && lp.enc_pubkey == a.token_eta.enc_pubkey,
        ErrorCode::EncryptionKeyMismatch
    );
    require!(
        a.pool.fee_growth_initialized && a.pool.swap_count > a.position.paid_swap_count,
        ErrorCode::NothingToCollect
    );
    require!(!a.usdc_eta.is_frozen() && !a.token_eta.is_frozen(), ErrorCode::AccountFrozen);
    require!(
        !a.pool.is_locked(slot)
            && !a.position.is_locked(slot)
            && !a.usdc_eta.is_locked(slot)
            && !a.token_eta.is_locked(slot),
        ErrorCode::AccountBusy
    );

    // The pool is locked too, so no swap changes its fee growth mid-job.
    a.pool.lock(computation, slot, KIND_COLLECT);
    a.position.pending_computation = computation;
    a.position.pending_since_slot = slot;
    a.position.pending_swap_count = a.pool.swap_count;
    a.usdc_eta.lock(computation, slot);
    a.token_eta.lock(computation, slot);

    // Order must match the circuit's parameters.
    let args = ArgBuilder::new()
        .x25519_pubkey(lp.enc_pubkey)
        .plaintext_u128(lp.nonce)
        .encrypted_u64(lp.balance_ct)
        .plaintext_bool(lp.is_initialized)
        .plaintext_u128(a.pool.fee_growth_nonce)
        .account(a.pool.key(), Pool::FEE_GROWTH_OFFSET, Pool::FEE_GROWTH_LEN)
        .plaintext_u128(a.position.checkpoint_nonce)
        .account(a.position.key(), LpPosition::CHECKPOINT_OFFSET, 32)
        .plaintext_bool(a.position.checkpoint_initialized)
        .x25519_pubkey(a.usdc_eta.enc_pubkey)
        .plaintext_u128(a.usdc_eta.nonce)
        .encrypted_u64(a.usdc_eta.balance_ct)
        .plaintext_bool(a.usdc_eta.is_initialized)
        .x25519_pubkey(a.token_eta.enc_pubkey)
        .plaintext_u128(a.token_eta.nonce)
        .encrypted_u64(a.token_eta.balance_ct)
        .plaintext_bool(a.token_eta.is_initialized)
        .x25519_pubkey(lp.enc_pubkey)
        .plaintext_u128(a.position.earned_nonce)
        .account(a.position.key(), LpPosition::EARNED_OFFSET, 32)
        .plaintext_bool(a.position.earned_initialized)
        .build();

    let writable = |pubkey| CallbackAccount {
        pubkey,
        is_writable: true,
    };
    let callback_accounts = [
        writable(a.pool.key()),
        writable(a.position.key()),
        writable(a.usdc_eta.key()),
        writable(a.token_eta.key()),
    ];
    a.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![LpCollectCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &callback_accounts,
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

#[callback_accounts("lp_collect")]
#[derive(Accounts)]
pub struct LpCollectCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LP_COLLECT))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: address is validated by the Arcium program; verify_output reads slot data from it.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub position: Box<Account<'info, LpPosition>>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,
}

pub fn lp_collect_callback_handler(
    ctx: Context<LpCollectCallback>,
    output: SignedComputationOutputs<LpCollectOutput>,
) -> Result<()> {
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;
    if a.pool.pending_computation != computation
        || a.position.pending_computation != computation
        || a.usdc_eta.pending_computation != computation
        || a.token_eta.pending_computation != computation
    {
        return Ok(());
    }
    a.pool.clear_pending();
    a.position.pending_computation = Pubkey::default();
    a.position.pending_since_slot = 0;
    a.usdc_eta.clear_pending();
    a.token_eta.clear_pending();

    // On failure nothing changed; the payout is simply tried again later.
    let Ok(LpCollectOutput { field_0: result }) =
        output.verify_output(&a.cluster_account, &a.computation_account)
    else {
        return Ok(());
    };
    let LpCollectOutputStruct0 {
        field_0: usdc_bal,
        field_1: token_bal,
        field_2: checkpoint,
        field_3: earned,
    } = result;

    let owner_key = a.usdc_eta.enc_pubkey;
    require!(
        usdc_bal.encryption_key == owner_key
            && token_bal.encryption_key == owner_key
            && earned.encryption_key == owner_key,
        ErrorCode::EncryptionKeyMismatch
    );
    a.usdc_eta.set_balance(usdc_bal.ciphertexts[0], usdc_bal.nonce);
    a.token_eta.set_balance(token_bal.ciphertexts[0], token_bal.nonce);

    let position = &mut a.position;
    position.checkpoint_ct = checkpoint.ciphertexts[0];
    position.checkpoint_nonce = checkpoint.nonce;
    position.checkpoint_initialized = true;
    position.earned_ct = earned.ciphertexts[0];
    position.earned_nonce = earned.nonce;
    position.earned_initialized = true;
    position.paid_swap_count = position.pending_swap_count;
    position.paid_at = Clock::get()?.unix_timestamp;

    emit!(LpFeesPaid {
        pool: a.pool.key(),
        owner: position.owner,
    });
    Ok(())
}
