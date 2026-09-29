use anchor_lang::prelude::*;

use crate::constants::{ETA_LOCK_TIMEOUT_SLOTS, PRICE_HISTORY_LEN};

pub const POOL_AWAITING_LIQUIDITY: u8 = 0;
pub const POOL_ACTIVE: u8 = 1;

pub const KIND_SEED: u8 = 0;
pub const KIND_BUY: u8 = 1;
pub const KIND_SELL: u8 = 2;
/// Paying swap fees to an LP holder (`collect_lp_fees`).
pub const KIND_COLLECT: u8 = 3;

/// Arcium reveals the price as USDC per token (f64); pools store it scaled by 1e12.
pub fn price_e12(price: f64) -> u128 {
    (price * 1e12) as u128
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct PricePoint {
    pub price: u128,
    pub timestamp: i64,
}

/// A token/USDC constant-product pool. PDA("pool", token_mint).
///
/// Reserves are encrypted to the Arcium cluster only. Price and a coarse health
/// score are public; Arcium sets both after every seed and swap.
#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Encrypted {token, usdc} reserves. First field, so its byte offset is fixed at 8.
    pub reserves_ct: [[u8; 32]; 2],
    pub reserves_nonce: u128,
    pub token_mint: Pubkey,
    pub lp_mint: Pubkey,
    pub creator: Pubkey,
    pub fee_bps: u16,
    pub status: u8,
    /// USDC per whole token, scaled by 1e12.
    pub price: u128,
    /// Coarse 0–100 health score.
    pub health: u8,
    pub swap_count: u64,
    pub created_at: i64,
    pub last_trade_at: i64,
    /// Ring buffer of recent public prices, oldest overwritten first.
    pub price_history: [PricePoint; PRICE_HISTORY_LEN],
    pub history_len: u8,
    pub history_head: u8,
    /// Computation account of the in-flight MPC job, default when idle.
    pub pending_computation: Pubkey,
    pub pending_since_slot: u64,
    /// What the in-flight job is: 0 = seed, 1 = buy, 2 = sell, 3 = fee payout.
    pub pending_kind: u8,
    pub bump: u8,
    pub lp_mint_bump: u8,
    /// Swap fees owed to LP holders, per LP unit (× 2^40), encrypted to the
    /// cluster. False until the first trade that pays a fee.
    pub fee_growth_ct: [u8; 32],
    pub fee_growth_nonce: u128,
    pub fee_growth_initialized: bool,
    pub reserved: [u8; 15],
}

impl Pool {
    /// Byte offset of `reserves_ct`, read directly by the MPC job.
    pub const RESERVES_OFFSET: u32 = 8;
    pub const RESERVES_LEN: u32 = 64;
    /// Byte offset of `fee_growth_ct` (checked by a unit test below).
    pub const FEE_GROWTH_OFFSET: u32 = 1041;
    pub const FEE_GROWTH_LEN: u32 = 32;

    /// One MPC job per pool at a time; a job that never came back stops blocking
    /// after `ETA_LOCK_TIMEOUT_SLOTS`.
    pub fn is_locked(&self, current_slot: u64) -> bool {
        self.pending_computation != Pubkey::default()
            && current_slot < self.pending_since_slot.saturating_add(ETA_LOCK_TIMEOUT_SLOTS)
    }

    pub fn lock(&mut self, computation: Pubkey, slot: u64, kind: u8) {
        self.pending_computation = computation;
        self.pending_since_slot = slot;
        self.pending_kind = kind;
    }

    pub fn clear_pending(&mut self) {
        self.pending_computation = Pubkey::default();
        self.pending_since_slot = 0;
    }

    pub fn push_price(&mut self, price: u128, timestamp: i64) {
        self.price = price;
        self.price_history[self.history_head as usize] = PricePoint { price, timestamp };
        self.history_head = ((self.history_head as usize + 1) % PRICE_HISTORY_LEN) as u8;
        if (self.history_len as usize) < PRICE_HISTORY_LEN {
            self.history_len += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_growth_offset_matches_layout() {
        let mut pool = Pool {
            reserves_ct: [[0; 32]; 2],
            reserves_nonce: 0,
            token_mint: Pubkey::default(),
            lp_mint: Pubkey::default(),
            creator: Pubkey::default(),
            fee_bps: 0,
            status: 0,
            price: 0,
            health: 0,
            swap_count: 0,
            created_at: 0,
            last_trade_at: 0,
            price_history: [PricePoint::default(); PRICE_HISTORY_LEN],
            history_len: 0,
            history_head: 0,
            pending_computation: Pubkey::default(),
            pending_since_slot: 0,
            pending_kind: 0,
            bump: 0,
            lp_mint_bump: 0,
            fee_growth_ct: [0; 32],
            fee_growth_nonce: 0,
            fee_growth_initialized: false,
            reserved: [0; 15],
        };
        pool.fee_growth_ct = [7; 32];
        let mut data = Vec::new();
        pool.try_serialize(&mut data).unwrap();
        let at = Pool::FEE_GROWTH_OFFSET as usize;
        assert_eq!(&data[at..at + 32], &[7u8; 32]);
        assert_eq!(data.len(), 8 + Pool::INIT_SPACE);
    }
}
