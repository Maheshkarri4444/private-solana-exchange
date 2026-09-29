use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use super::shared::mint_supply;
use crate::{
    constants::*,
    error::ErrorCode,
    events::{BalanceCredited, CreditFailed, MintQueued},
    state::{EncryptedTokenAccount, TokenInfo, UserAccount, CREDIT_MINT, CREDIT_SHIELD},
    ArciumSignerAccount, ID, ID_CONST,
};

/// Mints tokens straight into the caller's encrypted token account (ETA).
///
/// - Fake USDC: anyone, any amount up to `MAX_MINT_PER_CALL`.
/// - Created tokens: only the creator, up to the token's max supply (counting
///   tokens already moved out to public wallets).
///
/// The amount is public (it changes the public supply); the resulting
/// balance is encrypted by the MPC and written back in the callback.
#[queue_computation_accounts("credit_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct MintPrivate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [USER_SEED, payer.key().as_ref()], bump = user_account.bump)]
    pub user_account: Box<Account<'info, UserAccount>>,

    #[account(seeds = [TOKEN_SEED, token_info.mint.as_ref()], bump = token_info.bump)]
    pub token_info: Box<Account<'info, TokenInfo>>,

    /// CHECK: the token's mint; only its supply is read (public tokens count
    /// toward the max supply too).
    #[account(address = token_info.mint)]
    pub token_mint: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + EncryptedTokenAccount::INIT_SPACE,
        seeds = [ETA_SEED, payer.key().as_ref(), token_info.mint.as_ref()],
        bump,
    )]
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,

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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_BALANCE))]
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

pub fn mint_private_handler(
    ctx: Context<MintPrivate>,
    computation_offset: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    require!(amount <= MAX_MINT_PER_CALL, ErrorCode::AmountTooLarge);

    let token_info = &ctx.accounts.token_info;
    let new_supply = token_info
        .circulating(mint_supply(&ctx.accounts.token_mint)?)
        .and_then(|c| c.checked_add(amount))
        .ok_or(ErrorCode::Overflow)?;
    if !token_info.is_usdc {
        require_keys_eq!(
            ctx.accounts.payer.key(),
            token_info.creator,
            ErrorCode::NotTokenCreator
        );
        require!(
            new_supply <= token_info.max_supply,
            ErrorCode::MaxSupplyExceeded
        );
    }

    let slot = Clock::get()?.slot;
    let computation = ctx.accounts.computation_account.key();
    let eta = &mut ctx.accounts.eta;

    eta.init_if_new(
        ctx.accounts.payer.key(),
        token_info.mint,
        ctx.accounts.user_account.enc_pubkey,
        ctx.bumps.eta,
    );
    require!(!eta.is_frozen(), ErrorCode::AccountFrozen);
    require!(!eta.is_locked(slot), ErrorCode::AccountBusy);
    eta.lock(computation, slot);
    eta.pending_amount = amount;
    eta.credit_kind = CREDIT_MINT;

    let args = ArgBuilder::new()
        .x25519_pubkey(eta.enc_pubkey)
        .plaintext_u128(eta.nonce)
        .encrypted_u64(eta.balance_ct)
        .plaintext_bool(eta.is_initialized)
        .plaintext_u64(amount)
        .build();

    emit!(MintQueued {
        owner: eta.owner,
        mint: eta.mint,
        amount,
        computation,
    });

    let eta_key = eta.key();
    let token_info_key = token_info.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![CreditBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: eta_key,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: token_info_key,
                    is_writable: true,
                },
            ],
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

#[callback_accounts("credit_balance")]
#[derive(Accounts)]
pub struct CreditBalanceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_BALANCE))]
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
    pub eta: Box<Account<'info, EncryptedTokenAccount>>,
    #[account(mut, constraint = token_info.mint == eta.mint)]
    pub token_info: Box<Account<'info, TokenInfo>>,
}

pub fn credit_balance_callback_handler(
    ctx: Context<CreditBalanceCallback>,
    output: SignedComputationOutputs<CreditBalanceOutput>,
) -> Result<()> {
    let eta = &mut ctx.accounts.eta;

    // A job that timed out and was replaced must not overwrite the newer result.
    if eta.pending_computation != ctx.accounts.computation_account.key() {
        return Ok(());
    }
    let amount = eta.pending_amount;
    let shield = eta.credit_kind == CREDIT_SHIELD;
    eta.clear_pending();

    let result = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(CreditBalanceOutput { field_0 }) => field_0,
        Err(_) => {
            // Balance and supply stay untouched; the user can simply retry. A
            // shield deposit stays in `shield_owed` and is re-sent by the next shield.
            emit!(CreditFailed {
                owner: eta.owner,
                mint: eta.mint,
                amount,
            });
            return Ok(());
        }
    };
    require!(
        result.encryption_key == eta.enc_pubkey,
        ErrorCode::EncryptionKeyMismatch
    );

    eta.set_balance(result.ciphertexts[0], result.nonce);
    if shield {
        // Already counted in the supply when the tokens reached the vault.
        eta.shield_owed = eta.shield_owed.saturating_sub(amount);
    } else {
        let token_info = &mut ctx.accounts.token_info;
        token_info.exchange_supply = token_info
            .exchange_supply
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
    }

    emit!(BalanceCredited {
        owner: eta.owner,
        mint: eta.mint,
        amount,
    });
    Ok(())
}
