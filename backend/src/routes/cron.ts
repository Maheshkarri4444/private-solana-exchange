import { waitUntil } from "@vercel/functions";
import { Router } from "express";
import { config } from "../config.js";
import { fullSync } from "../indexer.js";
import { getSettler } from "../settler.js";

export const cronRouter = Router();

/** The snapshot answers within this; a longer one finishes after the response. */
const ANSWER_WITHIN_MS = 20_000;
/** The settler's round must end by then (Vercel ends a function at 300 s). */
const FINISH_WITHIN_MS = 280_000;

const TIMED_OUT = Symbol("timed out");
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([promise, new Promise<typeof TIMED_OUT>((resolve) => setTimeout(resolve, ms, TIMED_OUT).unref())]);
}

/**
 * GET /api/cron/tick?key=<CRON_KEY>
 * UptimeRobot calls this every 5 minutes. On Vercel nothing runs between
 * requests, so this replaces the server's timers: a full snapshot of the
 * program's accounts, then one settler round (traded orders, LP fees) that
 * keeps going after the answer. `ok` is false only when the snapshot failed,
 * so a keyword monitor on "ok":true alerts on real trouble.
 */
cronRouter.get("/tick", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!config.cronKey) {
    res.status(503).json({ ok: false, error: "CRON_KEY is not set" });
    return;
  }
  if (req.query.key !== config.cronKey) {
    res.status(401).json({ ok: false, error: "wrong or missing key" });
    return;
  }

  const finishBy = Date.now() + FINISH_WITHIN_MS;
  const settler = getSettler();
  const snapshot = fullSync();
  // the settler works from the fresh snapshot
  waitUntil(
    snapshot
      .then(() => settler?.tick(finishBy))
      .catch((e) => console.error("cron: tick failed —", e?.message)),
  );

  try {
    const synced = await within(snapshot, ANSWER_WITHIN_MS);
    res.json({
      ok: true,
      synced: synced === TIMED_OUT ? "still running" : synced,
      settler: settler ? "on" : "off (SETTLER_KEYPAIR not set)",
    });
  } catch (e: any) {
    res.json({ ok: false, error: `snapshot failed: ${e?.message}` });
  }
});
