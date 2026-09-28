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
    #[msg("Pool fee must be between 0.10% and 10%")]
    InvalidFee,
    #[msg("USDC cannot have its own pool")]
    CannotPoolUsdc,
    #[msg("Only the token creator can create or seed its pool")]
    NotPoolCreator,
    #[msg("This pool already has liquidity")]
    PoolAlreadySeeded,
    #[msg("This pool is not open for trading yet")]
    PoolNotActive,
    #[msg("You have no balance of this token yet")]
    NoBalance,
    #[msg("Not a valid token mint")]
    InvalidMint,
    #[msg("Account does not belong to this user or token")]
    WrongAccount,
    #[msg("A move to your wallet is in progress on this account; finish or cancel it first")]
    AccountFrozen,
    #[msg("This step of the move to your wallet is not available right now")]
    WrongUnshieldStep,
    #[msg("The zero-knowledge proof is not valid")]
    InvalidProof,
    #[msg("USDC is the quote currency; it cannot have its own order book")]
    InvalidMarket,
    #[msg("The order book is full; try again when an order is cancelled")]
    BookFull,
    #[msg("You already have the maximum number of open orders in this book")]
    TooManyOrders,
    #[msg("This order belongs to someone else")]
    NotOrderOwner,
}
