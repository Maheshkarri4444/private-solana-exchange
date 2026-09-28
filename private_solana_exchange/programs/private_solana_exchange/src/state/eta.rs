use anchor_lang::prelude::*;

use crate::constants::ETA_LOCK_TIMEOUT_SLOTS;

/// Encrypted Token Account: one per (owner, mint). PDA("eta", owner, mint).
///
/// The balance is a Rescue ciphertext readable by the owner (with their x25519 key)
/// and by the Arcium MPC cluster. Only MPC callbacks ever write it.
#[account]
#[derive(InitSpace)]
pub struct EncryptedTokenAccount {
    /// Encrypted u64 balance. Kept as the first field so its byte offset stays fixed.
    pub balance_ct: [u8; 32],
    /// Nonce `balance_ct` was encrypted with. New on every update.
    pub nonce: u128,
    pub owner: Pubkey,
    pub mint: Pubkey,
    /// x25519 key the balance is encrypted to.
    pub enc_pubkey: [u8; 32],
    /// False until the first MPC write; until then the balance is zero.
    pub is_initialized: bool,
    /// Computation account of the in-flight MPC job, default when idle.
    pub pending_computation: Pubkey,
    pub pending_since_slot: u64,
    /// Public amount the in-flight job adds to the supply on success.
    pub pending_amount: u64,
    pub bump: u8,
    pub reserved: [u8; 128],
}

impl EncryptedTokenAccount {
    /// True while an MPC job is running on this account. A job that never
    /// came back stops blocking the account after `ETA_LOCK_TIMEOUT_SLOTS`.
    pub fn is_locked(&self, current_slot: u64) -> bool {
        self.pending_computation != Pubkey::default()
            && current_slot < self.pending_since_slot.saturating_add(ETA_LOCK_TIMEOUT_SLOTS)
    }

    pub fn clear_pending(&mut self) {
        self.pending_computation = Pubkey::default();
        self.pending_since_slot = 0;
        self.pending_amount = 0;
    }
}
