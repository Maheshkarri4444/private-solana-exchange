import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { etas, tokens } from "../db.js";
import { syncAccounts } from "../indexer.js";

export const accountsRouter = Router();

const MAX_SYNC = 20;

function toPublicKey(value: unknown): PublicKey | null {
  try {
    return new PublicKey(String(value));
  } catch {
    return null;
  }
}

/**
 * GET /api/etas?owner=<wallet>
 * A user's encrypted token accounts. Balances are ciphertexts — the browser
 * decrypts them locally with the user's key.
 */
accountsRouter.get("/etas", async (req, res) => {
  const owner = toPublicKey(req.query.owner);
  if (!owner) {
    res.status(400).json({ error: "valid owner address required" });
    return;
  }
  const docs = await etas().find({ owner: owner.toBase58() }, { projection: { _id: 0, slot: 0 } }).toArray();
  const tokenDocs = await tokens()
    .find({ mint: { $in: docs.map((d) => d.mint) } }, { projection: { _id: 0 } })
    .toArray();
  const byMint = new Map(tokenDocs.map((t) => [t.mint, t]));
  res.json(docs.map((d) => ({ ...d, token: byMint.get(d.mint) ?? null })));
});

/**
 * POST /api/sync  { accounts: string[] }
 * Re-reads these accounts from the chain right now. The app calls it after its
 * own transactions so the next read is fresh without waiting for the push.
 */
accountsRouter.post("/sync", async (req, res) => {
  const list: unknown[] = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  const keys = list.slice(0, MAX_SYNC).map(toPublicKey);
  if (keys.length === 0 || keys.some((k) => !k)) {
    res.status(400).json({ error: `1-${MAX_SYNC} valid account addresses required` });
    return;
  }
  res.json({ synced: await syncAccounts(keys as PublicKey[]) });
});
