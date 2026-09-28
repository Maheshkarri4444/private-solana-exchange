use anchor_lang::prelude::*;

#[event]
pub struct UserRegistered {
    pub owner: Pubkey,
    pub enc_pubkey: [u8; 32],
}

#[event]
pub struct TokenCreated {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub max_supply: u64,
}

#[event]
pub struct MintQueued {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub computation: Pubkey,
}

#[event]
pub struct BalanceCredited {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CreditFailed {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub token_mint: Pubkey,
    pub lp_mint: Pubkey,
    pub fee_bps: u16,
}

/// Emitted when a seed or swap finishes. Price and health are public; amounts are not.
#[event]
pub struct PoolUpdated {
    pub pool: Pubkey,
    pub trader: Pubkey,
    /// 0 = seed, 1 = buy, 2 = sell.
    pub kind: u8,
    pub ok: bool,
    pub price: u128,
    pub health: u8,
}

/// Arcium published a fingerprint of the balance; the owner can now prove.
#[event]
pub struct UnshieldReady {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub ok: bool,
}

/// A ZK proof was accepted and `amount` real SPL tokens were minted to the wallet.
#[event]
pub struct Unshielded {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

/// The encrypted balance was reduced by the unshielded amount.
#[event]
pub struct UnshieldDebited {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub ok: bool,
}

/// An order joined the book. Its side, price and size stay encrypted.
#[event]
pub struct OrderPlaced {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub slot: u8,
}

/// An order was refused (not enough balance, or a zero price / size).
#[event]
pub struct OrderRejected {
    pub book: Pubkey,
    pub owner: Pubkey,
}

/// An owner collected their fills, or cancelled (`cancelled`) and got the rest back.
#[event]
pub struct OrderSettled {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub slot: u8,
    pub cancelled: bool,
}
