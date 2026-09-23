use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid computation")]
    InvalidComputation,
    #[msg("Invalid callback")]
    InvalidCallback,
    #[msg("The computation was aborted")]
    AbortedComputation,
}
