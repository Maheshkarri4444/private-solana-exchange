import { PublicKey } from "@solana/web3.js";
import { waitUntil } from "@vercel/functions";
import { Router } from "express";
import { etas, lpPositions, tokens } from "../db.js";
import { syncAccounts } from "../indexer.js";
import { getSettler } from "../settler.js";

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
 * GET /api/lp-positions?owner=<wallet>
 * The wallet's share of pool swap fees. The lifetime total is a ciphertext
 * only the owner's browser can open.
 */
accountsRouter.get("/lp-positions", async (req, res) => {
  const owner = toPublicKey(req.query.owner);
  if (!owner) {
    res.status(400).json({ error: "valid owner address required" });
    return;
  }
  const docs = await lpPositions().find({ owner: owner.toBase58() }, { projection: { _id: 0, slot: 0 } }).toArray();
  res.json(docs);
});

/**
 * POST /api/sync  { accounts: string[] }
 * Re-reads these accounts from the chain right now. The app calls it after its
 * own transactions so the next read is fresh without waiting for the push.
 * A book among them that just traded is settled right away, not at the next
 * settler round.
 */
accountsRouter.post("/sync", async (req, res) => {
  const list: unknown[] = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  const keys = list.slice(0, MAX_SYNC).map(toPublicKey);
  if (keys.length === 0 || keys.some((k) => !k)) {
    res.status(400).json({ error: `1-${MAX_SYNC} valid account addresses required` });
    return;
  }
  const addresses = keys as PublicKey[];
  const synced = await syncAccounts(addresses);
  const settler = getSettler();
  if (settler) {
    // on Vercel the function stays alive for it after the response (under its 300 s)
    waitUntil(
      settler
        .settleBooks(addresses.map((k) => k.toBase58()), Date.now() + 280_000)
        .catch((e) => console.error("settler:", e?.message)),
    );
  }
  res.json({ synced });
});
