use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;

use crate::{constants::*, error::ErrorCode, state::Config, ID};

/// Registers the `credit_balance` circuit with Arcium (once, by the admin).
///
/// `circuit_url = None` → the circuit is uploaded on-chain afterwards.
/// `circuit_url = Some(url)` → Arcium nodes download it from `url` and check its hash.
#[init_computation_definition_accounts("credit_balance", payer)]
#[derive(Accounts)]
pub struct InitCreditBalanceCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == payer.key() @ ErrorCode::NotAdmin,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by the arcium program (not initialized yet).
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by the arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

pub fn init_credit_balance_comp_def_handler(
    ctx: Context<InitCreditBalanceCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("credit_balance"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}
