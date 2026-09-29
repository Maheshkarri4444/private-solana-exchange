use anchor_lang::prelude::*;

use crate::constants::ETA_LOCK_TIMEOUT_SLOTS;

/// `credit_kind`: where a pending credit comes from.
pub const CREDIT_MINT: u8 = 0;
pub const CREDIT_SHIELD: u8 = 1;

/// Unshield steps: idle → committing (MPC) → ready (prove) → debiting (MPC) → idle.
pub const UNSHIELD_NONE: u8 = 0;
pub const UNSHIELD_COMMITTING: u8 = 1;
pub const UNSHIELD_READY: u8 = 2;
pub const UNSHIELD_DEBITING: u8 = 3;

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

    // Moving tokens to a public wallet (see `unshield.rs`). While
    // `unshield_state` is not NONE the balance is frozen.
    pub unshield_state: u8,
    /// SHA3-256(balance ‖ salt), published by Arcium. The ZK proof opens it.
    pub unshield_commitment: [u8; 32],
    /// The salt, encrypted to the owner.
    pub unshield_salt_ct: [u8; 32],
    pub unshield_salt_nonce: u128,
    /// Amount already minted to the wallet and waiting to be debited.
    pub unshield_amount: u64,
    /// What the pending credit is: faucet / creator mint, or a shield deposit.
    pub credit_kind: u8,
    /// Tokens already moved into the vault by `shield` but not yet credited
    /// (credited by the MPC callback; re-sent if that job fails).
    pub shield_owed: u64,
    pub reserved: [u8; 30],
}

impl EncryptedTokenAccount {
    /// Fills in the static fields the first time the account is used.
    pub fn init_if_new(&mut self, owner: Pubkey, mint: Pubkey, enc_pubkey: [u8; 32], bump: u8) {
        if self.owner == Pubkey::default() {
            self.owner = owner;
            self.mint = mint;
            self.enc_pubkey = enc_pubkey;
            self.bump = bump;
        }
    }

    /// True while an MPC job is running on this account. A job that never
    /// came back stops blocking the account after `ETA_LOCK_TIMEOUT_SLOTS`.
    pub fn is_locked(&self, current_slot: u64) -> bool {
        self.pending_computation != Pubkey::default()
            && current_slot < self.pending_since_slot.saturating_add(ETA_LOCK_TIMEOUT_SLOTS)
    }

    pub fn lock(&mut self, computation: Pubkey, slot: u64) {
        self.pending_computation = computation;
        self.pending_since_slot = slot;
    }

    /// Stores an MPC-produced ciphertext (the only way a balance ever changes).
    pub fn set_balance(&mut self, ciphertext: [u8; 32], nonce: u128) {
        self.balance_ct = ciphertext;
        self.nonce = nonce;
        self.is_initialized = true;
    }

    /// True while a withdrawal to the public wallet is in progress. The balance
    /// must not change until it finishes, or the ZK proof would go stale.
    pub fn is_frozen(&self) -> bool {
        self.unshield_state != UNSHIELD_NONE
    }

    pub fn clear_unshield(&mut self) {
        self.unshield_state = UNSHIELD_NONE;
        self.unshield_commitment = [0; 32];
        self.unshield_salt_ct = [0; 32];
        self.unshield_salt_nonce = 0;
        self.unshield_amount = 0;
    }

    pub fn clear_pending(&mut self) {
        self.pending_computation = Pubkey::default();
        self.pending_since_slot = 0;
        self.pending_amount = 0;
    }
}
