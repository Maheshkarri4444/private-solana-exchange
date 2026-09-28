//! Move tokens from an encrypted account to the owner's public wallet.
//!
//! 1. `prepare_unshield` — Arcium publishes a fingerprint of the balance,
//!    SHA3-256(balance ‖ salt), and gives the owner the salt (encrypted).
//!    The account is frozen from here until step 3 finishes.
//! 2. `unshield` — the owner proves in ZK "my fingerprinted balance ≥ amount"
//!    without revealing it. The program checks the proof and mints `amount`
//!    real SPL tokens to the owner's wallet.
//! 3. `finish_unshield` — Arcium subtracts `amount` from the encrypted balance
//!    and unfreezes the account. Sent in the same transaction as step 2, and
//!    callable again if the MPC job fails.
//!
//! `cancel_unshield` unfreezes an account that never got to step 2.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, Token2022, TokenAccount};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::*,
    error::ErrorCode,
    events::{UnshieldDebited, UnshieldReady, Unshielded},
    state::*,
    zk::{unshield_inputs, verify_unshield, Groth16Proof},
    ArciumSignerAccount, ID, ID_CONST,
};

// ---------------------------------------------------------------- step 1

#[queue_computation_accounts("commit_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct PrepareUnshield<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, constraint = eta.owner == payer.key() @ ErrorCode::WrongAccount)]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,

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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMMIT_BALANCE))]
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

pub fn prepare_unshield_handler(ctx: Context<PrepareUnshield>, computation_offset: u64) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let eta = &mut ctx.accounts.eta;

    require!(eta.is_initialized, ErrorCode::NoBalance);
    require!(!eta.is_frozen(), ErrorCode::AccountFrozen);
    require!(!eta.is_locked(slot), ErrorCode::AccountBusy);
    eta.lock(computation, slot);
    eta.unshield_state = UNSHIELD_COMMITTING;

    let args = ArgBuilder::new()
        .x25519_pubkey(eta.enc_pubkey)
        .plaintext_u128(eta.nonce)
        .encrypted_u64(eta.balance_ct)
        .build();
    let eta_key = eta.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![CommitBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: eta_key,
                is_writable: true,
            }],
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

#[callback_accounts("commit_balance")]
#[derive(Accounts)]
pub struct CommitBalanceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMMIT_BALANCE))]
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
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,
}

pub fn commit_balance_callback_handler(
    ctx: Context<CommitBalanceCallback>,
    output: SignedComputationOutputs<CommitBalanceOutput>,
) -> Result<()> {
    let eta = &mut ctx.accounts.eta;
    // Cancelled, or replaced after a timeout: ignore.
    if eta.pending_computation != ctx.accounts.computation_account.key() {
        return Ok(());
    }
    eta.clear_pending();

    let mut event = UnshieldReady {
        owner: eta.owner,
        mint: eta.mint,
        ok: false,
    };
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CommitBalanceOutput { field_0 }) => field_0,
        Err(_) => {
            // Nothing happened yet: unfreeze so the owner can retry.
            eta.clear_unshield();
            emit!(event);
            return Ok(());
        }
    };
    let CommitBalanceOutputStruct0 {
        field_0: salt,
        field_1: fingerprint,
    } = result;
    require!(
        salt.encryption_key == eta.enc_pubkey,
        ErrorCode::EncryptionKeyMismatch
    );

    eta.unshield_salt_ct = salt.ciphertexts[0];
    eta.unshield_salt_nonce = salt.nonce;
    eta.unshield_commitment = fingerprint;
    eta.unshield_state = UNSHIELD_READY;

    event.ok = true;
    emit!(event);
    Ok(())
}

// ---------------------------------------------------------------- step 2

#[derive(Accounts)]
pub struct Unshield<'info> {
    pub owner: Signer<'info>,

    #[account(mut, constraint = eta.owner == owner.key() @ ErrorCode::WrongAccount)]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,

    #[account(mut, constraint = token_info.mint == eta.mint @ ErrorCode::WrongAccount)]
    pub token_info: Box<Account<'info, TokenInfo>>,

    #[account(mut, address = eta.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Any token account of the owner for this mint (clients use the ATA).
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
        token::token_program = token_program,
    )]
    pub destination: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: data-less PDA that signs as mint authority for every exchange mint.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
}

pub fn unshield_handler(ctx: Context<Unshield>, amount: u64, proof: Groth16Proof) -> Result<()> {
    let a = &mut *ctx.accounts;
    require!(
        a.eta.unshield_state == UNSHIELD_READY,
        ErrorCode::WrongUnshieldStep
    );
    require!(amount > 0, ErrorCode::ZeroAmount);

    // The proof is bound to this account's fingerprint and to `amount`.
    verify_unshield(&proof, &unshield_inputs(&a.eta.unshield_commitment, amount))?;

    let signer_seeds: &[&[&[u8]]] = &[&[MINT_AUTHORITY_SEED, &[a.config.mint_authority_bump]]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            a.token_program.key(),
            MintTo {
                mint: a.mint.to_account_info(),
                to: a.destination.to_account_info(),
                authority: a.mint_authority.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Private supply goes down by exactly what the SPL supply went up.
    a.token_info.exchange_supply = a
        .token_info
        .exchange_supply
        .checked_sub(amount)
        .ok_or(ErrorCode::Overflow)?;

    // The fingerprint is single-use; the balance stays frozen until debited.
    let eta = &mut a.eta;
    eta.unshield_state = UNSHIELD_DEBITING;
    eta.unshield_amount = amount;
    eta.unshield_commitment = [0; 32];
    eta.unshield_salt_ct = [0; 32];
    eta.unshield_salt_nonce = 0;

    emit!(Unshielded {
        owner: eta.owner,
        mint: eta.mint,
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------- step 3

#[queue_computation_accounts("debit_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct FinishUnshield<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, constraint = eta.owner == payer.key() @ ErrorCode::WrongAccount)]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,

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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_BALANCE))]
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

pub fn finish_unshield_handler(ctx: Context<FinishUnshield>, computation_offset: u64) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let eta = &mut ctx.accounts.eta;

    require!(
        eta.unshield_state == UNSHIELD_DEBITING,
        ErrorCode::WrongUnshieldStep
    );
    require!(!eta.is_locked(slot), ErrorCode::AccountBusy);
    eta.lock(computation, slot);

    let args = ArgBuilder::new()
        .x25519_pubkey(eta.enc_pubkey)
        .plaintext_u128(eta.nonce)
        .encrypted_u64(eta.balance_ct)
        .plaintext_u64(eta.unshield_amount)
        .build();
    let eta_key = eta.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DebitBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: eta_key,
                is_writable: true,
            }],
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

#[callback_accounts("debit_balance")]
#[derive(Accounts)]
pub struct DebitBalanceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_BALANCE))]
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
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,
}

pub fn debit_balance_callback_handler(
    ctx: Context<DebitBalanceCallback>,
    output: SignedComputationOutputs<DebitBalanceOutput>,
) -> Result<()> {
    let eta = &mut ctx.accounts.eta;
    // Replaced after a timeout: ignore, the newer job will debit.
    if eta.pending_computation != ctx.accounts.computation_account.key() {
        return Ok(());
    }
    eta.clear_pending();

    let mut event = UnshieldDebited {
        owner: eta.owner,
        mint: eta.mint,
        ok: false,
    };
    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(DebitBalanceOutput { field_0 }) => field_0,
        Err(_) => {
            // Stays frozen: the tokens are already in the wallet, so the debit
            // must happen. `finish_unshield` can be sent again.
            emit!(event);
            return Ok(());
        }
    };
    require!(
        result.encryption_key == eta.enc_pubkey,
        ErrorCode::EncryptionKeyMismatch
    );

    eta.set_balance(result.ciphertexts[0], result.nonce);
    eta.clear_unshield();

    event.ok = true;
    emit!(event);
    Ok(())
}

// ---------------------------------------------------------------- cancel

#[derive(Accounts)]
pub struct CancelUnshield<'info> {
    pub owner: Signer<'info>,

    #[account(mut, constraint = eta.owner == owner.key() @ ErrorCode::WrongAccount)]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,
}

/// Unfreezes an account whose withdrawal never reached step 2. After step 2
/// the tokens are already in the wallet, so only `finish_unshield` can end it.
pub fn cancel_unshield_handler(ctx: Context<CancelUnshield>) -> Result<()> {
    let slot = Clock::get()?.slot;
    let eta = &mut ctx.accounts.eta;
    match eta.unshield_state {
        UNSHIELD_READY => {}
        // A commit job that never came back (its late result will be ignored).
        UNSHIELD_COMMITTING => {
            require!(!eta.is_locked(slot), ErrorCode::AccountBusy);
            eta.clear_pending();
        }
        _ => return err!(ErrorCode::WrongUnshieldStep),
    }
    eta.clear_unshield();
    Ok(())
}
