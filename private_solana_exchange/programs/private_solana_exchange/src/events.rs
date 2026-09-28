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
