pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
#[allow(unused_imports)]
use arcium_anchor::prelude::*;
#[allow(unused_imports)]
pub use constants::*;
#[allow(unused_imports)]
pub use instructions::*;
#[allow(unused_imports)]
pub use state::*;

declare_id!("7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP");

#[arcium_program]
pub mod private_solana_exchange {
    #[allow(unused_imports)]
    use super::*;
}
