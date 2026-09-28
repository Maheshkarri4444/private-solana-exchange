use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use super::shared::mint_supply;
use crate::{
    constants::*,
    error::ErrorCode,
    events::PoolUpdated,
    state::*,
    ArciumSignerAccount, ID, ID_CONST,
};

/// Buy (USDC → token) or sell (token → USDC) against a pool with private reserves.
/// The amount and slippage limit are encrypted in the trader's browser; Arcium
/// publishes only the new price and health.
#[queue_computation_accounts("swap", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct Swap<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Accounts are checked by field instead of re-deriving PDAs: these account
    // types are only ever created at their PDAs, and re-deriving them here would
    // exceed Solana's 4 KB stack frame.
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        constraint = pool.status == POOL_ACTIVE @ ErrorCode::PoolNotActive,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(constraint = token_info.mint == pool.token_mint)]
    pub token_info: Box<Account<'info, TokenInfo>>,

    /// CHECK: the pool's token mint; only its supply is read.
    #[account(address = pool.token_mint)]
    pub token_mint: UncheckedAccount<'info>,

    /// Must exist (see `open_account`).
    #[account(mut, constraint = usdc_eta.owner == payer.key() && usdc_eta.mint == config.usdc_mint)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,

    /// Must exist (see `open_account`).
    #[account(mut, constraint = token_eta.owner == payer.key() && token_eta.mint == pool.token_mint)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SWAP))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

/// Share of the input kept after the fee, out of 2^14 (what the circuit expects).
/// The fee rounds up, so the pool never charges less than advertised.
fn keep_q14(fee_bps: u16) -> u16 {
    let fee_q14 = (fee_bps as u32 * 16_384).div_ceil(10_000);
    (16_384 - fee_q14) as u16
}

pub fn swap_handler(
    ctx: Context<Swap>,
    computation_offset: u64,
    is_buy: bool,
    order_ct: [[u8; 32]; 3],
    order_nonce: u128,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let total_supply = ctx
        .accounts
        .token_info
        .exchange_supply
        .checked_add(mint_supply(&ctx.accounts.token_mint)?)
        .ok_or(ErrorCode::Overflow)?;

    let a = &mut *ctx.accounts;

    // Fail fast when the side being spent has never held anything.
    let spending = if is_buy { &a.usdc_eta } else { &a.token_eta };
    require!(spending.is_initialized, ErrorCode::NoBalance);
    require!(
        !a.usdc_eta.is_frozen() && !a.token_eta.is_frozen(),
        ErrorCode::AccountFrozen
    );
    require!(
        !a.pool.is_locked(slot) && !a.usdc_eta.is_locked(slot) && !a.token_eta.is_locked(slot),
        ErrorCode::AccountBusy
    );
    a.pool
        .lock(computation, slot, if is_buy { KIND_BUY } else { KIND_SELL });
    a.usdc_eta.lock(computation, slot);
    a.token_eta.lock(computation, slot);

    // Order must match the circuit's parameters.
    let args = ArgBuilder::new()
        .x25519_pubkey(a.usdc_eta.enc_pubkey)
        .plaintext_u128(a.usdc_eta.nonce)
        .encrypted_u64(a.usdc_eta.balance_ct)
        .plaintext_bool(a.usdc_eta.is_initialized)
        .x25519_pubkey(a.token_eta.enc_pubkey)
        .plaintext_u128(a.token_eta.nonce)
        .encrypted_u64(a.token_eta.balance_ct)
        .plaintext_bool(a.token_eta.is_initialized)
        .plaintext_u128(a.pool.reserves_nonce)
        .account(a.pool.key(), Pool::RESERVES_OFFSET, Pool::RESERVES_LEN)
        .x25519_pubkey(a.usdc_eta.enc_pubkey)
        .plaintext_u128(order_nonce)
        .encrypted_u64(order_ct[0])
        .encrypted_u64(order_ct[1])
        .encrypted_u64(order_ct[2])
        .plaintext_bool(is_buy)
        .plaintext_u16(keep_q14(a.pool.fee_bps))
        .plaintext_u64(total_supply)
        .build();

    let writable = |pubkey| CallbackAccount {
        pubkey,
        is_writable: true,
    };
    let callback_accounts = [
        writable(a.pool.key()),
        writable(a.usdc_eta.key()),
        writable(a.token_eta.key()),
    ];
    a.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SwapCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &callback_accounts,
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

#[callback_accounts("swap")]
#[derive(Accounts)]
pub struct SwapCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SWAP))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: address is validated by the Arcium program; verify_output reads slot data from it.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,
}

pub fn swap_callback_handler(
    ctx: Context<SwapCallback>,
    output: SignedComputationOutputs<SwapOutput>,
) -> Result<()> {
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;

    // A job that timed out and was replaced must not overwrite newer state.
    if a.pool.pending_computation != computation
        || a.usdc_eta.pending_computation != computation
        || a.token_eta.pending_computation != computation
    {
        return Ok(());
    }
    let kind = a.pool.pending_kind;
    a.pool.clear_pending();
    a.usdc_eta.clear_pending();
    a.token_eta.clear_pending();

    let mut event = PoolUpdated {
        pool: a.pool.key(),
        trader: a.usdc_eta.owner,
        kind,
        ok: false,
        price: a.pool.price,
        health: a.pool.health,
    };

    let result = match output.verify_output(&a.cluster_account, &a.computation_account) {
        Ok(SwapOutput { field_0 }) => field_0,
        Err(_) => {
            emit!(event);
            return Ok(());
        }
    };
    let SwapOutputStruct0 {
        field_0: usdc_bal,
        field_1: token_bal,
        field_2: reserves,
        field_3: stats,
    } = result;

    // Not enough balance or slippage exceeded: nothing moved, price unchanged.
    if !stats.field_0 {
        emit!(event);
        return Ok(());
    }

    let owner_key = a.usdc_eta.enc_pubkey;
    require!(
        usdc_bal.encryption_key == owner_key && token_bal.encryption_key == owner_key,
        ErrorCode::EncryptionKeyMismatch
    );
    a.usdc_eta.set_balance(usdc_bal.ciphertexts[0], usdc_bal.nonce);
    a.token_eta.set_balance(token_bal.ciphertexts[0], token_bal.nonce);

    let price = price_e12(stats.field_1);
    let now = Clock::get()?.unix_timestamp;
    let pool = &mut a.pool;
    pool.reserves_ct = reserves.ciphertexts;
    pool.reserves_nonce = reserves.nonce;
    pool.health = stats.field_2;
    pool.push_price(price, now);
    pool.swap_count = pool.swap_count.saturating_add(1);
    pool.last_trade_at = now;

    event.ok = true;
    event.price = price;
    event.health = stats.field_2;
    emit!(event);
    Ok(())
}
