/**
 * Does the follow-up work nobody should have to click for. It only pays the
 * transaction fees; the funds always go to their owner.
 *
 * 1. Order books: when an order trades against resting orders, the program
 *    marks those slots in the book's `settle_mask` (public: which orders traded,
 *    never price or size). This sends `settle_order` for each marked slot, and
 *    Arcium moves the fills into the owner's encrypted balances.
 *
 * 2. LP fees: every pool swap adds its fee to the pool's encrypted fee growth.
 *    Once a pool has been quiet for a moment, this sends `collect_lp_fees` for
 *    each LP holder, and Arcium pays their share into their private balances.
 */
import { AnchorProvider, Program, Wallet } from "@anchor-lang/core";
import {
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
} from "@arcium-hq/client";
import { Keypair, PublicKey } from "@solana/web3.js";
// Anchor's ESM build doesn't re-export BN.
import BN from "bn.js";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { books, etas, pools } from "./db.js";
import idl from "./idl/private_solana_exchange.json" with { type: "json" };
import type { PrivateSolanaExchange } from "./idl/private_solana_exchange.js";
import { syncAccounts } from "./indexer.js";
import { connection, programId } from "./solana.js";

const LOOP_MS = 4_000;
const RETRY_AFTER_MS = 20_000; // after an error (e.g. the owner's account is busy)
const CALLBACK_TIMEOUT_MS = 120_000;
/** A payout briefly locks the pool, so wait until trading pauses this long. */
const POOL_QUIET_S = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const idle = (key: PublicKey) => key.equals(PublicKey.default);

export function startSettler() {
  if (!config.settlerKeypair) {
    console.log("settler: SETTLER_KEYPAIR not set, order books and LP fees won't settle automatically");
    return;
  }
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.settlerKeypair)));
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program<PrivateSolanaExchange>(idl as PrivateSolanaExchange, provider);
  const cluster = config.arciumClusterOffset;
  const configPda = pda(Buffer.from("config"));
  const usdcMint = pda(Buffer.from("usdc_mint"));
  const etaOf = (owner: PublicKey, mint: PublicKey) => pda(Buffer.from("eta"), owner.toBuffer(), mint.toBuffer());
  const busy = new Set<string>();
  const pausedUntil = new Map<string, number>();

  /** Accounts every queued MPC job needs. */
  function arciumAccounts(circuit: string) {
    const offset = new BN(randomBytes(8), "hex");
    const computationAccount = getComputationAccAddress(cluster, offset);
    return {
      offset,
      computationAccount,
      accounts: {
        computationAccount,
        clusterAccount: getClusterAccAddress(cluster),
        mxeAccount: getMXEAccAddress(programId),
        mempoolAccount: getMempoolAccAddress(cluster),
        executingPool: getExecutingPoolAccAddress(cluster),
        compDefAccount: getCompDefAccAddress(programId, Buffer.from(getCompDefAccOffset(circuit)).readUInt32LE()),
      },
    };
  }

  /** Polls until the account's in-flight job is no longer `computation` (Arcium answered). */
  async function waitForCallback(read: () => Promise<{ pendingComputation: PublicKey }>, computation: PublicKey) {
    const deadline = Date.now() + CALLBACK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(2_000);
      if (!(await read()).pendingComputation.equals(computation)) return;
    }
    throw new Error("Arcium did not answer in time");
  }

  // ------------------------------------------------------------ order books

  /** Settles one slot and waits until Arcium's answer has landed. */
  async function settle(book: PublicKey, tokenMint: PublicKey, owner: PublicKey, slot: number) {
    const job = arciumAccounts("book_settle");
    await program.methods
      .settleOrder(job.offset, slot, false)
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        book,
        usdcEta: etaOf(owner, usdcMint),
        tokenEta: etaOf(owner, tokenMint),
        ...job.accounts,
      })
      .rpc({ commitment: "confirmed" });
    await waitForCallback(() => program.account.orderBook.fetch(book), job.computationAccount);
  }

  /** Works through every traded slot of one book, one at a time (each locks the book). */
  async function settleBook(address: string) {
    const book = new PublicKey(address);
    for (;;) {
      const state = await program.account.orderBook.fetch(book);
      if (state.settleMask === 0 || !idle(state.pendingComputation)) return;
      const slot = Math.log2(state.settleMask & -state.settleMask); // lowest marked slot
      const owner = state.owners[slot];
      await settle(book, state.tokenMint, owner, slot);
      console.log(`settler: settled slot ${slot} of book ${address}`);
      await syncAccounts([
        book,
        pda(Buffer.from("book_views"), book.toBuffer()),
        etaOf(owner, usdcMint),
        etaOf(owner, state.tokenMint),
      ]);
    }
  }

  // ------------------------------------------------------------ LP fees

  /** Pays one holder their share of the fees so far. True once nothing is left to pay. */
  async function payHolder(pool: PublicKey, owner: PublicKey): Promise<boolean> {
    const state = await program.account.pool.fetch(pool);
    if (!state.feeGrowthInitialized) return true; // no fee-paying trade yet
    const position = pda(Buffer.from("lp_fees"), pool.toBuffer(), owner.toBuffer());
    if (!(await connection.getAccountInfo(position))) {
      await program.methods
        .openLpPosition()
        .accountsPartial({ payer: payer.publicKey, pool, owner })
        .rpc({ commitment: "confirmed" });
    }
    const record = await program.account.lpPosition.fetch(position);
    if (state.swapCount.lte(record.paidSwapCount)) return true;
    const quietFor = Date.now() / 1000 - state.lastTradeAt.toNumber();
    if (!idle(state.pendingComputation) || !idle(record.pendingComputation) || quietFor < POOL_QUIET_S) {
      return false;
    }

    const job = arciumAccounts("lp_collect");
    await program.methods
      .collectLpFees(job.offset)
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        pool,
        position,
        lpEta: etaOf(owner, state.lpMint),
        usdcEta: etaOf(owner, usdcMint),
        tokenEta: etaOf(owner, state.tokenMint),
        ...job.accounts,
      })
      .rpc({ commitment: "confirmed" });
    await waitForCallback(() => program.account.lpPosition.fetch(position), job.computationAccount);
    console.log(`settler: paid LP fees of pool ${pool.toBase58()} to ${owner.toBase58()}`);
    await syncAccounts([pool, position, etaOf(owner, usdcMint), etaOf(owner, state.tokenMint)]);
    return false; // check again next round: more trades may have landed meanwhile
  }

  /** Pays every LP holder of one pool (in practice the wallet that seeded it). */
  async function payPool(address: string, lpMint: string, swapCount: number) {
    const holders = await etas()
      .find({ mint: lpMint, isInitialized: true }, { projection: { owner: 1 } })
      .toArray();
    let done = holders.length > 0;
    for (const { owner } of holders) {
      done = (await payHolder(new PublicKey(address), new PublicKey(owner))) && done;
    }
    if (done) paidUpTo.set(address, swapCount);
  }

  // ------------------------------------------------------------ loop

  const paidUpTo = new Map<string, number>(); // pool → trade count every holder is paid for

  function run(key: string, work: () => Promise<void>) {
    if (busy.has(key) || (pausedUntil.get(key) ?? 0) > Date.now()) return;
    busy.add(key);
    work()
      .catch((e) => {
        console.error(`settler: ${key} —`, e?.message ?? e);
        pausedUntil.set(key, Date.now() + RETRY_AFTER_MS);
      })
      .finally(() => busy.delete(key));
  }

  async function tick() {
    const waiting = await books().find({ settleMask: { $gt: 0 } }, { projection: { address: 1 } }).toArray();
    for (const { address } of waiting) run(`book ${address}`, () => settleBook(address));

    const traded = await pools()
      .find({ swapCount: { $gt: 0 } }, { projection: { address: 1, lpMint: 1, swapCount: 1 } })
      .toArray();
    for (const { address, lpMint, swapCount } of traded) {
      if (paidUpTo.get(address) === swapCount) continue;
      run(`pool ${address}`, () => payPool(address, lpMint, swapCount));
    }
  }

  setInterval(() => tick().catch((e) => console.error("settler:", e?.message)), LOOP_MS);
  console.log(`settler: on, paying from ${payer.publicKey.toBase58()}`);
}
