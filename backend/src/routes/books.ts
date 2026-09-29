import { Router } from "express";
import { type BookDoc, bookPrices, bookViews, books, pools, tokens } from "../db.js";

export const booksRouter = Router();

/**
 * Books with their token metadata, the AMM price for reference, the public
 * trade prices and the owners' encrypted copies of their orders.
 */
async function withDetails(docs: BookDoc[], historyLimit: number) {
  const mints = docs.map((b) => b.tokenMint);
  const addresses = docs.map((b) => b.address);
  const [tokenDocs, poolDocs, viewDocs, history] = await Promise.all([
    tokens().find({ mint: { $in: mints } }, { projection: { _id: 0 } }).toArray(),
    pools().find({ tokenMint: { $in: mints } }, { projection: { _id: 0, tokenMint: 1, price: 1, status: 1 } }).toArray(),
    bookViews().find({ book: { $in: addresses } }, { projection: { _id: 0 } }).toArray(),
    bookPrices()
      .aggregate<{ _id: string; points: { price: string; time: number }[] }>([
        { $match: { book: { $in: addresses } } },
        { $sort: { time: 1 } },
        { $group: { _id: "$book", points: { $push: { price: "$price", time: "$time" } } } },
      ])
      .toArray(),
  ]);
  const tokenByMint = new Map(tokenDocs.map((t) => [t.mint, t]));
  const poolByMint = new Map(poolDocs.map((p) => [p.tokenMint, p]));
  const viewsByBook = new Map(viewDocs.map((v) => [v.book, v.views]));
  const historyByBook = new Map(history.map((h) => [h._id, h.points.slice(-historyLimit)]));
  return docs.map(({ slot: _slot, ...book }) => {
    const pool = poolByMint.get(book.tokenMint);
    return {
      ...book,
      token: tokenByMint.get(book.tokenMint) ?? null,
      poolPrice: pool?.status === 1 ? pool.price : null,
      views: viewsByBook.get(book.address) ?? [],
      history: historyByBook.get(book.address) ?? [],
    };
  });
}

/** GET /api/books — every order book, most recently active first. */
booksRouter.get("/", async (_req, res) => {
  const docs = await books().find({}, { projection: { _id: 0 } }).sort({ lastActivityAt: -1 }).toArray();
  res.json(await withDetails(docs, 32));
});

/** GET /api/books/:mint — one book by token mint. */
booksRouter.get("/:mint", async (req, res) => {
  const doc = await books().findOne({ tokenMint: req.params.mint }, { projection: { _id: 0 } });
  if (!doc) {
    res.status(404).json({ error: "order book not found" });
    return;
  }
  const [book] = await withDetails([doc], 500);
  res.json(book);
});
