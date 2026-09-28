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

pub const COMP_DEF_OFFSET_CREDIT_BALANCE: u32 = comp_def_offset("credit_balance");
