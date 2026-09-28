use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use super::shared::mint_supply;
use crate::{
    constants::*,
    error::ErrorCode,
    events::PoolUpdated,
    state::*,
    ArciumSignerAccount, ID, ID_CONST,
};

/// The creator's initial liquidity moves into the pool privately and they get
/// the LP tokens. The deposit amounts are encrypted in the creator's browser.
#[queue_computation_accounts("seed_pool", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SeedPool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Accounts are checked by field instead of re-deriving PDAs: these account
    // types are only ever created at their PDAs, and re-deriving them here would
    // exceed Solana's 4 KB stack frame.
    pub config: Box<Account<'info, Config>>,

    /// Creator + status checked in the handler (stack limit).
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,

    /// Checked in the handler (stack limit).
    pub token_info: Box<Account<'info, TokenInfo>>,

    /// CHECK: the pool's token mint; only its supply is read.
    #[account(address = pool.token_mint)]
    pub token_mint: UncheckedAccount<'info>,

    /// Ownership checked in the handler (stack limit).
    #[account(mut)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,

    /// Ownership checked in the handler (stack limit).
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,

    /// Must exist (see `open_account`).
    /// Ownership checked in the handler (stack limit).
    #[account(mut)]
    pub lp_eta: Box<Account<'info, EncryptedTokenAccount>>,

    /// CHECK: the LP token's TokenInfo; forwarded to the callback, which checks it.
    pub lp_info: UncheckedAccount<'info>,

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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEED_POOL))]
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

pub fn seed_pool_handler(
    ctx: Context<SeedPool>,
    computation_offset: u64,
    deposit_ct: [[u8; 32]; 2],
    deposit_nonce: u128,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let total_supply = ctx
        .accounts
        .token_info
        .exchange_supply
        .checked_add(mint_supply(&ctx.accounts.token_mint)?)
        .ok_or(ErrorCode::Overflow)?;

    let a = &mut *ctx.accounts;
    let payer = a.payer.key();
    require_keys_eq!(a.pool.creator, payer, ErrorCode::NotPoolCreator);
    require!(
        a.pool.status == POOL_AWAITING_LIQUIDITY,
        ErrorCode::PoolAlreadySeeded
    );
    require!(
        a.token_info.mint == a.pool.token_mint,
        ErrorCode::WrongAccount
    );
    require!(
        a.token_eta.owner == payer
            && a.token_eta.mint == a.pool.token_mint
            && a.usdc_eta.owner == payer
            && a.usdc_eta.mint == a.config.usdc_mint
            && a.lp_eta.owner == payer
            && a.lp_eta.mint == a.pool.lp_mint,
        ErrorCode::WrongAccount
    );
    require!(
        a.token_eta.is_initialized && a.usdc_eta.is_initialized,
        ErrorCode::NoBalance
    );
    require!(
        !a.token_eta.is_frozen() && !a.usdc_eta.is_frozen() && !a.lp_eta.is_frozen(),
        ErrorCode::AccountFrozen
    );
    require!(
        !a.pool.is_locked(slot)
            && !a.token_eta.is_locked(slot)
            && !a.usdc_eta.is_locked(slot)
            && !a.lp_eta.is_locked(slot),
        ErrorCode::AccountBusy
    );
    a.pool.lock(computation, slot, KIND_SEED);
    a.token_eta.lock(computation, slot);
    a.usdc_eta.lock(computation, slot);
    a.lp_eta.lock(computation, slot);

    // Order must match the circuit: token balance, USDC balance, deposit, supply.
    let args = ArgBuilder::new()
        .x25519_pubkey(a.token_eta.enc_pubkey)
        .plaintext_u128(a.token_eta.nonce)
        .encrypted_u64(a.token_eta.balance_ct)
        .x25519_pubkey(a.usdc_eta.enc_pubkey)
        .plaintext_u128(a.usdc_eta.nonce)
        .encrypted_u64(a.usdc_eta.balance_ct)
        .x25519_pubkey(a.token_eta.enc_pubkey)
        .plaintext_u128(deposit_nonce)
        .encrypted_u64(deposit_ct[0])
        .encrypted_u64(deposit_ct[1])
        .plaintext_u64(total_supply)
        .build();

    let writable = |pubkey| CallbackAccount {
        pubkey,
        is_writable: true,
    };
    let callback_accounts = [
        writable(a.pool.key()),
        writable(a.token_eta.key()),
        writable(a.usdc_eta.key()),
        writable(a.lp_eta.key()),
        writable(a.lp_info.key()),
    ];
    a.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SeedPoolCallback::callback_ix(
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

#[callback_accounts("seed_pool")]
#[derive(Accounts)]
pub struct SeedPoolCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEED_POOL))]
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
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub lp_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut, constraint = lp_info.mint == pool.lp_mint)]
    pub lp_info: Box<Account<'info, TokenInfo>>,
}

pub fn seed_pool_callback_handler(
    ctx: Context<SeedPoolCallback>,
    output: SignedComputationOutputs<SeedPoolOutput>,
) -> Result<()> {
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;

    // A job that timed out and was replaced must not overwrite newer state.
    if a.pool.pending_computation != computation
        || a.token_eta.pending_computation != computation
        || a.usdc_eta.pending_computation != computation
        || a.lp_eta.pending_computation != computation
    {
        return Ok(());
    }
    a.pool.clear_pending();
    a.token_eta.clear_pending();
    a.usdc_eta.clear_pending();
    a.lp_eta.clear_pending();

    let mut event = PoolUpdated {
        pool: a.pool.key(),
        trader: a.token_eta.owner,
        kind: KIND_SEED,
        ok: false,
        price: a.pool.price,
        health: a.pool.health,
    };

    let result = match output.verify_output(&a.cluster_account, &a.computation_account) {
        Ok(SeedPoolOutput { field_0 }) => field_0,
        Err(_) => {
            emit!(event);
            return Ok(());
        }
    };
    let SeedPoolOutputStruct0 {
        field_0: token_bal,
        field_1: usdc_bal,
        field_2: lp_bal,
        field_3: reserves,
        field_4: stats,
    } = result;

    // Not enough funds: nothing moved, the pool stays open for another try.
    if !stats.field_0 {
        emit!(event);
        return Ok(());
    }

    let owner_key = a.token_eta.enc_pubkey;
    require!(
        token_bal.encryption_key == owner_key
            && usdc_bal.encryption_key == owner_key
            && lp_bal.encryption_key == owner_key,
        ErrorCode::EncryptionKeyMismatch
    );
    a.token_eta.set_balance(token_bal.ciphertexts[0], token_bal.nonce);
    a.usdc_eta.set_balance(usdc_bal.ciphertexts[0], usdc_bal.nonce);
    a.lp_eta.set_balance(lp_bal.ciphertexts[0], lp_bal.nonce);

    let price = price_e12(stats.field_1);
    let now = Clock::get()?.unix_timestamp;
    let pool = &mut a.pool;
    pool.reserves_ct = reserves.ciphertexts;
    pool.reserves_nonce = reserves.nonce;
    pool.health = stats.field_2;
    pool.push_price(price, now);
    pool.status = POOL_ACTIVE;
    pool.last_trade_at = now;

    a.lp_info.exchange_supply = a
        .lp_info
        .exchange_supply
        .checked_add(INITIAL_LP_SUPPLY)
        .ok_or(ErrorCode::Overflow)?;

    event.ok = true;
    event.price = price;
    event.health = stats.field_2;
    emit!(event);
    Ok(())
}
