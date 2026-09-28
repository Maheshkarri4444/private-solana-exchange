import { Router } from "express";
import { type PoolDoc, type TokenDoc, pools, prices, tokens } from "../db.js";

export const poolsRouter = Router();

/** Pools with their token metadata, supplies and price history, newest first. */
async function withDetails(docs: PoolDoc[], historyLimit: number) {
  const mints = docs.flatMap((p) => [p.tokenMint, p.lpMint]);
  const [tokenDocs, history] = await Promise.all([
    tokens().find({ mint: { $in: mints } }, { projection: { _id: 0 } }).toArray(),
    prices()
      .aggregate<{ _id: string; points: { price: string; time: number }[] }>([
        { $match: { pool: { $in: docs.map((p) => p.address) } } },
        { $sort: { time: 1 } },
        { $group: { _id: "$pool", points: { $push: { price: "$price", time: "$time" } } } },
      ])
      .toArray(),
  ]);
  const byMint = new Map<string, TokenDoc>(tokenDocs.map((t) => [t.mint, t]));
  const historyByPool = new Map(history.map((h) => [h._id, h.points.slice(-historyLimit)]));

  return docs.map(({ slot: _slot, ...pool }) => {
    const token = byMint.get(pool.tokenMint) ?? null;
    return {
      ...pool,
      token,
      privateSupply: token?.exchangeSupply ?? "0",
      splSupply: token?.splSupply ?? "0",
      lpSupply: byMint.get(pool.lpMint)?.exchangeSupply ?? "0",
      history: historyByPool.get(pool.address) ?? [],
    };
  });
}

/** GET /api/pools — every pool, with recent prices for sparklines. */
poolsRouter.get("/", async (_req, res) => {
  const docs = await pools().find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  res.json(await withDetails(docs, 32));
});

/** GET /api/pools/:mint — one pool by token mint, with its full price history. */
poolsRouter.get("/:mint", async (req, res) => {
  const doc = await pools().findOne({ tokenMint: req.params.mint }, { projection: { _id: 0 } });
  if (!doc) {
    res.status(404).json({ error: "pool not found" });
    return;
  }
  const [pool] = await withDetails([doc], 500);
  res.json(pool);
});
