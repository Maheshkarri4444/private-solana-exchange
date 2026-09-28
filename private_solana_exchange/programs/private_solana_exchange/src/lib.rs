pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod zk;

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use zk::Groth16Proof;

declare_id!("7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP");

#[arcium_program]
pub mod private_solana_exchange {
    use super::*;

    /// One-time setup: config + fake USDC mint.
    pub fn init_config(ctx: Context<InitConfig>, usdc_uri: String) -> Result<()> {
        init_config::init_config_handler(ctx, usdc_uri)
    }

    /// One-time setup: register the `credit_balance` MPC circuit.
    pub fn init_credit_balance_comp_def(
        ctx: Context<InitCreditBalanceCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_credit_balance_comp_def_handler(ctx, circuit_url)
    }

    /// Store the caller's x25519 encryption key.
    pub fn register_user(ctx: Context<RegisterUser>, enc_pubkey: [u8; 32]) -> Result<()> {
        register_user::register_user_handler(ctx, enc_pubkey)
    }

    /// Create a token: real SPL mint with metadata, SPL supply 0.
    pub fn create_token(
        ctx: Context<CreateToken>,
        name: String,
        symbol: String,
        uri: String,
        max_supply: u64,
    ) -> Result<()> {
        create_token::create_token_handler(ctx, name, symbol, uri, max_supply)
    }

    /// Mint fake USDC (anyone) or your own token (creator) into your encrypted account.
    pub fn mint_private(
        ctx: Context<MintPrivate>,
        computation_offset: u64,
        amount: u64,
    ) -> Result<()> {
        mint_private::mint_private_handler(ctx, computation_offset, amount)
    }

    #[arcium_callback(encrypted_ix = "credit_balance")]
    pub fn credit_balance_callback(
        ctx: Context<CreditBalanceCallback>,
        output: SignedComputationOutputs<CreditBalanceOutput>,
    ) -> Result<()> {
        mint_private::credit_balance_callback_handler(ctx, output)
    }

    /// One-time setup: register the `seed_pool` MPC circuit.
    pub fn init_seed_pool_comp_def(
        ctx: Context<InitSeedPoolCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_seed_pool_comp_def_handler(ctx, circuit_url)
    }

    /// One-time setup: register the `swap` MPC circuit.
    pub fn init_swap_comp_def(
        ctx: Context<InitSwapCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_swap_comp_def_handler(ctx, circuit_url)
    }

    /// Open an empty encrypted account for a token (needed before a first swap).
    pub fn open_account(ctx: Context<OpenAccount>) -> Result<()> {
        open_account::open_account_handler(ctx)
    }

    /// Create a token/USDC pool and its LP token. Creator only.
    pub fn create_pool(
        ctx: Context<CreatePool>,
        fee_bps: u16,
        token_symbol: String,
        token_uri: String,
    ) -> Result<()> {
        create_pool::create_pool_handler(ctx, fee_bps, token_symbol, token_uri)
    }

    /// Add the creator's initial liquidity privately (encrypted amounts).
    pub fn seed_pool(
        ctx: Context<SeedPool>,
        computation_offset: u64,
        deposit_ct: [[u8; 32]; 2],
        deposit_nonce: u128,
    ) -> Result<()> {
        seed_pool::seed_pool_handler(ctx, computation_offset, deposit_ct, deposit_nonce)
    }

    #[arcium_callback(encrypted_ix = "seed_pool")]
    pub fn seed_pool_callback(
        ctx: Context<SeedPoolCallback>,
        output: SignedComputationOutputs<SeedPoolOutput>,
    ) -> Result<()> {
        seed_pool::seed_pool_callback_handler(ctx, output)
    }

    /// Buy or sell privately (encrypted amount + slippage limit).
    pub fn swap(
        ctx: Context<Swap>,
        computation_offset: u64,
        is_buy: bool,
        order_ct: [[u8; 32]; 3],
        order_nonce: u128,
    ) -> Result<()> {
        swap::swap_handler(ctx, computation_offset, is_buy, order_ct, order_nonce)
    }

    #[arcium_callback(encrypted_ix = "swap")]
    pub fn swap_callback(
        ctx: Context<SwapCallback>,
        output: SignedComputationOutputs<SwapOutput>,
    ) -> Result<()> {
        swap::swap_callback_handler(ctx, output)
    }

    /// One-time setup: register the `commit_balance` MPC circuit.
    pub fn init_commit_balance_comp_def(
        ctx: Context<InitCommitBalanceCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_commit_balance_comp_def_handler(ctx, circuit_url)
    }

    /// One-time setup: register the `debit_balance` MPC circuit.
    pub fn init_debit_balance_comp_def(
        ctx: Context<InitDebitBalanceCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_debit_balance_comp_def_handler(ctx, circuit_url)
    }

    /// Move to wallet, step 1: Arcium fingerprints the balance and freezes the account.
    pub fn prepare_unshield(ctx: Context<PrepareUnshield>, computation_offset: u64) -> Result<()> {
        unshield::prepare_unshield_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "commit_balance")]
    pub fn commit_balance_callback(
        ctx: Context<CommitBalanceCallback>,
        output: SignedComputationOutputs<CommitBalanceOutput>,
    ) -> Result<()> {
        unshield::commit_balance_callback_handler(ctx, output)
    }

    /// Move to wallet, step 2: verify the ZK proof and mint real SPL tokens.
    pub fn unshield(ctx: Context<Unshield>, amount: u64, proof: Groth16Proof) -> Result<()> {
        unshield::unshield_handler(ctx, amount, proof)
    }

    /// Move to wallet, step 3: Arcium subtracts the amount and unfreezes the account.
    pub fn finish_unshield(ctx: Context<FinishUnshield>, computation_offset: u64) -> Result<()> {
        unshield::finish_unshield_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "debit_balance")]
    pub fn debit_balance_callback(
        ctx: Context<DebitBalanceCallback>,
        output: SignedComputationOutputs<DebitBalanceOutput>,
    ) -> Result<()> {
        unshield::debit_balance_callback_handler(ctx, output)
    }

    /// Unfreeze an account whose move to wallet stopped before step 2.
    pub fn cancel_unshield(ctx: Context<CancelUnshield>) -> Result<()> {
        unshield::cancel_unshield_handler(ctx)
    }

    /// One-time setup: register the `place_order` MPC circuit.
    pub fn init_place_order_comp_def(
        ctx: Context<InitPlaceOrderCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_place_order_comp_def_handler(ctx, circuit_url)
    }

    /// One-time setup: register the `settle_order` MPC circuit.
    pub fn init_settle_order_comp_def(
        ctx: Context<InitSettleOrderCompDef>,
        circuit_url: Option<String>,
    ) -> Result<()> {
        init_comp_def::init_settle_order_comp_def_handler(ctx, circuit_url)
    }

    /// Open a private TOKEN/USDC order book. Token creator only.
    pub fn create_order_book(ctx: Context<CreateOrderBook>) -> Result<()> {
        orders::create_order_book_handler(ctx)
    }

    /// Place a limit order; side, price and size are encrypted in the browser.
    pub fn place_order(
        ctx: Context<PlaceOrder>,
        computation_offset: u64,
        order_ct: [[u8; 32]; 3],
        order_nonce: u128,
    ) -> Result<()> {
        orders::place_order_handler(ctx, computation_offset, order_ct, order_nonce)
    }

    #[arcium_callback(encrypted_ix = "place_order")]
    pub fn place_order_callback(
        ctx: Context<PlaceOrderCallback>,
        output: SignedComputationOutputs<PlaceOrderOutput>,
    ) -> Result<()> {
        orders::place_order_callback_handler(ctx, output)
    }

    /// Collect an order's fills into your balances; `cancel` also refunds the rest.
    pub fn settle_order(
        ctx: Context<SettleOrder>,
        computation_offset: u64,
        slot: u8,
        cancel: bool,
    ) -> Result<()> {
        orders::settle_order_handler(ctx, computation_offset, slot, cancel)
    }

    #[arcium_callback(encrypted_ix = "settle_order")]
    pub fn settle_order_callback(
        ctx: Context<SettleOrderCallback>,
        output: SignedComputationOutputs<SettleOrderOutput>,
    ) -> Result<()> {
        orders::settle_order_callback_handler(ctx, output)
    }
}
