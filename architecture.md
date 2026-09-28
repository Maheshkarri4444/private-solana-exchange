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
 │  • faucet, create token     │        │  • account index       │
 │  • AMM pools, order book    │        │    (MongoDB)           │
 │  • ZK withdraw verifier     │        │    ciphertexts only    │
 └────────┬────────────▲───────┘        └────────────────────────┘
   queue  │            │ callback
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

| Public (anyone can see)                | Private (encrypted)                          |
| -------------------------------------- | -------------------------------------------- |
| Token list, names, images              | Every user's balance                         |
| Total supply of each token             | Swap amounts                                 |
| Faucet / mint amounts                  | Pool reserves                                |
| Pool price, health score, fee          | Each LP's share                              |
| Total LP supply, number of trades      | Order side, price and size                   |
| Whether a pool trade was a buy or sell | Order book fills (even whether one happened) |
| That an order exists, who placed it    |                                              |
| Who sent a transaction, and when       |                                              |
| Amount moved out to a public wallet    |                                              |

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
├── pending job  lock while MPC works on this account
└── unshield     move-to-wallet step, fingerprint, salt (encrypted)
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

**Reading state: the backend index.** The browser never scans the chain (public
RPCs rate-limit that). The backend mirrors every program account into MongoDB:
one snapshot at start, live websocket updates, and a re-check every 60 s.

- It stores account **state**, not transactions. A failed transaction changes no
  account, so it can never leave a wrong record.
- A newer update always wins (compared by slot).
- It only ever holds ciphertexts. Your key stays in your browser.

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
Pool                                   one per token, paired with USDC
├── public:   price, health score, fee, total LP supply, trade count, price history
└── private:  reserve_token, reserve_usdc     (encrypted to Arcium only)
```

**Create a pool** (creator only). Two steps:

```
1. create_pool   pool account + LP token (real SPL mint, supply 0)
2. seed_pool     your deposit is encrypted in the browser → Arcium moves it
                 from your ETAs into the pool → you get 1,000,000 LP (private)
```

The starting price is simply `USDC ÷ tokens` you put in.

**Swap.** Your browser only knows the public price, so it sends an encrypted order:
`{ amount_in, min_out, max_out }` — "about this much, at least that much".
Arcium checks your balance and pays the **best amount in that range that keeps
`x · y = k`**. It tries 17 evenly spaced amounts and keeps the largest that fits.
**No real tokens move** — only four ciphertexts change: your two ETAs and the two reserves.

**Example.** Pool `500,000 ROCK + 1,000 USDC`, price `0.002`. You buy with 20 USDC,
5% slippage → range `9,471 … 9,970 ROCK`. The exact best is 9,774; Arcium pays
**9,751.9** (the largest step that fits). The price moves to `0.00208`.

> **Why try amounts instead of dividing?** Dividing secret numbers inside MPC runs
> bit by bit — the first version of this circuit was 4× over Arcium's cost limit.
> Checking `out · (reserve_in + in) ≤ reserve_out · in` is just a multiply and a compare.
> Uniswap V2's pool contract uses the same trick.

**Why reserves must be private.** If they were public, anyone could compare them
before and after your swap — the difference *is* your trade size.

**The price is public.** Arcium publishes the new price after every trade. The
trade-off: a price move shows a trade's *relative* size ("about 2% of the pool"),
never its amount.

**Health score (public, 0–100).** Arcium computes it from the hidden reserves:

| Factor | Tiers |
| --- | --- |
| Depth: USDC in the pool | 50 · 250 · 1,000 · 5,000 USDC |
| Liquidity vs market cap | 5% · 10% · 25% · 50% |

Each tier passed adds 12.5 points → Risky · Weak · Fair · Healthy. It is coarse on
purpose: an exact number, combined with the public price, would reveal the reserves.

**LP tokens** are a real SPL mint too, with balances in ETAs. Each LP's share is
private; the total LP supply is public. The first LP supply is fixed at
1,000,000 — the usual `√(token · USDC)` would, together with the price, reveal the reserves.

**Fees go to LPs automatically.** The fee stays inside the pool, so every LP token
is backed by more over time.
Example: pool `1,000 TOK + 1,000 USDC`, you own 10% of LP. Swaps leave 60 USDC of
fees behind. You withdraw 10% of `1,000 TOK + 1,060 USDC` → `100 TOK + 106 USDC`.

> One swap per pool at a time (pool lock), for the same reason as the ETA lock.

---

## 9. Private order book

Limit orders whose **side, price and size** stay encrypted. Inspired by
[private-orderflow-dex](https://github.com/0xsupremedev/private-orderflow-dex)
(encrypted orders, matching inside MPC), changed in two ways: funds are locked
**inside your encrypted balance** (not a public escrow that leaks the size), and
matching happens **as the order is placed**, so no crank is needed.

```
 OrderBook  PDA("book", token)          ← one per token, opened by its creator
 ├── book     8 slots, one ciphertext only Arcium can read
 │            each slot: side · price · size · left · fills to collect
 └── owners   public: who holds each slot, and in what order they came

 OrderViews PDA("book_views", book)     ← your own copy of your order,
                                          encrypted to you (side · price · size · left)
```

```
Place    encrypt {side, price, size} → Arcium locks price×size USDC (buy)
         or size tokens (sell) from your ETA, adds the order, then matches it:
         best price first, then oldest; trades happen at the resting order's price
Collect  your fills (made by others) move into your ETAs
Cancel   the unfilled part goes back too, and the slot is freed
```

**Example.** Alice rests *sell 1,000 @ 0.01*. Bob sends *buy 400 @ 0.012*.
Arcium fills 400 at **0.01** (Alice's price): Bob gets 400 tokens and 0.80 USDC of
his 4.80 lock back, at once. Alice sees it when she presses *Collect*.

- **Both balances are rewritten on every action** (USDC and the token), so the
  chain can't tell a buy from a sell. The whole book is rewritten too, so nobody
  can tell whether a trade happened.
- **Only the placer is paid at once.** Resting orders collect later, because
  their owners' balances aren't in that computation.
- **Why 8 slots?** The book's result must fit in one Solana transaction (Arcium's
  callback): 8 packed slots is the most that fits. 3 orders per wallet, so no
  one can fill a book alone.
- Orders trade in whole tokens; prices are USDC with 6 decimals.

---

## 10. Moving tokens to your public wallet (ZK proof)

Your tokens live in ETAs. To move some into your normal wallet you **prove in
zero-knowledge** that you have enough, and the program mints real SPL tokens to you.

```
1. Prepare  (MPC)      publish fingerprint = SHA3-256(balance ‖ salt),
                       send you the salt (encrypted), freeze the ETA
2. Prove    (browser)  Groth16 proof: "the balance inside this fingerprint ≥ amount"
3. Withdraw (program)  verify the proof → mint `amount` real tokens to your wallet
   Finish   (MPC)      subtract `amount` from your ETA → unfreeze
```

Steps 3 and "Finish" go in one transaction. If the MPC part fails, "Finish" can be
sent again. Before step 3 you can cancel; nothing has moved yet.

**Example.** Balance 250, you withdraw 100. The chain sees a fingerprint and a valid
proof of "≥ 100", never 250. Your wallet gets 100 real tokens; your ETA now holds 150.

- **Fingerprint = hash commitment.** The random 128-bit salt hides the balance; the
  hash locks it in, so you can't prove a different number.
- **The proof** (`zk/circuits/unshield.circom`, ~160k constraints). Public: the
  fingerprint and the amount. Private: balance and salt. It checks
  `SHA3(balance ‖ salt) == fingerprint` and `0 < amount ≤ balance`.
- **Why SHA3?** Rescue ciphertexts live in a different number field than ZK proofs.
  SHA3 runs both inside Arcium MPC and inside ZK circuits, so it is the bridge.
- **Frozen until done.** Between steps 1 and 3 no trade or mint can touch the
  balance, so the fingerprint stays true.
- **One proof, one use.** The fingerprint is wiped after step 3, and a new prepare
  uses a new salt, so an old proof never verifies again.
- **Checked on-chain** with Solana's `alt_bn128` syscalls (Groth16 on BN254, ~100k CU).
- **Trusted setup.** Groth16 needs one. This demo ran it on one machine; a real
  launch would use a multi-party ceremony.
- **Deposit back (public → private)** comes later: burn tokens from your wallet,
  MPC credits your ETA.

---

## 11. Tech stack

| Layer    | Tech                                                                  |
| -------- | --------------------------------------------------------------------- |
| Program  | Anchor 1.0, Arcium 0.15 (Arcis circuits), Token-2022                  |
| MPC      | Arcium devnet, cluster 456                                            |
| Frontend | Next.js 16, Solana wallet adapter, `@arcium-hq/client`, `@noble/hashes` |
| Backend  | Express, MongoDB, Pinata (IPFS)                                       |
| ZK       | circom 2.2 + snarkjs 0.7 (Groth16), SHA3 from bkomuves/hash-circuits, verifier on `alt_bn128` |

---

## 12. Build order

1. ✅ **Keys, ETAs, fake USDC, create token** (live on devnet)
2. ✅ **AMM + user panel** — create pool, buy / sell, price chart, health, 30 USDC faucet (live on devnet)
3. ✅ **Move to wallet with a ZK proof** + backend account index (no chain scans)
4. ✅ **Private order book** (live on devnet)
5. Add / remove liquidity for other LPs
6. Deposit back (public → private)
