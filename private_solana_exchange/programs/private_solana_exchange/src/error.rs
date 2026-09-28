use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Only the exchange admin can do this")]
    NotAdmin,
    #[msg("Encryption public key must not be empty")]
    InvalidEncryptionKey,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Amount is above the per-call limit")]
    AmountTooLarge,
    #[msg("Account is busy with another private operation, try again in a few seconds")]
    AccountBusy,
    #[msg("Only the token creator can mint this token")]
    NotTokenCreator,
    #[msg("Minting would exceed the token's max supply")]
    MaxSupplyExceeded,
    #[msg("Name, symbol or URI is empty or too long")]
    InvalidMetadata,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("MPC result is encrypted to the wrong key")]
    EncryptionKeyMismatch,
}
