import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries requests the RPC dropped at the network level ("fetch failed"); web3.js retries 429s itself. */
const rpcFetch: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(input, init);
      if (![502, 503, 504].includes(res.status) || attempt >= 4) return res;
    } catch (e) {
      if (attempt >= 4) throw e;
    }
    await sleep(400 * 2 ** attempt + Math.random() * 250);
  }
};

export const connection = new Connection(config.rpcUrl, { commitment: "confirmed", fetch: rpcFetch });
export const programId = new PublicKey(config.programId);
