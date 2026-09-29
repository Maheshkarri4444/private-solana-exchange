use anchor_lang::prelude::*;
use arcium_anchor::comp_def_offset;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const USER_SEED: &[u8] = b"user";
#[constant]
pub const TOKEN_SEED: &[u8] = b"token";
#[constant]
pub const ETA_SEED: &[u8] = b"eta";
#[constant]
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
#[constant]
pub const USDC_MINT_SEED: &[u8] = b"usdc_mint";

/// Every exchange token uses 6 decimals, like USDC, to keep pool and order math simple.
#[constant]
pub const TOKEN_DECIMALS: u8 = 6;

/// Largest single mint request: 1 billion whole tokens (6 decimals).
#[constant]
pub const MAX_MINT_PER_CALL: u64 = 1_000_000_000_000_000u64;

/// After this many slots (~2 min) a stuck ETA lock can be taken over by a new job.
pub const ETA_LOCK_TIMEOUT_SLOTS: u64 = 300;

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SYMBOL_LEN: usize = 10;
pub const MAX_URI_LEN: usize = 200;

#[constant]
pub const POOL_SEED: &[u8] = b"pool";
#[constant]
pub const LP_MINT_SEED: &[u8] = b"lp_mint";

/// LP minted to the creator when a pool is seeded: 1,000,000 LP (6 decimals).
/// Fixed on purpose — a √(token·usdc) supply would reveal the reserves.
#[constant]
pub const INITIAL_LP_SUPPLY: u64 = 1_000_000_000_000u64;

/// Pool fee limits in basis points: 0.10% – 10%.
#[constant]
pub const MIN_FEE_BPS: u16 = 10;
#[constant]
pub const MAX_FEE_BPS: u16 = 1_000;

/// Public prices kept on each pool for charts.
pub const PRICE_HISTORY_LEN: usize = 32;

pub const COMP_DEF_OFFSET_CREDIT_BALANCE: u32 = comp_def_offset("credit_balance");
pub const COMP_DEF_OFFSET_SEED_POOL: u32 = comp_def_offset("seed_pool");
pub const COMP_DEF_OFFSET_POOL_SWAP: u32 = comp_def_offset("pool_swap");
pub const COMP_DEF_OFFSET_LP_COLLECT: u32 = comp_def_offset("lp_collect");
pub const COMP_DEF_OFFSET_COMMIT_BALANCE: u32 = comp_def_offset("commit_balance");
pub const COMP_DEF_OFFSET_DEBIT_BALANCE: u32 = comp_def_offset("debit_balance");
pub const COMP_DEF_OFFSET_BOOK_PLACE: u32 = comp_def_offset("book_place");
pub const COMP_DEF_OFFSET_BOOK_SETTLE: u32 = comp_def_offset("book_settle");

#[constant]
pub const LP_POSITION_SEED: &[u8] = b"lp_fees";
/// Token account (one per mint) holding public tokens moved into the exchange.
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// fee × FEE_SCALE >> 24 = fee per LP unit × 2^40 (the LP supply is fixed).
pub const FEE_SCALE: u64 = u64::MAX / INITIAL_LP_SUPPLY;

#[constant]
pub const BOOK_SEED: &[u8] = b"book";
#[constant]
pub const BOOK_VIEWS_SEED: &[u8] = b"book_views";

/// Resting orders per book (must match BOOK_SLOTS in the circuits). The whole
/// book goes through one callback transaction, which caps its size.
pub const BOOK_SLOTS: usize = 8;
/// The packed, encrypted book: 8 slots fit in 8 ciphertexts.
pub const BOOK_CTS: usize = 8;
/// An owner's packed copy of their order: 1 ciphertext.
pub const VIEW_CTS: usize = 1;
/// Open orders one wallet may have in one book, so nobody can fill it alone.
#[constant]
pub const MAX_ORDERS_PER_USER: u8 = 3;

/// Order types (must match the circuits).
#[constant]
pub const ORDER_LIMIT: u8 = 0;
/// Fills now at the best prices up to its limit; the rest is returned.
#[constant]
pub const ORDER_MARKET: u8 = 1;
/// Only waits in the book; refused if it would trade immediately.
#[constant]
pub const ORDER_POST_ONLY: u8 = 2;
