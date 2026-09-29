use anchor_lang::prelude::*;

use crate::constants::{BOOK_CTS, BOOK_SLOTS, ETA_LOCK_TIMEOUT_SLOTS, VIEW_CTS};

pub const BOOK_KIND_PLACE: u8 = 0;
pub const BOOK_KIND_SETTLE: u8 = 1;
pub const BOOK_KIND_CANCEL: u8 = 2;

/// A private order book: one token against USDC. PDA("book", token_mint).
///
/// Every order's side, price, size and fills live in one ciphertext that only
/// Arcium can read. Public: which slots hold an order, whose, and in what order
/// they arrived.
#[account]
#[derive(InitSpace)]
pub struct OrderBook {
    /// All slots, packed and encrypted to Arcium. First field, so its offset is fixed.
    pub book_ct: [[u8; 32]; BOOK_CTS],
    pub book_nonce: u128,
    /// False until the first order: before that the book is empty.
    pub initialized: bool,
    pub token_mint: Pubkey,
    pub creator: Pubkey,
    /// Owner of each slot (default key = free).
    pub owners: [Pubkey; BOOK_SLOTS],
    /// Order number of each slot (0 = free). Lower = older = first in line.
    pub seqs: [u64; BOOK_SLOTS],
    pub orders_placed: u64,
    pub created_at: i64,
    pub last_activity_at: i64,
    pub pending_computation: Pubkey,
    pub pending_since_slot: u64,
    pub pending_kind: u8,
    pub pending_slot: u8,
    pub bump: u8,
    pub views_bump: u8,
    /// Slots that traded and wait for settlement (one bit per slot).
    pub settle_mask: u8,
    /// Last trade price (micro-USDC per token) and time: public, like on any exchange.
    pub last_price: u64,
    pub last_trade_at: i64,
    /// Orders that traded on arrival.
    pub trades: u64,
    pub reserved: [u8; 39],
}

/// Each owner's copy of their order, encrypted to them, as of their last
/// action (place / collect). PDA("book_views", book). Kept apart from the book
/// so placing an order stays within Solana's stack limit.
#[account]
#[derive(InitSpace)]
pub struct OrderViews {
    pub book: Pubkey,
    pub views: [[[u8; 32]; VIEW_CTS]; BOOK_SLOTS],
    pub nonces: [u128; BOOK_SLOTS],
    pub bump: u8,
}

impl OrderBook {
    pub const BOOK_OFFSET: u32 = 8;
    pub const BOOK_LEN: u32 = (BOOK_CTS * 32) as u32;

    pub fn is_locked(&self, current_slot: u64) -> bool {
        self.pending_computation != Pubkey::default()
            && current_slot < self.pending_since_slot.saturating_add(ETA_LOCK_TIMEOUT_SLOTS)
    }

    pub fn lock(&mut self, computation: Pubkey, slot: u64, kind: u8, book_slot: u8) {
        self.pending_computation = computation;
        self.pending_since_slot = slot;
        self.pending_kind = kind;
        self.pending_slot = book_slot;
    }

    pub fn clear_pending(&mut self) {
        self.pending_computation = Pubkey::default();
        self.pending_since_slot = 0;
    }

    pub fn free_slot(&self) -> Option<u8> {
        self.seqs.iter().position(|s| *s == 0).map(|i| i as u8)
    }

    pub fn open_orders_of(&self, owner: &Pubkey) -> usize {
        (0..BOOK_SLOTS)
            .filter(|&i| self.seqs[i] != 0 && self.owners[i] == *owner)
            .count()
    }

    /// Time priority for the circuit: 0 = oldest order.
    pub fn ages(&self) -> [u8; BOOK_SLOTS] {
        let seqs = self.seqs;
        let mut ages = [0u8; BOOK_SLOTS];
        for i in 0..BOOK_SLOTS {
            ages[i] = (0..BOOK_SLOTS)
                .filter(|&j| seqs[j] != 0 && seqs[j] < seqs[i])
                .count() as u8;
        }
        ages
    }

    pub fn occupy(&mut self, slot: u8, owner: Pubkey) {
        self.orders_placed += 1;
        self.owners[slot as usize] = owner;
        self.seqs[slot as usize] = self.orders_placed;
    }

    pub fn free(&mut self, slot: u8) {
        self.owners[slot as usize] = Pubkey::default();
        self.seqs[slot as usize] = 0;
        self.settle_mask &= !(1 << slot);
    }
}
