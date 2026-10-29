import type { ConnectionConfig } from "@solana/web3.js";

const RETRIES = 4;
const RETRY_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` for the Solana RPC that retries short outages. When the public devnet
 * RPC turns a request away at the connection level (it limits each IP), the
 * browser only reports "TypeError: Failed to fetch" and web3.js gives up; a
 * moment later the same request goes through. Rate-limit replies (429) are
 * retried by web3.js itself. Re-sending a signed transaction is safe: it has the
 * same signature, so it can only land once.
 */
export const rpcFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(input, init);
      if (!RETRY_STATUS.has(res.status) || attempt >= RETRIES) return res;
    } catch (e) {
      if (attempt >= RETRIES) throw e;
    }
    await sleep(400 * 2 ** attempt + Math.random() * 250);
  }
};

/** Stable config object: the connection is created once per endpoint and config. */
export const RPC_CONFIG: ConnectionConfig = { commitment: "confirmed", fetch: rpcFetch };
