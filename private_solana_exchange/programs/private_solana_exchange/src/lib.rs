pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
pub use constants::*;
pub use instructions::*;
pub use state::*;

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
}
