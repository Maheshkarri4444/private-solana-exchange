//! Public SPL tokens → private balance.
//!
//! Tokens already in public wallets can't be burned and re-minted (and the
//! program can't mint external tokens at all), so they move into this
//! program's vault (one token account per mint) and Arcium credits the same
//! amount to the owner's encrypted balance. Moving them back out (`unshield`)
//! pays from the vault first and mints only what the vault lacks, and only for
//! mints this program created.
//!
//! - `register_external_token`  any SPL mint the exchange didn't create
//! - `open_vault`               the program's token account for a mint
//! - `shield`                   public → private

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::*,
    error::ErrorCode,
    events::Shielded,
    instructions::mint_private::CreditBalanceCallback,
    state::*,
    ArciumSignerAccount, ID, ID_CONST,
};

#[derive(Accounts)]
pub struct RegisterExternalToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// Exchange-created mints already have one, so this only works for outside mints.
    #[account(
        init,
        payer = payer,
        space = 8 + TokenInfo::INIT_SPACE,
        seeds = [TOKEN_SEED, mint.key().as_ref()],
        bump,
    )]
    pub token_info: Box<Account<'info, TokenInfo>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn register_external_token_handler(ctx: Context<RegisterExternalToken>) -> Result<()> {
    let info = &mut ctx.accounts.token_info;
    info.mint = ctx.accounts.mint.key();
    info.creator = Pubkey::default(); // nobody: it can't be minted here or get a pool
    info.exchange_supply = 0;
    info.max_supply = 0;
    info.is_usdc = false;
    info.is_external = true;
    info.created_at = Clock::get()?.unix_timestamp;
    info.bump = ctx.bumps.token_info;
    Ok(())
}

#[derive(Accounts)]
pub struct OpenVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [TOKEN_SEED, mint.key().as_ref()], bump = token_info.bump)]
    pub token_info: Box<Account<'info, TokenInfo>>,
    #[account(mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: the program's signing PDA; it owns every vault (and signs mints).
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = mint_authority,
        token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn open_vault_handler(_ctx: Context<OpenVault>) -> Result<()> {
    Ok(())
}

#[queue_computation_accounts("credit_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Shield<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, seeds = [TOKEN_SEED, token_info.mint.as_ref()], bump = token_info.bump)]
    pub token_info: Box<Account<'info, TokenInfo>>,
    /// CHECK: the token's creator. A pool (an account of this program) means an
    /// LP token, which stays private.
    #[account(address = token_info.creator)]
    pub token_creator: UncheckedAccount<'info>,
    #[account(address = token_info.mint, mint::token_program = token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub source: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [VAULT_SEED, mint.key().as_ref()], bump)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Must exist (see `open_account`).
    #[account(
        mut,
        constraint = eta.owner == payer.key() && eta.mint == token_info.mint @ ErrorCode::WrongAccount,
    )]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,

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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_BALANCE))]
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

/// Moves `amount` public tokens into the vault and credits them privately.
/// `amount = 0` re-sends a deposit whose MPC credit failed earlier.
pub fn shield_handler(ctx: Context<Shield>, computation_offset: u64, amount: u64) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    require!(*ctx.accounts.token_creator.owner != ID, ErrorCode::LpTokensStayPrivate);
    require!(!ctx.accounts.eta.is_frozen(), ErrorCode::AccountFrozen);
    require!(!ctx.accounts.eta.is_locked(slot), ErrorCode::AccountBusy);

    // Credit what actually arrived (a token with a transfer fee delivers less).
    let before = ctx.accounts.vault.amount;
    if amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.source.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        ctx.accounts.vault.reload()?;
    }
    let received = ctx.accounts.vault.amount.saturating_sub(before);

    // From here the tokens are inside the exchange (owed to the owner until the
    // credit lands), so they count in the private supply right away.
    let a = &mut *ctx.accounts;
    let info = &mut a.token_info;
    info.vault_amount = info.vault_amount.checked_add(received).ok_or(ErrorCode::Overflow)?;
    info.exchange_supply = info.exchange_supply.checked_add(received).ok_or(ErrorCode::Overflow)?;
    let eta = &mut a.eta;
    eta.shield_owed = eta.shield_owed.checked_add(received).ok_or(ErrorCode::Overflow)?;
    require!(eta.shield_owed > 0, ErrorCode::NothingToShield);
    eta.lock(computation, slot);
    eta.pending_amount = eta.shield_owed;
    eta.credit_kind = CREDIT_SHIELD;

    // Same MPC job as a faucet mint: balance + amount (the amount is public;
    // it came from a public wallet).
    let args = ArgBuilder::new()
        .x25519_pubkey(eta.enc_pubkey)
        .plaintext_u128(eta.nonce)
        .encrypted_u64(eta.balance_ct)
        .plaintext_bool(eta.is_initialized)
        .plaintext_u64(eta.shield_owed)
        .build();
    emit!(Shielded {
        owner: eta.owner,
        mint: eta.mint,
        amount: received,
    });

    let eta_key = eta.key();
    let token_info_key = a.token_info.key();
    a.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![CreditBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: eta_key,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: token_info_key,
                    is_writable: true,
                },
            ],
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}
