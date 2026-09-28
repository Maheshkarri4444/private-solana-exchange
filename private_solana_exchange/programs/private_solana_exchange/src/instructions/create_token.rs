use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

use super::shared::{init_mint_metadata, validate_metadata};
use crate::{
    constants::*,
    error::ErrorCode,
    events::TokenCreated,
    state::{Config, TokenInfo},
};

/// Creates a real SPL mint (Token-2022 + metadata) with SPL supply 0.
/// The supply is then minted privately into the creator's ETA with `mint_private`.
#[derive(Accounts)]
pub struct CreateToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: data-less PDA that signs as mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        init,
        signer,
        payer = creator,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = mint_authority,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = mint_authority,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        space = 8 + TokenInfo::INIT_SPACE,
        seeds = [TOKEN_SEED, mint.key().as_ref()],
        bump,
    )]
    pub token_info: Box<Account<'info, TokenInfo>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn create_token_handler(
    ctx: Context<CreateToken>,
    name: String,
    symbol: String,
    uri: String,
    max_supply: u64,
) -> Result<()> {
    validate_metadata(&name, &symbol, &uri)?;
    require!(max_supply > 0, ErrorCode::ZeroAmount);
    require!(max_supply <= MAX_MINT_PER_CALL, ErrorCode::AmountTooLarge);

    init_mint_metadata(
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        &ctx.accounts.mint,
        &ctx.accounts.mint_authority.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
        ctx.accounts.config.mint_authority_bump,
        name,
        symbol,
        uri,
    )?;

    let token_info = &mut ctx.accounts.token_info;
    token_info.mint = ctx.accounts.mint.key();
    token_info.creator = ctx.accounts.creator.key();
    token_info.exchange_supply = 0;
    token_info.max_supply = max_supply;
    token_info.is_usdc = false;
    token_info.created_at = Clock::get()?.unix_timestamp;
    token_info.bump = ctx.bumps.token_info;

    let config = &mut ctx.accounts.config;
    config.token_count = config.token_count.checked_add(1).ok_or(ErrorCode::Overflow)?;

    emit!(TokenCreated {
        mint: token_info.mint,
        creator: token_info.creator,
        max_supply,
    });
    Ok(())
}
