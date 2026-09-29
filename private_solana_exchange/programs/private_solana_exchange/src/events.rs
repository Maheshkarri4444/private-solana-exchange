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

/// A new order was matched. Public: whether it now waits in the book, which
/// resting orders it traded with (one bit per slot) and its last trade price
/// (0 = no trade). Never its side or size.
#[event]
pub struct OrderPlaced {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub slot: u8,
    pub rests: bool,
    pub traded: u8,
    pub price: u64,
}

/// An order was refused (not enough balance, or a zero price / size).
#[event]
pub struct OrderRejected {
    pub book: Pubkey,
    pub owner: Pubkey,
}

/// An order's fills were settled into its owner's balances. `done`: it left
/// the book (fully filled, or `cancelled`).
#[event]
pub struct OrderSettled {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub slot: u8,
    pub cancelled: bool,
    pub done: bool,
}

/// An LP holder was paid their share of the swap fees (amounts encrypted to them).
#[event]
pub struct LpFeesPaid {
    pub pool: Pubkey,
    pub owner: Pubkey,
}

/// Public tokens moved into the vault; the owner's private balance is credited by Arcium.
#[event]
pub struct Shielded {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}
