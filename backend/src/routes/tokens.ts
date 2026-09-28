import { PublicKey } from "@solana/web3.js";
import { Router } from "express";
import { tokens, type TokenDoc } from "../db.js";
import { syncAccounts } from "../indexer.js";
import { programId } from "../solana.js";

export const tokensRouter = Router();

/** GET /api/tokens?creator=<wallet> — metadata + public supplies, newest first. */
tokensRouter.get("/", async (req, res) => {
  const filter: Partial<TokenDoc> = {};
  if (req.query.creator) filter.creator = String(req.query.creator);
  const list = await tokens()
    .find(filter, { projection: { _id: 0, supplySlot: 0 } })
    .sort({ isUsdc: -1, createdAt: -1 })
    .limit(200)
    .toArray();
  res.json(list);
});

/** GET /api/tokens/:mint */
tokensRouter.get("/:mint", async (req, res) => {
  const token = await tokens().findOne({ mint: req.params.mint }, { projection: { _id: 0, supplySlot: 0 } });
  if (!token) {
    res.status(404).json({ error: "token not found" });
    return;
  }
  res.json(token);
});

/**
 * POST /api/tokens  { mint }
 * Indexes a token right away (the indexer would also find it on its own).
 * Everything is read from the chain, so the request cannot inject fake data.
 */
tokensRouter.post("/", async (req, res) => {
  let mint: PublicKey;
  try {
    mint = new PublicKey(String(req.body?.mint));
  } catch {
    res.status(400).json({ error: "valid mint address required" });
    return;
  }
  const [tokenInfo] = PublicKey.findProgramAddressSync([Buffer.from("token"), mint.toBuffer()], programId);
  await syncAccounts([tokenInfo]);
  const doc = await tokens().findOne({ mint: mint.toBase58() }, { projection: { _id: 0, supplySlot: 0 } });
  if (!doc) {
    res.status(404).json({ error: "token not found on-chain" });
    return;
  }
  res.json(doc);
});
