import "dotenv/config";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { startIndexer } from "./indexer.js";
import { startSettler } from "./settler.js";
import { accountsRouter } from "./routes/accounts.js";
import { booksRouter } from "./routes/books.js";
import { cronRouter } from "./routes/cron.js";
import { metadataRouter } from "./routes/metadata.js";
import { poolsRouter } from "./routes/pools.js";
import { tokensRouter } from "./routes/tokens.js";

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "private-exchange-backend" });
});

// Every API call needs the database: connect on the first one, then reuse it.
app.use("/api", async (_req, _res, next) => {
  await connectDb();
  next();
});

app.use("/api/metadata", metadataRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/pools", poolsRouter);
app.use("/api/books", booksRouter);
app.use("/api/cron", cronRouter);
app.use("/api", accountsRouter);

// JSON instead of Express's default HTML error page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

// A long-running server (npm run dev / npm start) also runs the indexer's live
// feed and the settler's loop. On Vercel the app is one function answering
// requests (../index.js), and UptimeRobot's /api/cron/tick stands in for both.
if (!process.env.VERCEL) {
  await connectDb();
  startIndexer();
  startSettler();
  app.listen(config.port, () => {
    console.log(`backend listening on http://localhost:${config.port}`);
  });
}

export default app;
