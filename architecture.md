# Private Exchange — Architecture

A private exchange on Solana: **private AMM pools + a private order book**.
Balances, trade sizes, pool reserves and order prices are encrypted.
Token supplies stay public, so anyone can check nothing was printed out of thin air.

Built on **Arcium** (computation on encrypted data) with **Umbra-style encrypted token accounts**.

---

## 1. The big picture

```
 ┌───────────────────────────────────────────────────────────────┐
 │  FRONTEND  (Next.js)                                          │
 │  wallet · key derivation · encrypt / decrypt · ZK prover      │
 │  your private keys never leave the browser                    │
 └────────┬─────────────────────────────────────────┬────────────┘
          │ signed transactions                     │ HTTP
          ▼                                         ▼
 ┌─────────────────────────────┐        ┌────────────────────────┐
 │  SOLANA PROGRAM             │        │  BACKEND  (Node.js)    │
 │  Anchor + Arcium MXE        │        │  • metadata → IPFS     │
 │  • users + token accounts   │        │    (Pinata)            │
 │  • faucet, create token     │        │  • token list          │
 │  • AMM pools, order book    │        │    (MongoDB)           │
 │  • ZK withdraw verifier     │        │  • order-matching      │
 └────────┬────────────▲───────┘        │    crank               │
   queue  │            │ callback       └────────────────────────┘
   job    ▼            │ (signed result)
 ┌─────────────────────────────┐
 │  ARCIUM MPC NETWORK         │
 │  nodes compute together on  │
 │  encrypted data — no single │
 │  node ever sees the numbers │
 └─────────────────────────────┘
```

Every private action is the same loop:

**you send a tx → program queues an MPC job → MPC computes on encrypted data → a callback tx saves the encrypted result.**

---

## 2. What is public, what is private

| Public (anyone can see)               | Private (encrypted)                   |
| ------------------------------------- | ------------------------------------- |
| Token list, names, images             | Every user's balance                  |
| Total supply of each token            | Swap amounts                          |
| Faucet / mint amounts                 | Pool reserves (so, the exact price)   |
| Pools, their fee, total LP supply     | Each LP's share                       |
| That an order exists, who placed it   | Order side, price and size            |
| Who sent a transaction, and when      |                                       |
| Amount moved out to a public wallet   |                                       |

> Privacy needs a crowd. With 3 test users, timing alone can give things away.
> Fine for a devnet demo — just worth knowing.

---

## 3. Your keys (Umbra pattern)

You never create or back up a new key. Everything comes from **one wallet signature**.

```
wallet.signMessage("private exchange on solana")
        │  64-byte signature — identical every time
        ▼
master seed = KMAC256(signature)                        64 bytes, secret
        │
        ├── KMAC256(seed, "x25519") → x25519 private key
        │                              (its public key is registered on-chain)
        └── KMAC256(seed, "zk")     → secret for ZK proofs (later task)
```

- **Why a signature?** Solana signatures (Ed25519) are deterministic: same wallet + same message = same signature. So you get the same keys on any device.
- **KMAC256** is a keyed hash from the SHA-3 family. Different labels (`"x25519"`, `"zk"`) turn one seed into unrelated keys.
- The seed stays in your browser tab only. Close the tab and you just sign again.

---

## 4. How a balance is encrypted

Two ideas: **Diffie-Hellman** to agree on a key, **Rescue** to encrypt with it.

**Diffie-Hellman (x25519).** You and the Arcium network each have a keypair.
Mixing your private key with the other side's public key gives both sides the
**same secret** — and it is never sent anywhere.

```
you:     x25519(your_private, arcium_public)  ─┐
                                               ├─ same shared secret
Arcium:  x25519(arcium_private, your_public)  ─┘
```

**Rescue cipher.** The shared secret is hashed into a key. Rescue then encrypts
numbers with a fresh 16-byte nonce every time.

```
key        = RescuePrimeHash(shared_secret)
ciphertext = Rescue(key, nonce).encrypt(balance)
```

**Example.** Your balance is `250 USDC`. On-chain everyone sees `8f3a…c1` (32 bytes)
plus a nonce. Your browser decrypts it instantly. Arcium can only decrypt it
*jointly*, inside MPC. Everyone else sees noise.

> Arcium's key is split across its nodes. Your data stays private as long as
> **one** node is honest (Arcium's Cerberus protocol).

This is Umbra's **Shared mode**: encrypted to both you and Arcium, so you can read
your own balance without asking the network.

---

## 5. Encrypted Token Accounts (ETAs)

One ETA per **(user, token)**. Your USDC and your own token live in two different ETAs.

```
ETA        address = PDA("eta", owner, mint)
├── balance_ct   32 bytes   encrypted balance
├── nonce        16 bytes   new on every update
├── owner, mint
├── enc_pubkey   your x25519 public key
└── pending job  lock while MPC works on this account
```

Other accounts:

| Account                               | Holds                                          |
| ------------------------------------- | ---------------------------------------------- |
| `UserAccount` — PDA("user", wallet)   | your x25519 public key (registered once)       |
| `TokenInfo` — PDA("token", mint)      | creator, max supply, public exchange supply    |
| `Config` — PDA("config")              | admin, fake USDC mint                          |

**One rule keeps balances honest:** only an MPC callback can write `balance_ct`.
In Shared mode you know the key, so you *could* encrypt a fake balance yourself —
the program simply never accepts a ciphertext from a user.

---

## 6. How a private action runs

```
 you ──tx──▶ program: check → lock ETA → queue MPC job
                                              │
             Arcium MPC: decrypt inside MPC → compute → re-encrypt
                                              │
 program ◀── callback tx: verify cluster signature → save result → unlock
```

- One MPC round trip takes a few seconds.
- **The lock** stops two jobs from reading the same old balance and overwriting
  each other. A stuck lock expires after a timeout.
- The callback checks the **cluster's BLS signature**, so nobody can fake an MPC result.

---

## 7. Tokens: fake USDC and your own token

Every token — USDC, your token, LP tokens — works the same way:

- It is a **real SPL mint** (Token-2022, metadata on-chain). The program is the mint authority.
- Its **SPL supply starts at 0**. Tokens live inside ETAs, not in wallets.
- `TokenInfo` shows the **exchange supply** publicly.

```
total supply  =  exchange supply   (sum of all private ETA balances)
              +  SPL supply        (tokens moved out to public wallets)
```

**Fake USDC.** Created once at setup, 6 decimals.
Creator panel: mint any amount. User panel: 30 USDC per click (later task).

**Create your own token.**

```
1. Fill in name, symbol, image, description, supply
2. Backend pins image + metadata JSON to IPFS (Pinata)   → uri
3. Program creates the SPL mint with that metadata       (SPL supply = 0)
4. MPC credits the full supply into your ETA             (exchange supply = supply)
```

> Minting is public — it changes the public supply. Mint 500 USDC and everyone
> sees +500. Once you start trading, nobody knows your balance anymore.

---

## 8. Private AMM

```
Pool
├── public:   token, USDC, fee (e.g. 0.30%), total LP supply
└── private:  reserve_token, reserve_usdc     (encrypted to Arcium only)
```

**Create a pool.** You pick the token amount, USDC amount and fee. MPC moves them
from your ETAs into the pool and mints LP tokens into your LP ETA.

**Swap.** MPC checks your balance, takes the fee, computes the output with
`x · y = k`, checks your slippage limit, then updates four ciphertexts: your two
ETAs and the two reserves. **No real tokens move.**

**Why reserves must be private.** If they were public, anyone could compare them
before and after your swap — the difference *is* your trade size.

**How you see a price.** A `quote` MPC job returns the expected output encrypted
to you. Only you see it.

**LP tokens** are a real SPL mint too, with balances in ETAs. Each LP's share is
private; the total LP supply is public.

**Fees go to LPs automatically.** The fee stays inside the pool, so every LP token
is backed by more over time.
Example: pool `1,000 TOK + 1,000 USDC`, you own 10% of LP. Swaps leave 60 USDC of
fees behind. You withdraw 10% of `1,000 TOK + 1,060 USDC` → `100 TOK + 106 USDC`.

> One swap per pool at a time (pool lock), for the same reason as the ETA lock.

---

## 9. Private order book

Inspired by [private-orderflow-dex](https://github.com/0xsupremedev/private-orderflow-dex), adapted to ETAs.

**Kept from that repo:** orders encrypted in the browser, matching inside MPC,
a crank that triggers matching, order states, replay-safe settlement.

**Changed:** that repo locks funds in a *public* SPL escrow, which leaks order size.
Here funds are locked *inside your encrypted balance*, and settlement only moves
encrypted balances.

```
Place   encrypt {side, price, size} → MPC moves the needed funds from your ETA
        into the order (amount hidden)
Match   crank asks MPC "do buy #12 and sell #7 cross?" → fill at the resting
        order's price, update both orders
Claim   MPC moves your fills into your ETAs; cancel returns what is unfilled
```

- A buy locks `price × size` USDC. A sell locks `size` tokens.
- Nobody sees side, price or size — not even the crank. Observers only see that
  orders exist and when they change.

---

## 10. Moving tokens to your public wallet (ZK proof)

Your tokens live in ETAs. To move some into your normal wallet you **prove in
zero-knowledge** that you have enough, and the program mints real SPL tokens to you.

```
1. Prepare  (MPC)      lock ETA, publish fingerprint = SHA3(balance ‖ salt),
                       send you the salt (encrypted)
2. Prove    (browser)  Groth16 proof: "the balance inside this fingerprint ≥ amount"
3. Withdraw (program)  verify proof → mint `amount` real tokens to your wallet
                       → MPC subtracts `amount` → unlock
```

**Example.** Balance 250, you withdraw 100. The chain sees a fingerprint and a valid
proof of "≥ 100" — never 250. Your wallet gets 100 real tokens; your ETA now holds 150.

- **Fingerprint = hash commitment.** The random salt hides the balance; the hash
  locks it in, so you can't prove a different number.
- **Why SHA3?** Rescue ciphertexts live in a different number field than ZK proofs.
  SHA3 runs both inside Arcium MPC and inside ZK circuits, so it is the bridge.
- **Checked on-chain** with Solana's `alt_bn128` syscalls (Groth16 on BN254).
- **Deposit back (public → private):** burn real tokens from your wallet, MPC credits
  your ETA. The amount is visible — it was in a public wallet anyway.

---

## 11. Tech stack

| Layer    | Tech                                                                  |
| -------- | --------------------------------------------------------------------- |
| Program  | Anchor 1.0, Arcium 0.15 (Arcis circuits), Token-2022                  |
| MPC      | Arcium devnet, cluster 456                                            |
| Frontend | Next.js 16, Solana wallet adapter, `@arcium-hq/client`, `@noble/hashes` |
| Backend  | Express, MongoDB, Pinata (IPFS)                                       |
| ZK       | circom + snarkjs (Groth16), on-chain verifier                         |

---

## 12. Build order

1. ✅ **Keys, ETAs, fake USDC, create token** — creator page (live on devnet)
2. AMM — create pool, swap, add / remove liquidity
3. User panel — faucet limit, swap UI
4. Order book
5. ZK withdraw + deposit
