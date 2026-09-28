use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    /// Pool reserves. Encrypted to the Arcium cluster only — nobody can read them.
    pub struct Reserves {
        pub token: u64,
        pub usdc: u64,
    }

    /// Initial liquidity, encrypted by the pool creator.
    pub struct Deposit {
        pub token_amount: u64,
        pub usdc_amount: u64,
    }

    /// A swap, encrypted by the trader. The pool pays the largest amount in
    /// [min_out, max_out] that keeps x·y = k; min_out is the slippage limit.
    pub struct Order {
        pub amount_in: u64,
        pub min_out: u64,
        pub max_out: u64,
    }

    /// The only pool facts that become public.
    pub struct PoolStats {
        pub ok: bool,
        /// USDC per token (both use 6 decimals).
        pub price: f64,
        /// Coarse 0–100 health score.
        pub health: u8,
    }

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

    /// Moves the creator's initial liquidity into a new pool and mints LP tokens.
    /// Fails (ok = false, nothing moves) if the creator lacks the funds.
    #[instruction]
    pub fn seed_pool(
        token_balance: Enc<Shared, u64>,
        usdc_balance: Enc<Shared, u64>,
        deposit_ctxt: Enc<Shared, Deposit>,
        total_supply: u64,
    ) -> (
        Enc<Shared, u64>,
        Enc<Shared, u64>,
        Enc<Shared, u64>,
        Enc<Mxe, Reserves>,
        PoolStats,
    ) {
        let token_bal = token_balance.to_arcis();
        let usdc_bal = usdc_balance.to_arcis();
        let deposit = deposit_ctxt.to_arcis();

        // At least 1 whole token and 1 USDC, and no more than the creator holds.
        let min_seed = 1_000_000u64;
        let ok = (deposit.token_amount >= min_seed)
            & (deposit.usdc_amount >= min_seed)
            & (deposit.token_amount <= token_bal)
            & (deposit.usdc_amount <= usdc_bal);

        let token_in = if ok { deposit.token_amount } else { 0u64 };
        let usdc_in = if ok { deposit.usdc_amount } else { 0u64 };
        // Fixed first LP supply (1,000,000 LP): a √(x·y) supply would leak the reserves.
        let lp = if ok { 1_000_000_000_000u64 } else { 0u64 };

        let reserves = Reserves {
            token: token_in,
            usdc: usdc_in,
        };
        let stats = pool_stats(ok, &reserves, total_supply);

        let owner = token_balance.owner.public_key;
        (
            Shared::new(owner).from_arcis(token_bal - token_in),
            Shared::new(owner).from_arcis(usdc_bal - usdc_in),
            Shared::new(owner).from_arcis(lp),
            Mxe::get().from_arcis(reserves),
            stats.reveal(),
        )
    }

    /// Constant-product swap on private reserves. Buy = USDC in, token out;
    /// sell = token in, USDC out. Fails (ok = false, nothing moves) on
    /// insufficient balance or slippage.
    ///
    /// `keep_q14` = share of the input kept after the fee, out of 16384 (2^14):
    /// a power-of-two divisor is a cheap bit shift in MPC, a division is not.
    #[instruction]
    pub fn swap(
        usdc_balance: Enc<Shared, u64>,
        usdc_initialized: bool,
        token_balance: Enc<Shared, u64>,
        token_initialized: bool,
        reserves_ctxt: Enc<Mxe, Reserves>,
        order_ctxt: Enc<Shared, Order>,
        is_buy: bool,
        keep_q14: u16,
        total_supply: u64,
    ) -> (Enc<Shared, u64>, Enc<Shared, u64>, Enc<Mxe, Reserves>, PoolStats) {
        let usdc_bal = usdc_balance.to_arcis();
        let usdc_bal = if usdc_initialized { usdc_bal } else { 0u64 };
        let token_bal = token_balance.to_arcis();
        let token_bal = if token_initialized { token_bal } else { 0u64 };
        let r = reserves_ctxt.to_arcis();
        let order = order_ctxt.to_arcis();

        let reserve_in = if is_buy { r.usdc } else { r.token };
        let reserve_out = if is_buy { r.token } else { r.usdc };
        let balance_in = if is_buy { usdc_bal } else { token_bal };

        // Constant product with the fee kept in the pool: paying out c is allowed
        // when c · (reserve_in + a') ≤ reserve_out · a', where a' = input after fee.
        // Checking instead of dividing (like Uniswap V2's pair contract): integer
        // division runs bit by bit in MPC and is far too deep for Arcium's limits.
        let after_fee = (((order.amount_in as u128) * (keep_q14 as u128)) >> 14) as u64;
        let numer = (reserve_out as u128) * (after_fee as u128);
        let denom = (reserve_in as u128) + (after_fee as u128);

        // Try min_out + span·k/16 for k = 0..=16 and keep the largest that fits,
        // so the trader lands within 1/16 of their slippage band of the best price.
        let span = if order.max_out > order.min_out {
            order.max_out - order.min_out
        } else {
            0u64
        };
        let mut out = 0u64;
        for k in 0..17u64 {
            let candidate = order.min_out + (((span as u128) * (k as u128)) >> 4) as u64;
            if (candidate as u128) * denom <= numer {
                out = candidate;
            }
        }

        let ok = (order.min_out > 0u64)
            & (out >= order.min_out)
            & (order.amount_in > 0u64)
            & (order.amount_in <= balance_in);
        let amount_in = if ok { order.amount_in } else { 0u64 };
        let amount_out = if ok { out } else { 0u64 };

        let new_reserves = Reserves {
            token: if is_buy { r.token - amount_out } else { r.token + amount_in },
            usdc: if is_buy { r.usdc + amount_in } else { r.usdc - amount_out },
        };
        let new_usdc = if is_buy { usdc_bal - amount_in } else { usdc_bal + amount_out };
        let new_token = if is_buy { token_bal + amount_out } else { token_bal - amount_in };

        let stats = pool_stats(ok, &new_reserves, total_supply);

        let owner = usdc_balance.owner.public_key;
        (
            Shared::new(owner).from_arcis(new_usdc),
            Shared::new(owner).from_arcis(new_token),
            Mxe::get().from_arcis(new_reserves),
            stats.reveal(),
        )
    }

    /// Moving tokens to a public wallet, step 1. Publishes a fingerprint of the
    /// balance, SHA3-256(balance ‖ salt), and hands the owner the random salt
    /// (encrypted). The owner then proves in ZK that the fingerprinted balance
    /// covers the withdrawal, without revealing the balance.
    #[instruction]
    pub fn commit_balance(balance: Enc<Shared, u64>) -> (Enc<Shared, u128>, [u8; 32]) {
        let bal = balance.to_arcis();
        let salt = ArcisRNG::gen_integer_from_width(128);

        // Exactly the 24 bytes the ZK circuit hashes: balance (LE) ‖ salt (LE).
        let bal_bytes = bal.to_le_bytes();
        let salt_bytes = salt.to_le_bytes();
        let mut message = [0u8; 24];
        for i in 0..8 {
            message[i] = bal_bytes[i];
        }
        for i in 0..16 {
            message[8 + i] = salt_bytes[i];
        }
        let fingerprint = SHA3_256::new().digest(&message);

        let owner = Shared::new(balance.owner.public_key);
        (owner.from_arcis(salt), fingerprint.reveal())
    }

    /// Moving tokens to a public wallet, step 2: subtracts the amount the owner
    /// proved they can afford. The account stays frozen between the two steps,
    /// so the proof still holds; saturating is only a safety net.
    #[instruction]
    pub fn debit_balance(balance: Enc<Shared, u64>, amount: u64) -> Enc<Shared, u64> {
        let bal = balance.to_arcis();
        let rest = if amount <= bal { bal - amount } else { 0u64 };
        Shared::new(balance.owner.public_key).from_arcis(rest)
    }

    /// Public price + coarse health, computed from private reserves.
    fn pool_stats(ok: bool, r: &Reserves, total_supply: u64) -> PoolStats {
        // Fixed-point division (cheap in MPC); the price is for display, so ~2^-52
        // precision is plenty. Guarded: a failed seed leaves empty reserves.
        let token = if r.token > 0u64 { r.token as f64 } else { 1.0f64 };
        let price = (r.usdc as f64) / token;

        // Health factor 1 — depth: USDC in the pool (50 / 250 / 1,000 / 5,000 USDC).
        let usdc = r.usdc as u128;
        let depth = tier(usdc >= 50_000_000u128)
            + tier(usdc >= 250_000_000u128)
            + tier(usdc >= 1_000_000_000u128)
            + tier(usdc >= 5_000_000_000u128);

        // Health factor 2 — liquidity vs market cap = 2 · tokens_in_pool / total_supply
        // (5% / 10% / 25% / 50%), compared without dividing.
        let lhs = 2u128 * (r.token as u128) * 10_000u128;
        let supply = total_supply as u128;
        let backing = tier(lhs >= 500u128 * supply)
            + tier(lhs >= 1_000u128 * supply)
            + tier(lhs >= 2_500u128 * supply)
            + tier(lhs >= 5_000u128 * supply);

        // 0..8 → 0..100 in steps of 12.5. Coarse on purpose: an exact value would
        // reveal the reserves once combined with the public price.
        let health = (depth + backing) * 25u8 / 2u8;

        PoolStats { ok, price, health }
    }

    fn tier(passed: bool) -> u8 {
        if passed {
            1u8
        } else {
            0u8
        }
    }
}
