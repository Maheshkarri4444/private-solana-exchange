//! Private order book: limit orders whose side, price and size stay encrypted.
//!
//! - `create_order_book`  the token's creator opens a TOKEN/USDC book.
//! - `place_order`        Arcium locks the order's funds from your encrypted
//!                        balance, adds it to the book and matches the book.
//! - `settle_order`       collects your fills into your balances; with `cancel`
//!                        it also returns what is still locked and frees the slot.
//!
//! Every action rewrites both of the trader's balances and the whole book, so
//! observers can't tell a buy from a sell, or whether anything traded.

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::*,
    error::ErrorCode,
    events::{OrderPlaced, OrderRejected, OrderSettled},
    state::*,
    ArciumSignerAccount, ID, ID_CONST,
};

// ---------------------------------------------------------------- create

#[derive(Accounts)]
pub struct CreateOrderBook<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [TOKEN_SEED, token_info.mint.as_ref()],
        bump = token_info.bump,
        constraint = token_info.creator == creator.key() @ ErrorCode::NotTokenCreator,
        constraint = !token_info.is_usdc @ ErrorCode::InvalidMarket,
    )]
    pub token_info: Box<Account<'info, TokenInfo>>,

    #[account(
        init,
        payer = creator,
        space = 8 + OrderBook::INIT_SPACE,
        seeds = [BOOK_SEED, token_info.mint.as_ref()],
        bump,
    )]
    pub book: Box<Account<'info, OrderBook>>,

    #[account(
        init,
        payer = creator,
        space = 8 + OrderViews::INIT_SPACE,
        seeds = [BOOK_VIEWS_SEED, book.key().as_ref()],
        bump,
    )]
    pub views: Box<Account<'info, OrderViews>>,

    pub system_program: Program<'info, System>,
}

pub fn create_order_book_handler(ctx: Context<CreateOrderBook>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let book = &mut ctx.accounts.book;
    book.token_mint = ctx.accounts.token_info.mint;
    book.creator = ctx.accounts.creator.key();
    book.created_at = now;
    book.last_activity_at = now;
    book.bump = ctx.bumps.book;
    book.views_bump = ctx.bumps.views;
    ctx.accounts.views.book = book.key();
    ctx.accounts.views.bump = ctx.bumps.views;
    Ok(())
}

/// The book's OrderViews address (the callback writes each owner's copy there).
fn views_address(book: &Account<OrderBook>) -> Result<Pubkey> {
    Pubkey::create_program_address(
        &[BOOK_VIEWS_SEED, book.key().as_ref(), &[book.views_bump]],
        &ID,
    )
    .map_err(|_| error!(ErrorCode::WrongAccount))
}

// ---------------------------------------------------------------- place

#[queue_computation_accounts("place_order", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct PlaceOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Checked in the handler instead of by constraints: Solana's 4 KB stack.
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub book: Box<Account<'info, OrderBook>>,
    /// Must exist (see `open_account`).
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    /// Must exist (see `open_account`).
    #[account(mut)]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ORDER))]
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

/// The checks every book action shares: the trader's own two accounts for this
/// market, not busy and not frozen by a move to wallet.
fn check_trader(
    config: &Config,
    book: &OrderBook,
    usdc_eta: &EncryptedTokenAccount,
    token_eta: &EncryptedTokenAccount,
    trader: &Pubkey,
    slot: u64,
) -> Result<()> {
    require_keys_eq!(config.usdc_mint, usdc_eta.mint, ErrorCode::WrongAccount);
    require!(
        usdc_eta.owner == *trader && token_eta.owner == *trader && token_eta.mint == book.token_mint,
        ErrorCode::WrongAccount
    );
    require!(!usdc_eta.is_frozen() && !token_eta.is_frozen(), ErrorCode::AccountFrozen);
    require!(
        !book.is_locked(slot) && !usdc_eta.is_locked(slot) && !token_eta.is_locked(slot),
        ErrorCode::AccountBusy
    );
    Ok(())
}

pub fn place_order_handler(
    ctx: Context<PlaceOrder>,
    computation_offset: u64,
    order_ct: [[u8; 32]; 3],
    order_nonce: u128,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;
    let trader = a.payer.key();
    check_trader(&a.config, &a.book, &a.usdc_eta, &a.token_eta, &trader, slot)?;
    require!(
        a.book.open_orders_of(&trader) < MAX_ORDERS_PER_USER as usize,
        ErrorCode::TooManyOrders
    );
    let book_slot = a.book.free_slot().ok_or(ErrorCode::BookFull)?;
    let ages = a.book.ages(Some(book_slot));

    a.book.lock(computation, slot, BOOK_KIND_PLACE, book_slot);
    a.usdc_eta.lock(computation, slot);
    a.token_eta.lock(computation, slot);

    // Order must match the circuit's parameters.
    let mut args = ArgBuilder::new()
        .x25519_pubkey(a.usdc_eta.enc_pubkey)
        .plaintext_u128(a.usdc_eta.nonce)
        .encrypted_u64(a.usdc_eta.balance_ct)
        .plaintext_bool(a.usdc_eta.is_initialized)
        .x25519_pubkey(a.token_eta.enc_pubkey)
        .plaintext_u128(a.token_eta.nonce)
        .encrypted_u64(a.token_eta.balance_ct)
        .plaintext_bool(a.token_eta.is_initialized)
        .x25519_pubkey(a.usdc_eta.enc_pubkey)
        .plaintext_u128(order_nonce)
        .encrypted_bool(order_ct[0])
        .encrypted_u64(order_ct[1])
        .encrypted_u32(order_ct[2])
        .plaintext_u128(a.book.book_nonce)
        .account(a.book.key(), OrderBook::BOOK_OFFSET, OrderBook::BOOK_LEN)
        .plaintext_bool(a.book.initialized)
        .plaintext_u8(book_slot);
    for age in ages {
        args = args.plaintext_u8(age);
    }

    let writable = |pubkey| CallbackAccount {
        pubkey,
        is_writable: true,
    };
    let callback_accounts = [
        writable(a.book.key()),
        writable(views_address(&a.book)?),
        writable(a.usdc_eta.key()),
        writable(a.token_eta.key()),
    ];
    a.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        vec![PlaceOrderCallback::callback_ix(
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

#[callback_accounts("place_order")]
#[derive(Accounts)]
pub struct PlaceOrderCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ORDER))]
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
    pub book: Box<Account<'info, OrderBook>>,
    #[account(mut, constraint = views.book == book.key() @ ErrorCode::WrongAccount)]
    pub views: Box<Account<'info, OrderViews>>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,
}

pub fn place_order_callback_handler(
    ctx: Context<PlaceOrderCallback>,
    output: SignedComputationOutputs<PlaceOrderOutput>,
) -> Result<()> {
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;
    // A job that timed out and was replaced must not overwrite newer state.
    if a.book.pending_computation != computation
        || a.usdc_eta.pending_computation != computation
        || a.token_eta.pending_computation != computation
    {
        return Ok(());
    }
    a.book.clear_pending();
    a.usdc_eta.clear_pending();
    a.token_eta.clear_pending();

    let rejected = OrderRejected {
        book: a.book.key(),
        owner: a.usdc_eta.owner,
    };
    let result = match output.verify_output(&a.cluster_account, &a.computation_account) {
        Ok(PlaceOrderOutput { field_0 }) => field_0,
        Err(_) => {
            emit!(rejected);
            return Ok(());
        }
    };
    let PlaceOrderOutputStruct0 {
        field_0: usdc_bal,
        field_1: token_bal,
        field_2: book_state,
        field_3: view,
        field_4: ok,
    } = result;
    // Not enough balance, or a zero price / size: nothing changed.
    if !ok {
        emit!(rejected);
        return Ok(());
    }

    let owner_key = a.usdc_eta.enc_pubkey;
    require!(
        usdc_bal.encryption_key == owner_key
            && token_bal.encryption_key == owner_key
            && view.encryption_key == owner_key,
        ErrorCode::EncryptionKeyMismatch
    );
    a.usdc_eta.set_balance(usdc_bal.ciphertexts[0], usdc_bal.nonce);
    a.token_eta.set_balance(token_bal.ciphertexts[0], token_bal.nonce);

    let owner = a.usdc_eta.owner;
    let book = &mut a.book;
    let slot = book.pending_slot;
    book.book_ct = book_state.ciphertexts;
    book.book_nonce = book_state.nonce;
    book.initialized = true;
    book.occupy(slot, owner);
    book.last_activity_at = Clock::get()?.unix_timestamp;
    a.views.views[slot as usize] = view.ciphertexts;
    a.views.nonces[slot as usize] = view.nonce;

    emit!(OrderPlaced {
        book: a.book.key(),
        owner,
        slot,
    });
    Ok(())
}

// ---------------------------------------------------------------- settle / cancel

#[queue_computation_accounts("settle_order", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SettleOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    // Checked in the handler instead of by constraints: Solana's 4 KB stack.
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub book: Box<Account<'info, OrderBook>>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SETTLE_ORDER))]
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

pub fn settle_order_handler(
    ctx: Context<SettleOrder>,
    computation_offset: u64,
    book_slot: u8,
    cancel: bool,
) -> Result<()> {
    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;
    let trader = a.payer.key();
    check_trader(&a.config, &a.book, &a.usdc_eta, &a.token_eta, &trader, slot)?;
    let i = book_slot as usize;
    require!(
        i < BOOK_SLOTS && a.book.seqs[i] != 0 && a.book.owners[i] == trader,
        ErrorCode::NotOrderOwner
    );

    let kind = if cancel { BOOK_KIND_CANCEL } else { BOOK_KIND_SETTLE };
    a.book.lock(computation, slot, kind, book_slot);
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
        .plaintext_u128(a.book.book_nonce)
        .account(a.book.key(), OrderBook::BOOK_OFFSET, OrderBook::BOOK_LEN)
        .plaintext_u8(book_slot)
        .plaintext_bool(cancel)
        .build();

    let writable = |pubkey| CallbackAccount {
        pubkey,
        is_writable: true,
    };
    let callback_accounts = [
        writable(a.book.key()),
        writable(views_address(&a.book)?),
        writable(a.usdc_eta.key()),
        writable(a.token_eta.key()),
    ];
    a.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SettleOrderCallback::callback_ix(
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

#[callback_accounts("settle_order")]
#[derive(Accounts)]
pub struct SettleOrderCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SETTLE_ORDER))]
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
    pub book: Box<Account<'info, OrderBook>>,
    #[account(mut, constraint = views.book == book.key() @ ErrorCode::WrongAccount)]
    pub views: Box<Account<'info, OrderViews>>,
    #[account(mut)]
    pub usdc_eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut)]
    pub token_eta: Box<Account<'info, EncryptedTokenAccount>>,
}

pub fn settle_order_callback_handler(
    ctx: Context<SettleOrderCallback>,
    output: SignedComputationOutputs<SettleOrderOutput>,
) -> Result<()> {
    let computation = ctx.accounts.computation_account.key();
    let a = &mut *ctx.accounts;
    if a.book.pending_computation != computation
        || a.usdc_eta.pending_computation != computation
        || a.token_eta.pending_computation != computation
    {
        return Ok(());
    }
    a.book.clear_pending();
    a.usdc_eta.clear_pending();
    a.token_eta.clear_pending();

    // On failure nothing changed; the owner can simply try again.
    let Ok(SettleOrderOutput { field_0: result }) =
        output.verify_output(&a.cluster_account, &a.computation_account)
    else {
        return Ok(());
    };
    let SettleOrderOutputStruct0 {
        field_0: usdc_bal,
        field_1: token_bal,
        field_2: book_state,
        field_3: view,
    } = result;

    let owner_key = a.usdc_eta.enc_pubkey;
    require!(
        usdc_bal.encryption_key == owner_key
            && token_bal.encryption_key == owner_key
            && view.encryption_key == owner_key,
        ErrorCode::EncryptionKeyMismatch
    );
    a.usdc_eta.set_balance(usdc_bal.ciphertexts[0], usdc_bal.nonce);
    a.token_eta.set_balance(token_bal.ciphertexts[0], token_bal.nonce);

    let owner = a.usdc_eta.owner;
    let book = &mut a.book;
    let slot = book.pending_slot;
    let cancelled = book.pending_kind == BOOK_KIND_CANCEL;
    book.book_ct = book_state.ciphertexts;
    book.book_nonce = book_state.nonce;
    if cancelled {
        book.free(slot);
    }
    book.last_activity_at = Clock::get()?.unix_timestamp;
    // A cancelled slot's copy becomes all zeros (the circuit empties it).
    a.views.views[slot as usize] = view.ciphertexts;
    a.views.nonces[slot as usize] = view.nonce;

    emit!(OrderSettled {
        book: a.book.key(),
        owner,
        slot,
        cancelled,
    });
    Ok(())
}
