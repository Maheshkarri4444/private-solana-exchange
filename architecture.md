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
 │  • ZK withdraw verifier     │        │  • settler: orders +   │
 │  • vault: public tokens in  │        │    LP fee payouts      │
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

| Public (anyone can see)                | Private (encrypted)                  |
| -------------------------------------- | ------------------------------------ |
| Token list, names, images              | Every user's balance                 |
| Total supply of each token             | Swap amounts                         |
| Faucet / mint amounts                  | Pool reserves                        |
| Pool price, health score, fee          | Each LP's share                      |
| Total LP supply, number of trades      | Waiting orders' side, price and size |
| Whether a pool trade was a buy or sell | Order book trade sizes and sides     |
| That an order exists, who placed it    | How much each LP earned in fees      |
| Which orders traded, and at what price |                                      |
| That an LP fee payout happened         |                                      |
| Who sent a transaction, and when       |                                      |
| Amounts moved out to / in from a wallet |                                     |

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
| `TokenInfo` — PDA("token", mint)      | creator, max supply, public supplies, vault    |
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
total supply  =  exchange supply   (all private balances; covers the vault's tokens)
              +  public supply     (SPL tokens in wallets = SPL supply − vault)
```

The max supply counts both, so moving tokens out and back in never lets the
creator mint more.

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

**Swap fees are paid to LP holders, privately.**

```
 swap 100 USDC, fee 0.30%        pool (encrypted)
 ──────────────────────────▶     reserves    += 99.70
                                 fee counter += 0.30 per LP token

 backend, once trading pauses ── collect_lp_fees ──▶ Arcium
                                 your USDC  += your LP × (counter − your last counter)
                                 "fees earned" += the same   (only you can read it)
```

**Example.** You hold 10% of the LP. Trades pay 5 USDC and 800 TOK in fees →
0.5 USDC and 80 TOK land in your private balances, you get a "LP fees received"
notice, and the pool page shows *Swap fees earned: +0.5 USDC +80 TOK*.

- Nothing to claim: the backend sends the payouts (anyone may; the fees always
  go to the holder). A payout briefly locks the pool, so it waits ~10 s after
  the last trade.
- Public: that a payout happened, up to which trade. Private: how much.
- LP tokens stay private (they can't move to a wallet), so every LP token is
  always counted by exactly one payout record.

> One swap per pool at a time (pool lock), for the same reason as the ETA lock.

---

## 9. Private order book

Orders whose **side, price and size** stay encrypted. Inspired by
[private-orderflow-dex](https://github.com/0xsupremedev/private-orderflow-dex)
(encrypted orders, matching inside MPC), changed in two ways: funds are locked
**inside your encrypted balance** (not a public escrow that leaks the size), and
matching happens **as the order is placed**.

```
 OrderBook  PDA("book", token)          ← one per token, opened by its creator
 ├── book     8 slots, one ciphertext only Arcium can read
 │            each slot: side · price · size · left · fills to settle
 ├── owners   public: who holds each slot, in what order they came
 └── public   which slots just traded · last trade price

 OrderViews PDA("book_views", book)     ← your own copy of your order,
                                          encrypted to you
```

**Order types**

| Type      | What it does                                                         |
| --------- | -------------------------------------------------------------------- |
| Limit     | Trades at your price or better; the rest waits in the book           |
| Market    | Trades now up to a worst price (reference ± slippage); rest returned |
| Post-only | Only waits in the book; refused if it would trade on arrival         |

**How a trade settles**

```
Bob sends an order ─▶ Arcium matches it: best price first, then oldest,
                      at the waiting order's price
                    ─▶ Bob is paid at once (his balances are in the computation)
                    ─▶ the book marks Alice's order as "traded" (public bit)
backend settler     ─▶ settle_order for Alice ─▶ her fills land in her balance,
                      a fully filled order leaves the book, her app notifies her
```

**Example.** Alice waits with *buy 500 @ 0.01*. Bob sends *sell 200 @ 0.009*.
Arcium fills 200 at **0.01** (Alice's price): Bob gets 2 USDC at once. Seconds
later the settler moves 200 tokens into Alice's balance, and she sees
"Your buy order partly filled".

- **Why a settler?** Arcium can only change balances handed into the computation.
  Nobody knows beforehand which hidden order will match, so Alice's balances
  aren't in Bob's computation. The settler hands them in right after. It only
  pays fees; the funds always go to the order's owner. Anyone may settle a
  traded order; only its owner may cancel.
- **What this makes public:** which orders traded, and each trade's price (so a
  waiting order's price shows once it trades). Never sizes or sides. Balances
  are still rewritten on every action, so the chain can't tell a buy from a sell.
- **Why 8 slots?** The book's result must fit in one Solana transaction (Arcium's
  callback): 8 packed slots is the most that fits. 3 per wallet. Market orders
  never take a slot.
- Orders trade in whole tokens; prices are USDC with 6 decimals.

---

## 10. Moving tokens to your public wallet (ZK proof)

Your tokens live in ETAs. To move some into your normal wallet you **prove in
zero-knowledge** that you have enough, and the program sends real SPL tokens to you.

```
1. Prepare  (MPC)      publish fingerprint = SHA3-256(balance ‖ salt),
                       send you the salt (encrypted), freeze the ETA
2. Prove    (browser)  Groth16 proof: "the balance inside this fingerprint ≥ amount"
3. Withdraw (program)  verify the proof → send `amount` real tokens to your wallet
                       (from the vault first, then minted: see section 11)
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
---

## 11. Moving public tokens in (the vault)

Tokens in a public wallet can move into your private balance. They are **not
burned and re-minted**: they wait in the exchange's vault.

```
 wallet ──transfer──▶ vault = token account PDA("vault", mint), owned by the program
                          │
                          ▼
 Arcium: your encrypted balance += amount       (public amount in, private from here on)
```

Moving out (section 10) then pays **from the vault first**:

| Token                                   | Move out pays from                 |
| --------------------------------------- | ---------------------------------- |
| Made here (USDC, tokens created here)   | vault first, then mints the rest   |
| From outside (any other SPL mint)       | vault only: never minted here      |
| LP tokens                               | can't move out (they stay private) |

**Example.** Alice moves 40 ROCK in → vault 40. Bob moves 100 ROCK out → 40 come
from the vault, 60 are minted. The total supply never changes.

- **Outside tokens:** anyone lists one once (`register_external_token`), then it
  moves in and out. Pools and order books are only for tokens created here.
- If Arcium's credit fails, the tokens are safe in the vault and still counted;
  "finish moving in" sends the credit again.
- An outside token is only as safe as its own mint: its freeze authority, for
  example, could freeze the vault.

---

## 12. Tech stack

| Layer    | Tech                                                                  |
| -------- | --------------------------------------------------------------------- |
| Program  | Anchor 1.0, Arcium 0.15 (Arcis circuits), Token-2022                  |
| MPC      | Arcium devnet, cluster 456                                            |
| Frontend | Next.js 16, Solana wallet adapter, `@arcium-hq/client`, `@noble/hashes` |
| Backend  | Express, MongoDB, Pinata (IPFS)                                       |
| ZK       | circom 2.2 + snarkjs 0.7 (Groth16), SHA3 from bkomuves/hash-circuits, verifier on `alt_bn128` |

---

## 13. Build order

1. ✅ **Keys, ETAs, fake USDC, create token** (live on devnet)
2. ✅ **AMM + user panel** — create pool, buy / sell, price chart, health, 30 USDC faucet (live on devnet)
3. ✅ **Move to wallet with a ZK proof** + backend account index (no chain scans)
4. ✅ **Private order book** (live on devnet)
5. ✅ **LP fees paid privately + public tokens in through the vault** (live on devnet)
6. Add / remove liquidity for other LPs
