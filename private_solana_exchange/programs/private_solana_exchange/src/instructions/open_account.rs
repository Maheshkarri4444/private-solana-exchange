use anchor_lang::prelude::*;

use crate::{constants::*, state::*};

/// Opens an empty encrypted token account (balance 0) for the caller.
///
/// Swaps and pool seeding need their ETAs to exist already; creating them here
/// keeps those instructions within Solana's stack limit. Clients add this
/// instruction in front of a swap when the account is missing.
#[derive(Accounts)]
pub struct OpenAccount<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [USER_SEED, owner.key().as_ref()], bump = user_account.bump)]
    pub user_account: Box<Account<'info, UserAccount>>,

    #[account(seeds = [TOKEN_SEED, token_info.mint.as_ref()], bump = token_info.bump)]
    pub token_info: Box<Account<'info, TokenInfo>>,

    #[account(
        init,
        payer = owner,
        space = 8 + EncryptedTokenAccount::INIT_SPACE,
        seeds = [ETA_SEED, owner.key().as_ref(), token_info.mint.as_ref()],
        bump,
    )]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,

    pub system_program: Program<'info, System>,
}

pub fn open_account_handler(ctx: Context<OpenAccount>) -> Result<()> {
    ctx.accounts.eta.init_if_new(
        ctx.accounts.owner.key(),
        ctx.accounts.token_info.mint,
        ctx.accounts.user_account.enc_pubkey,
        ctx.bumps.eta,
    );
    Ok(())
}
