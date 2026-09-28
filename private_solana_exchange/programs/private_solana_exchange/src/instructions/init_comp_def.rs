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

/// Registers the `seed_pool` circuit. Same rules as `credit_balance`.
#[init_computation_definition_accounts("seed_pool", payer)]
#[derive(Accounts)]
pub struct InitSeedPoolCompDef<'info> {
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

pub fn init_seed_pool_comp_def_handler(
    ctx: Context<InitSeedPoolCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("seed_pool"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}

/// Registers the `swap` circuit. Same rules as `credit_balance`.
#[init_computation_definition_accounts("swap", payer)]
#[derive(Accounts)]
pub struct InitSwapCompDef<'info> {
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

pub fn init_swap_comp_def_handler(
    ctx: Context<InitSwapCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("swap"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}

/// Registers the `commit_balance` circuit. Same rules as `credit_balance`.
#[init_computation_definition_accounts("commit_balance", payer)]
#[derive(Accounts)]
pub struct InitCommitBalanceCompDef<'info> {
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

pub fn init_commit_balance_comp_def_handler(
    ctx: Context<InitCommitBalanceCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("commit_balance"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}

/// Registers the `debit_balance` circuit. Same rules as `credit_balance`.
#[init_computation_definition_accounts("debit_balance", payer)]
#[derive(Accounts)]
pub struct InitDebitBalanceCompDef<'info> {
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

pub fn init_debit_balance_comp_def_handler(
    ctx: Context<InitDebitBalanceCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("debit_balance"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}

/// Registers the `place_order` circuit. Same rules as `credit_balance`.
#[init_computation_definition_accounts("place_order", payer)]
#[derive(Accounts)]
pub struct InitPlaceOrderCompDef<'info> {
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

pub fn init_place_order_comp_def_handler(
    ctx: Context<InitPlaceOrderCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("place_order"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}

/// Registers the `settle_order` circuit. Same rules as `credit_balance`.
#[init_computation_definition_accounts("settle_order", payer)]
#[derive(Accounts)]
pub struct InitSettleOrderCompDef<'info> {
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

pub fn init_settle_order_comp_def_handler(
    ctx: Context<InitSettleOrderCompDef>,
    circuit_url: Option<String>,
) -> Result<()> {
    let source = circuit_url.map(|source| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source,
            hash: circuit_hash!("settle_order"),
        })
    });
    init_computation_def(ctx.accounts, source)?;
    Ok(())
}
