import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { tokens, type TokenDoc } from "../db.js";
import { fetchTokenOnChain } from "../solana.js";

export const tokensRouter = Router();

function parseMint(value: unknown): PublicKey | null {
  try {
    return new PublicKey(String(value));
  } catch {
    return null;
  }
}

/** Reads `image` / `description` from the metadata JSON, if reachable. */
async function fetchOffChainMetadata(uri: string) {
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { image: null, description: null };
    const json = (await res.json()) as { image?: string; description?: string };
    return { image: json.image ?? null, description: json.description ?? null };
  } catch {
    return { image: null, description: null };
  }
}

/** GET /api/tokens?creator=<wallet> — newest first. */
tokensRouter.get("/", async (req, res) => {
  const filter: Partial<TokenDoc> = {};
  if (req.query.creator) filter.creator = String(req.query.creator);
  const list = await tokens()
    .find(filter, { projection: { _id: 0 } })
    .sort({ isUsdc: -1, createdAt: -1 })
    .limit(200)
    .toArray();
  res.json(list);
});

/** GET /api/tokens/:mint */
tokensRouter.get("/:mint", async (req, res) => {
  const token = await tokens().findOne({ mint: req.params.mint }, { projection: { _id: 0 } });
  if (!token) {
    res.status(404).json({ error: "token not found" });
    return;
  }
  res.json(token);
});

/**
 * POST /api/tokens  { mint }
 * Indexes a token after it was created on-chain. Everything is read from the
 * chain, so the request cannot inject fake data.
 */
tokensRouter.post("/", async (req, res) => {
  const mint = parseMint(req.body?.mint);
  if (!mint) {
    res.status(400).json({ error: "valid mint address required" });
    return;
  }

  const onChain = await fetchTokenOnChain(mint);
  if (!onChain) {
    res.status(404).json({ error: "token not found on-chain" });
    return;
  }

  const doc: TokenDoc = { ...onChain, ...(await fetchOffChainMetadata(onChain.uri)) };
  await tokens().updateOne({ mint: doc.mint }, { $set: doc }, { upsert: true });
  res.json(doc);
});
