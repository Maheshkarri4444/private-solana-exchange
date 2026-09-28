# Private Exchange

A private exchange on Solana: private AMM pools and a private order book.
Balances and trades are encrypted with [Arcium](https://arcium.com) MPC. Token supplies stay public.

Full design: **[architecture.md](architecture.md)**

## What works now

- Sign one message → your browser derives your encryption key (Umbra-style)
- Encrypted token accounts — one per token, readable only by you
- Mint free test USDC into your encrypted balance (30 per click)
- Create your own token — a real SPL mint with supply 0; the full supply goes privately to you
- Create a liquidity pool — reserves stay encrypted; price and a health score are public
- Buy and sell privately — your amount is encrypted, the price moves after every trade
- Move tokens to your public wallet — a zero-knowledge proof (made in your browser) shows you have enough without revealing your balance; the program verifies it and mints real SPL tokens

Live on **devnet** · program `7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP` · Arcium cluster `456`

## Repo

| Folder                     | What                                                 |
| -------------------------- | ---------------------------------------------------- |
| `private_solana_exchange/` | Solana program (Anchor) + Arcium MPC circuits        |
| `frontend/`                | Next.js app                                          |
| `backend/`                 | API — IPFS uploads (Pinata), account index (MongoDB) |
| `zk/`                      | ZK circuit for "move to wallet" (circom + snarkjs)   |

## Run it

```bash
cd backend && cp .env.example .env   # fill in MongoDB + Pinata
npm install && npm run dev           # http://localhost:4000
```

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000
```

Set your wallet to **devnet** and connect. The home page is your trading panel;
the profile menu (top right) has **Create token**, **Create liquidity pool** and **Create order book**.

## Program development

```bash
cd private_solana_exchange
arcium build        # circuit + program
arcium test         # local validator + Arcium nodes (needs Docker)
npm run sync-idl    # copy the IDL into frontend + backend
```

One-time devnet setup after a deploy: see `scripts/setup-devnet.ts`.

## ZK circuit

```bash
cd zk && npm install
npm run build    # compile + local trusted setup (first run ~45 min)
npm test         # the circuit accepts real withdrawals and rejects cheats
npm run export   # verifying key → program, prover files → frontend/public/zk
```

A new setup means a new verifying key, so the program must be rebuilt and redeployed after it.
The proving key (82 MB) is not in git. To use the deployed program without rebuilding, set
`NEXT_PUBLIC_UNSHIELD_ZKEY_URL` to the IPFS copy in `zk/zkey-ipfs.json` (see `frontend/.env.example`).
