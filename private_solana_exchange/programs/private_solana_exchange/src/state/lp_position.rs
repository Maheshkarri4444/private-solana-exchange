use anchor_lang::prelude::*;

use crate::constants::ETA_LOCK_TIMEOUT_SLOTS;

/// One LP holder's fee position in one pool. PDA("lp_fees", pool, owner).
///
/// `checkpoint` is the pool's fee growth at the last payout (encrypted to the
/// cluster); `earned` is the holder's lifetime LP fees, encrypted to them.
#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    /// First two fields, so their offsets (8 and 40) are fixed for the MPC job.
    pub checkpoint_ct: [u8; 32],
    pub earned_ct: [u8; 32],
    pub checkpoint_nonce: u128,
    pub earned_nonce: u128,
    pub checkpoint_initialized: bool,
    pub earned_initialized: bool,
    pub pool: Pubkey,
    pub owner: Pubkey,
    /// The pool's trade count covered by the last payout (public).
    pub paid_swap_count: u64,
    pub paid_at: i64,
    pub pending_computation: Pubkey,
    pub pending_since_slot: u64,
    /// The pool's trade count when the pending payout was queued.
    pub pending_swap_count: u64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl LpPosition {
    pub const CHECKPOINT_OFFSET: u32 = 8;
    pub const EARNED_OFFSET: u32 = 40;

    pub fn is_locked(&self, current_slot: u64) -> bool {
        self.pending_computation != Pubkey::default()
            && current_slot < self.pending_since_slot.saturating_add(ETA_LOCK_TIMEOUT_SLOTS)
    }
}
