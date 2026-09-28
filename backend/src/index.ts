import "dotenv/config";
import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { metadataRouter } from "./routes/metadata.js";
import { tokensRouter } from "./routes/tokens.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "private-exchange-backend" });
});

app.use("/api/metadata", metadataRouter);
app.use("/api/tokens", tokensRouter);

// JSON instead of Express's default HTML error page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

await connectDb();
app.listen(config.port, () => {
  console.log(`backend listening on http://localhost:${config.port}`);
});
