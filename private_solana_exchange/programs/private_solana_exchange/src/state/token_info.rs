use anchor_lang::prelude::*;

/// Public facts about an exchange token. PDA("token", mint).
///
/// The real SPL mint starts with supply 0. Tokens live inside encrypted token
/// accounts, and `exchange_supply` is their public total.
#[account]
#[derive(InitSpace)]
pub struct TokenInfo {
    pub mint: Pubkey,
    pub creator: Pubkey,
    /// Sum of all private ETA balances of this token (public).
    pub exchange_supply: u64,
    /// Cap on `exchange_supply`. `u64::MAX` for fake USDC.
    pub max_supply: u64,
    pub is_usdc: bool,
    pub created_at: i64,
    pub bump: u8,
    pub reserved: [u8; 64],
}
