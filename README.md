# Private Exchange

A private exchange on Solana: private AMM pools and a private order book.
Balances and trades are encrypted with [Arcium](https://arcium.com) MPC. Token supplies stay public.

Full design: **[architecture.md](architecture.md)**

## What works now

- Sign one message → your browser derives your encryption key (Umbra-style)
- Encrypted token accounts — one per token, readable only by you
- Mint free test USDC into your encrypted balance
- Create your own token — a real SPL mint with supply 0; the full supply goes privately to you

Live on **devnet** · program `7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP` · Arcium cluster `456`

## Repo

| Folder                     | What                                              |
| -------------------------- | ------------------------------------------------- |
| `private_solana_exchange/` | Solana program (Anchor) + Arcium MPC circuit      |
| `frontend/`                | Next.js app                                       |
| `backend/`                 | API — IPFS uploads (Pinata), token list (MongoDB) |

## Run it

```bash
cd backend && cp .env.example .env   # fill in MongoDB + Pinata
npm install && npm run dev           # http://localhost:4000
```

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000
```

Set your wallet to **devnet**, then open **Profile → Creator**.

## Program development

```bash
cd private_solana_exchange
arcium build        # circuit + program
arcium test         # local validator + Arcium nodes (needs Docker)
npm run sync-idl    # copy the IDL into frontend + backend
```

One-time devnet setup after a deploy: see `scripts/setup-devnet.ts`.
