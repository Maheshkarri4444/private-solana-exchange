use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

use super::shared::{init_mint_metadata, validate_metadata};
use crate::{constants::*, error::ErrorCode, events::PoolCreated, state::*};

/// Creates a token/USDC pool and its LP token (a real SPL mint, supply 0).
/// Liquidity goes in privately afterwards with `seed_pool`.
#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: data-less PDA that signs as mint authority.
    #[account(seeds = [MINT_AUTHORITY_SEED], bump = config.mint_authority_bump)]
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [TOKEN_SEED, token_info.mint.as_ref()],
        bump = token_info.bump,
        constraint = !token_info.is_usdc @ ErrorCode::CannotPoolUsdc,
        constraint = token_info.creator == creator.key() @ ErrorCode::NotPoolCreator,
    )]
    pub token_info: Box<Account<'info, TokenInfo>>,

    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED, token_info.mint.as_ref()],
        bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        init,
        payer = creator,
        seeds = [LP_MINT_SEED, pool.key().as_ref()],
        bump,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = mint_authority,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = mint_authority,
        extensions::metadata_pointer::metadata_address = lp_mint,
    )]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        space = 8 + TokenInfo::INIT_SPACE,
        seeds = [TOKEN_SEED, lp_mint.key().as_ref()],
        bump,
    )]
    pub lp_info: Box<Account<'info, TokenInfo>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

/// `token_symbol` / `token_uri` only label the LP token (display metadata).
pub fn create_pool_handler(
    ctx: Context<CreatePool>,
    fee_bps: u16,
    token_symbol: String,
    token_uri: String,
) -> Result<()> {
    require!(
        (MIN_FEE_BPS..=MAX_FEE_BPS).contains(&fee_bps),
        ErrorCode::InvalidFee
    );

    let lp_name = format!("{} / USDC LP", token_symbol);
    let lp_symbol = if token_symbol.len() + 2 <= MAX_SYMBOL_LEN {
        format!("{}LP", token_symbol)
    } else {
        "LP".to_string()
    };
    validate_metadata(&lp_name, &lp_symbol, &token_uri)?;

    init_mint_metadata(
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        &ctx.accounts.lp_mint,
        &ctx.accounts.mint_authority.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
        ctx.accounts.config.mint_authority_bump,
        lp_name,
        lp_symbol,
        token_uri,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let pool_key = ctx.accounts.pool.key();
    let lp_mint_key = ctx.accounts.lp_mint.key();

    // The pool PDA is the LP "creator": it can never sign, so nobody can
    // mint LP tokens through `mint_private`.
    let lp_info = &mut ctx.accounts.lp_info;
    lp_info.mint = lp_mint_key;
    lp_info.creator = pool_key;
    lp_info.exchange_supply = 0;
    lp_info.max_supply = u64::MAX;
    lp_info.is_usdc = false;
    lp_info.created_at = now;
    lp_info.bump = ctx.bumps.lp_info;

    let pool = &mut ctx.accounts.pool;
    pool.token_mint = ctx.accounts.token_info.mint;
    pool.lp_mint = lp_mint_key;
    pool.creator = ctx.accounts.creator.key();
    pool.fee_bps = fee_bps;
    pool.status = POOL_AWAITING_LIQUIDITY;
    pool.created_at = now;
    pool.bump = ctx.bumps.pool;
    pool.lp_mint_bump = ctx.bumps.lp_mint;

    emit!(PoolCreated {
        pool: pool_key,
        token_mint: pool.token_mint,
        lp_mint: lp_mint_key,
        fee_bps,
    });
    Ok(())
}
