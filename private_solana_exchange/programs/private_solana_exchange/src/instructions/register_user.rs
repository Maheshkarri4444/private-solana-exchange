use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, events::UserRegistered, state::UserAccount};

/// Stores the user's x25519 public key (derived in the browser from a wallet signature).
#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [USER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub user_account: Box<Account<'info, UserAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn register_user_handler(ctx: Context<RegisterUser>, enc_pubkey: [u8; 32]) -> Result<()> {
    require!(enc_pubkey != [0u8; 32], ErrorCode::InvalidEncryptionKey);

    let user = &mut ctx.accounts.user_account;
    user.owner = ctx.accounts.owner.key();
    user.enc_pubkey = enc_pubkey;
    user.bump = ctx.bumps.user_account;

    emit!(UserRegistered {
        owner: user.owner,
        enc_pubkey,
    });
    Ok(())
}
