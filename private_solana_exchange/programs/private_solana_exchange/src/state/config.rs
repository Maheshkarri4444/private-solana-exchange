use anchor_lang::prelude::*;

/// Global exchange settings. PDA("config").
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub token_count: u64,
    pub bump: u8,
    pub mint_authority_bump: u8,
}
