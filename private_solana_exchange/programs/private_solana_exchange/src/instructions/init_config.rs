use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

use super::shared::{init_mint_metadata, validate_metadata};
use crate::{constants::*, state::*};

/// One-time setup: global config + the fake USDC mint.
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: data-less PDA that signs as mint authority for every exchange mint.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [USDC_MINT_SEED],
        bump,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = mint_authority,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = mint_authority,
        extensions::metadata_pointer::metadata_address = usdc_mint,
    )]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = admin,
        space = 8 + TokenInfo::INIT_SPACE,
        seeds = [TOKEN_SEED, usdc_mint.key().as_ref()],
        bump,
    )]
    pub usdc_info: Box<Account<'info, TokenInfo>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn init_config_handler(ctx: Context<InitConfig>, usdc_uri: String) -> Result<()> {
    let name = "USD Coin (Test)".to_string();
    let symbol = "USDC".to_string();
    validate_metadata(&name, &symbol, &usdc_uri)?;

    let mint_authority_bump = ctx.bumps.mint_authority;
    init_mint_metadata(
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        &ctx.accounts.usdc_mint,
        &ctx.accounts.mint_authority.to_account_info(),
        &ctx.accounts.admin.to_account_info(),
        mint_authority_bump,
        name,
        symbol,
        usdc_uri,
    )?;

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.token_count = 0;
    config.bump = ctx.bumps.config;
    config.mint_authority_bump = mint_authority_bump;

    let usdc_info = &mut ctx.accounts.usdc_info;
    usdc_info.mint = ctx.accounts.usdc_mint.key();
    usdc_info.creator = ctx.accounts.admin.key();
    usdc_info.exchange_supply = 0;
    usdc_info.max_supply = u64::MAX;
    usdc_info.is_usdc = true;
    usdc_info.created_at = Clock::get()?.unix_timestamp;
    usdc_info.bump = ctx.bumps.usdc_info;
    Ok(())
}
