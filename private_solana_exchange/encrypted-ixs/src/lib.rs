use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Adds a public `amount` to an encrypted balance (faucet / token mint).
    ///
    /// A brand-new account has no ciphertext yet: `is_initialized = false` makes the
    /// circuit ignore `balance` and start from zero.
    #[instruction]
    pub fn credit_balance(
        balance: Enc<Shared, u64>,
        is_initialized: bool,
        amount: u64,
    ) -> Enc<Shared, u64> {
        let current = balance.to_arcis();
        let current = if is_initialized { current } else { 0 };

        // Fresh random nonce. One user key encrypts several ETAs, so reusing
        // `nonce + 1` could repeat a Rescue keystream across two accounts.
        let owner = Shared::new(balance.owner.public_key);
        owner.from_arcis(current + amount)
    }
}
