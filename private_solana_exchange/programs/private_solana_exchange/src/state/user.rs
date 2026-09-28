use anchor_lang::prelude::*;

/// A registered user. PDA("user", wallet).
#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub owner: Pubkey,
    /// x25519 public key derived from the user's wallet signature.
    /// Every balance of this user is encrypted to it (Arcium "Shared" mode).
    pub enc_pubkey: [u8; 32],
    pub bump: u8,
    pub reserved: [u8; 64],
}
