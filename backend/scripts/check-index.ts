/**
 * Compares the MongoDB index with the chain, account by account.
 * Run: npm run check-index   (read-only: it changes nothing)
 */
import "dotenv/config";
import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import idl from "../src/idl/private_solana_exchange.json" with { type: "json" };
import { bookViews, books, connectDb, etas, pools, prices, tokens } from "../src/db.js";
import { connection, programId } from "../src/solana.js";

const coder = new BorshAccountsCoder(idl as Idl);
const names = new Map((idl as Idl).accounts!.map((a) => [Buffer.from(a.discriminator).toString("hex"), a.name]));
const str = (v: { toString(): string }) => v.toString();
const b64 = (b: number[]) => Buffer.from(b).toString("base64");

const problems: string[] = [];
const counts: Record<string, number> = {};
const check = (what: string, ok: boolean) => {
  if (!ok) problems.push(what);
};

await connectDb();
const accounts = await connection.getProgramAccounts(programId, { commitment: "confirmed" });

for (const { pubkey, account } of accounts) {
  const type = names.get(account.data.subarray(0, 8).toString("hex")) ?? "Unknown";
  counts[type] = (counts[type] ?? 0) + 1;
  const a = coder.decode<Record<string, any>>(type, account.data);
  const address = pubkey.toBase58();

  if (type === "EncryptedTokenAccount") {
    const doc = await etas().findOne({ address });
    check(`ETA ${address} missing`, !!doc);
    if (!doc) continue;
    check(`ETA ${address} balance`, doc.balanceCt === b64(a.balance_ct) && doc.nonce === str(a.nonce));
    check(`ETA ${address} unshield state`, doc.unshieldState === a.unshield_state);
  } else if (type === "Pool") {
    const doc = await pools().findOne({ address });
    check(`pool ${address} missing`, !!doc);
    if (!doc) continue;
    check(`pool ${address} price/trades`, doc.price === str(a.price) && doc.swapCount === Number(str(a.swap_count)));
    // Every successful seed or trade pushed one price: they should all be stored.
    const expected = a.status === 1 ? Number(str(a.swap_count)) + 1 : 0;
    const stored = await prices().countDocuments({ pool: address });
    check(`pool ${address} price history ${stored}/${expected}`, stored >= expected);
  } else if (type === "OrderBook") {
    const doc = await books().findOne({ address });
    check(`book ${address} missing`, !!doc);
    if (!doc) continue;
    const seqs = (a.seqs as { toString(): string }[]).map(str).join();
    check(`book ${address} slots`, doc.slots.map((x) => String(x.seq)).join() === seqs);
  } else if (type === "OrderViews") {
    const doc = await bookViews().findOne({ address });
    check(`book views ${address} missing`, !!doc);
    if (!doc) continue;
    const cts = (a.views as number[][][]).map((v) => v.map(b64).join()).join();
    check(`book views ${address} ciphertexts`, doc.views.map((v) => v.ciphertexts.join()).join() === cts);
  } else if (type === "TokenInfo") {
    const mint = (a.mint as PublicKey).toBase58();
    const doc = await tokens().findOne({ mint });
    check(`token ${mint} missing`, !!doc);
    if (!doc) continue;
    const info = await connection.getAccountInfo(a.mint as PublicKey);
    const spl = info ? info.data.readBigUInt64LE(36).toString() : "0";
    check(`token ${mint} supplies`, doc.exchangeSupply === str(a.exchange_supply) && doc.splSupply === spl);
  }
}

console.log("on-chain accounts:", counts);
console.log(problems.length ? `${problems.length} problem(s):\n  ${problems.join("\n  ")}` : "index matches the chain ✔");
process.exit(problems.length ? 1 : 0);
