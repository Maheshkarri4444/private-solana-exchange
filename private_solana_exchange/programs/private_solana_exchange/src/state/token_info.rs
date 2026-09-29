use anchor_lang::prelude::*;

/// Public facts about an exchange token. PDA("token", mint).
///
/// Exchange-created mints start with SPL supply 0. Tokens live inside encrypted
/// token accounts, and `exchange_supply` is their public total. Public tokens can
/// come back in via the vault (`shield`).
#[account]
#[derive(InitSpace)]
pub struct TokenInfo {
    pub mint: Pubkey,
    pub creator: Pubkey,
    /// Tokens inside the exchange (public number): all private balances, plus
    /// shield deposits whose credit is still on its way.
    pub exchange_supply: u64,
    /// Cap on the circulating supply (see `circulating`). `u64::MAX` for fake
    /// USDC, 0 for outside tokens (never minted here).
    pub max_supply: u64,
    pub is_usdc: bool,
    pub created_at: i64,
    pub bump: u8,
    /// A mint this program did not create: it is never minted, only held in the vault.
    pub is_external: bool,
    /// Public tokens deposited into this program's vault by `shield`.
    pub vault_amount: u64,
    pub reserved: [u8; 55],
}

impl TokenInfo {
    /// Tokens in circulation: private balances plus public ones outside the
    /// vault (the vault's tokens are already counted as private balances).
    pub fn circulating(&self, mint_supply: u64) -> Option<u64> {
        self.exchange_supply
            .checked_add(mint_supply.saturating_sub(self.vault_amount))
    }
}
