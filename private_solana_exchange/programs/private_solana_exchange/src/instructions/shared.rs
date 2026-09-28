use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::{
    token_metadata_initialize, Mint, Token2022, TokenMetadataInitialize,
};

use crate::{constants::*, error::ErrorCode};

/// Reads an SPL mint's supply (bytes 36..44 of the base mint layout) without
/// deserializing its Token-2022 extensions, which costs a lot of stack.
pub fn mint_supply(mint: &AccountInfo) -> Result<u64> {
    let data = mint.try_borrow_data()?;
    let bytes: [u8; 8] = data
        .get(36..44)
        .and_then(|s| s.try_into().ok())
        .ok_or(ErrorCode::InvalidMint)?;
    Ok(u64::from_le_bytes(bytes))
}

pub fn validate_metadata(name: &str, symbol: &str, uri: &str) -> Result<()> {
    require!(
        !name.is_empty()
            && name.len() <= MAX_NAME_LEN
            && !symbol.is_empty()
            && symbol.len() <= MAX_SYMBOL_LEN
            && !uri.is_empty()
            && uri.len() <= MAX_URI_LEN,
        ErrorCode::InvalidMetadata
    );
    Ok(())
}

/// Writes name / symbol / uri into the mint's Token-2022 metadata extension, then
/// tops up the mint's lamports because the metadata made the account bigger.
#[allow(clippy::too_many_arguments)]
pub fn init_mint_metadata<'info>(
    token_program: &Program<'info, Token2022>,
    system_program: &Program<'info, System>,
    mint: &InterfaceAccount<'info, Mint>,
    mint_authority: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    mint_authority_bump: u8,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    let signer_seeds: &[&[&[u8]]] = &[&[MINT_AUTHORITY_SEED, &[mint_authority_bump]]];

    token_metadata_initialize(
        CpiContext::new_with_signer(
            token_program.key(),
            TokenMetadataInitialize {
                program_id: token_program.to_account_info(),
                metadata: mint.to_account_info(),
                update_authority: mint_authority.clone(),
                mint_authority: mint_authority.clone(),
                mint: mint.to_account_info(),
            },
            signer_seeds,
        ),
        name,
        symbol,
        uri,
    )?;

    let mint_info = mint.to_account_info();
    let missing = Rent::get()?
        .minimum_balance(mint_info.data_len())
        .saturating_sub(mint_info.lamports());
    if missing > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program.key(),
                system_program::Transfer {
                    from: payer.clone(),
                    to: mint_info,
                },
            ),
            missing,
        )?;
    }
    Ok(())
}
