/**
 * Mirrors the program's accounts into MongoDB so browsers never scan the chain.
 *
 *   start:   one full snapshot (getProgramAccounts)
 *   live:    websocket push for every account the program changes
 *   safety:  a full snapshot again every minute, in case a push was missed
 *
 * It indexes account *state*, never transactions: a failed transaction never
 * changes state, so the database can only reflect what really happened.
 * Balances stay ciphertexts — this server cannot read them.
 */
import { BorshAccountsCoder, BorshCoder, EventParser, type Idl } from "@anchor-lang/core";
import { getTokenMetadata } from "@solana/spl-token";
import { type AccountInfo, PublicKey } from "@solana/web3.js";
import idl from "./idl/private_solana_exchange.json" with { type: "json" };
import {
  type BookDoc,
  type BookViewsDoc,
  type EtaDoc,
  type LpPositionDoc,
  type PoolDoc,
  bookPrices,
  bookViews,
  books,
  etas,
  lpPositions,
  pools,
  prices,
  tokens,
} from "./db.js";
import { connection, programId } from "./solana.js";

const coder = new BorshAccountsCoder(idl as Idl);
const discriminators = new Map(
  (idl as Idl).accounts!.map((a) => [Buffer.from(a.discriminator).toString("hex"), a.name]),
);

const events = new EventParser(programId, new BorshCoder(idl as Idl));

const FULL_SYNC_MS = 60_000;
const DEFAULT_KEY = PublicKey.default.toBase58();

// Decoded accounts use the raw IDL's snake_case names.
type Decoded = Record<string, any>;

const str = (v: { toString(): string } | undefined) => (v ? v.toString() : "0");
const b64 = (bytes: number[] | Uint8Array) => Buffer.from(bytes).toString("base64");

/** Upserts a doc unless a newer slot is already stored (a late snapshot must not undo a push). */
async function upsertNewer<T extends { address: string; slot: number }>(
  col: { updateOne: Function },
  doc: T,
) {
  try {
    await col.updateOne(
      { address: doc.address, slot: { $lte: doc.slot } },
      { $set: doc },
      { upsert: true },
    );
  } catch (e: any) {
    // Duplicate key = a newer version is already stored. That's fine.
    if (e?.code !== 11000) throw e;
  }
}

async function indexEta(address: string, a: Decoded, slot: number) {
  const doc: EtaDoc = {
    address,
    owner: a.owner.toBase58(),
    mint: a.mint.toBase58(),
    balanceCt: b64(a.balance_ct),
    nonce: str(a.nonce),
    isInitialized: a.is_initialized,
    pending: a.pending_computation.toBase58() !== DEFAULT_KEY,
    unshieldState: a.unshield_state ?? 0,
    unshieldCommitment: a.unshield_commitment ? Buffer.from(a.unshield_commitment).toString("hex") : "",
    unshieldSaltCt: a.unshield_salt_ct ? b64(a.unshield_salt_ct) : "",
    unshieldSaltNonce: str(a.unshield_salt_nonce),
    unshieldAmount: str(a.unshield_amount),
    shieldOwed: str(a.shield_owed),
    slot,
  };
  await upsertNewer(etas(), doc);
}

async function indexPool(address: string, a: Decoded, slot: number) {
  const doc: PoolDoc = {
    address,
    tokenMint: a.token_mint.toBase58(),
    lpMint: a.lp_mint.toBase58(),
    creator: a.creator.toBase58(),
    feeBps: a.fee_bps,
    status: a.status,
    price: str(a.price),
    health: a.health,
    swapCount: Number(str(a.swap_count)),
    createdAt: Number(str(a.created_at)),
    lastTradeAt: Number(str(a.last_trade_at)),
    busy: a.pending_computation.toBase58() !== DEFAULT_KEY,
    feesOn: Boolean(a.fee_growth_initialized),
    slot,
  };
  await upsertNewer(pools(), doc);

  // Keep every price ever seen, not just the 32 the account holds.
  const points = (a.price_history as Decoded[])
    .slice(0, a.history_len)
    .map((p) => ({ pool: address, time: Number(str(p.timestamp)), price: str(p.price) }));
  await savePoints(prices(), points);

  // Every successful seed or trade pushed one price. Missing some means the
  // index was offline for more than the 32 the account keeps: rebuild them.
  const expected = doc.status === 1 ? doc.swapCount + 1 : 0;
  if ((await prices().countDocuments({ pool: address })) < expected) {
    backfill(address, doc.swapCount, "PoolUpdated", "pool", prices()).catch((e) =>
      console.error("indexer: price backfill failed —", e?.message),
    );
  }
}

type Point = { time: number; price: string } & ({ pool: string } | { book: string });

async function savePoints(col: { bulkWrite: Function }, points: Point[]) {
  if (points.length === 0) return;
  await col
    .bulkWrite(
      points.map((p) => ({ updateOne: { filter: p, update: { $setOnInsert: p }, upsert: true } })),
      { ordered: false },
    )
    .catch(() => {}); // duplicates are expected
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Trade prices from an account's events (`PoolUpdated` for pools, `OrderPlaced`
 * for books). One RPC call per transaction, spaced out because public RPCs
 * rate-limit getTransaction.
 */
export async function pricesFromEvents(address: string, eventName: string) {
  const points: { time: number; price: string }[] = [];
  let before: string | undefined;
  for (;;) {
    const sigs = await connection.getSignaturesForAddress(new PublicKey(address), { before, limit: 1000 });
    for (const sig of sigs) {
      if (sig.err) continue;
      await sleep(500);
      const tx = await connection.getTransaction(sig.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.blockTime || !tx.meta?.logMessages) continue;
      for (const event of events.parseLogs(tx.meta.logMessages)) {
        const e = event.data as Decoded;
        const mine = (e.pool ?? e.book)?.toBase58() === address;
        const traded = eventName === "PoolUpdated" ? e.ok : Number(str(e.price)) > 0;
        if (event.name === eventName && mine && traded) {
          points.push({ time: tx.blockTime, price: str(e.price) });
        }
      }
    }
    if (sigs.length < 1000) return points;
    before = sigs[sigs.length - 1].signature;
  }
}

const backfilled = new Map<string, number>(); // account → trade count at its last backfill

async function backfill(
  address: string,
  trades: number,
  eventName: string,
  key: "pool" | "book",
  col: { findOne: Function; bulkWrite: Function },
) {
  if (backfilled.get(address) === trades) return; // already tried at this state
  backfilled.set(address, trades);
  let added = 0;
  for (const p of await pricesFromEvents(address, eventName)) {
    // A block's reported time can differ by a second from the clock the program
    // saw, so a stored point with the same price a moment apart is the same trade.
    const near = { [key]: address, price: p.price, time: { $gte: p.time - 5, $lte: p.time + 5 } };
    if (await col.findOne(near)) continue;
    await savePoints(col, [{ [key]: address, ...p } as Point]);
    added++;
  }
  console.log(`indexer: rebuilt ${added} missing prices for ${key} ${address} from events`);
}

async function indexBook(address: string, a: Decoded, slot: number) {
  const doc: BookDoc = {
    address,
    tokenMint: a.token_mint.toBase58(),
    creator: a.creator.toBase58(),
    initialized: a.initialized,
    slots: (a.seqs as { toString(): string }[]).map((seq, i) => ({
      owner: Number(str(seq)) === 0 ? null : a.owners[i].toBase58(),
      seq: Number(str(seq)),
    })),
    ordersPlaced: Number(str(a.orders_placed)),
    createdAt: Number(str(a.created_at)),
    lastActivityAt: Number(str(a.last_activity_at)),
    busy: a.pending_computation.toBase58() !== DEFAULT_KEY,
    settleMask: a.settle_mask,
    lastPrice: str(a.last_price),
    lastTradeAt: Number(str(a.last_trade_at)),
    trades: Number(str(a.trades)),
    slot,
  };
  await upsertNewer(books(), doc);

  // The account holds only the latest trade: keep each one for the chart, and
  // rebuild from events if the index missed some while offline.
  if (doc.trades === 0) return;
  await savePoints(bookPrices(), [{ book: address, time: doc.lastTradeAt, price: doc.lastPrice }]);
  if ((await bookPrices().countDocuments({ book: address })) < doc.trades) {
    backfill(address, doc.trades, "OrderPlaced", "book", bookPrices()).catch((e) =>
      console.error("indexer: book price backfill failed —", e?.message),
    );
  }
}

async function indexBookViews(address: string, a: Decoded, slot: number) {
  const doc: BookViewsDoc = {
    address,
    book: a.book.toBase58(),
    views: (a.views as number[][][]).map((cts, i) => ({
      ciphertexts: cts.map(b64),
      nonce: str(a.nonces[i]),
    })),
    slot,
  };
  await upsertNewer(bookViews(), doc);
}

async function indexLpPosition(address: string, a: Decoded, slot: number) {
  const doc: LpPositionDoc = {
    address,
    pool: a.pool.toBase58(),
    owner: a.owner.toBase58(),
    earnedCt: b64(a.earned_ct),
    earnedNonce: str(a.earned_nonce),
    earnedInitialized: a.earned_initialized,
    paidSwapCount: Number(str(a.paid_swap_count)),
    paidAt: Number(str(a.paid_at)),
    pending: a.pending_computation.toBase58() !== DEFAULT_KEY,
    slot,
  };
  await upsertNewer(lpPositions(), doc);
}

/** Reads `image` / `description` from a token's metadata JSON, if reachable. */
export async function fetchOffChainMetadata(uri: string) {
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { image: null, description: null };
    const json = (await res.json()) as { image?: string; description?: string };
    return { image: json.image ?? null, description: json.description ?? null };
  } catch {
    return { image: null, description: null };
  }
}

function mintSupply(info: AccountInfo<Buffer> | null): string {
  return info && info.data.length >= 44 ? info.data.readBigUInt64LE(36).toString() : "0";
}

const METAPLEX = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/** Name / symbol / URI of an outside token: Token-2022 metadata, else Metaplex, else its address. */
async function outsideMetadata(mint: PublicKey) {
  const own = await getTokenMetadata(connection, mint, "confirmed").catch(() => null);
  if (own) return { name: own.name, symbol: own.symbol, uri: own.uri };
  const [address] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METAPLEX.toBuffer(), mint.toBuffer()],
    METAPLEX,
  );
  const info = await connection.getAccountInfo(address).catch(() => null);
  if (info?.owner.equals(METAPLEX)) {
    try {
      // key (1) + update authority (32) + mint (32), then three length-prefixed strings.
      let offset = 65;
      const next = () => {
        const len = info.data.readUInt32LE(offset);
        const text = info.data.subarray(offset + 4, offset + 4 + len).toString("utf8");
        offset += 4 + len;
        return text.replace(/\0/g, "").trim();
      };
      const name = next();
      const symbol = next();
      const uri = next();
      if (name || symbol) return { name: name || symbol, symbol: symbol || name, uri };
    } catch {
      // not a metadata layout we know: fall through
    }
  }
  const short = mint.toBase58().slice(0, 4);
  return { name: `Token ${short}…`, symbol: short.toUpperCase(), uri: "" };
}

/** `splSupply` is passed in when a full sync already fetched every mint in one call. */
async function indexTokenInfo(a: Decoded, slot: number, splSupply?: string) {
  const mint = a.mint as PublicKey;
  const supplies = {
    exchangeSupply: str(a.exchange_supply),
    splSupply: splSupply ?? mintSupply(await connection.getAccountInfo(mint)),
    vaultAmount: str(a.vault_amount),
    supplySlot: slot,
  };
  const known = await tokens().findOne({ mint: mint.toBase58() }, { projection: { _id: 1 } });
  if (known) {
    // Only move forward in time: an older snapshot must not undo a newer update.
    await tokens().updateOne(
      { mint: mint.toBase58(), $or: [{ supplySlot: { $lte: slot } }, { supplySlot: { $exists: false } }] },
      { $set: supplies },
    );
    return;
  }
  // First time we see this token: pull its metadata once. Exchange-made tokens
  // always carry Token-2022 metadata (if it isn't readable yet, try again later).
  const isExternal = Boolean(a.is_external);
  const metadata = isExternal
    ? await outsideMetadata(mint)
    : await getTokenMetadata(connection, mint, "confirmed").catch(() => null);
  if (!metadata) return;
  const mintAccount = await connection.getAccountInfo(mint);
  await tokens().updateOne(
    { mint: mint.toBase58() },
    {
      $set: {
        mint: mint.toBase58(),
        creator: a.creator.toBase58(),
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        maxSupply: str(a.max_supply),
        isUsdc: a.is_usdc,
        isExternal,
        decimals: mintAccount && mintAccount.data.length > 44 ? mintAccount.data[44] : 6,
        createdAt: new Date(Number(str(a.created_at)) * 1000),
        ...supplies,
        ...(await fetchOffChainMetadata(metadata.uri)),
      },
    },
    { upsert: true },
  );
}

const typeOf = (info: AccountInfo<Buffer>) =>
  discriminators.get(info.data.subarray(0, 8).toString("hex"));

/** Decodes one program account and stores it. Unknown types are ignored. */
async function indexAccount(
  pubkey: PublicKey,
  info: AccountInfo<Buffer>,
  slot: number,
  splSupply?: string,
) {
  const type = typeOf(info);
  if (!type) return;
  const decoded = coder.decode<Decoded>(type, info.data);
  const address = pubkey.toBase58();
  if (type === "EncryptedTokenAccount") await indexEta(address, decoded, slot);
  else if (type === "Pool") await indexPool(address, decoded, slot);
  else if (type === "TokenInfo") await indexTokenInfo(decoded, slot, splSupply);
  else if (type === "OrderBook") await indexBook(address, decoded, slot);
  else if (type === "OrderViews") await indexBookViews(address, decoded, slot);
  else if (type === "LpPosition") await indexLpPosition(address, decoded, slot);
}

/** Every mint's SPL supply in as few RPC calls as possible (100 accounts per call). */
async function fetchMintSupplies(mints: PublicKey[]): Promise<Map<string, string>> {
  const supplies = new Map<string, string>();
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const infos = await connection.getMultipleAccountsInfo(batch);
    batch.forEach((m, j) => supplies.set(m.toBase58(), mintSupply(infos[j])));
  }
  return supplies;
}

export async function fullSync() {
  const { context, value } = await connection.getProgramAccounts(programId, { withContext: true });

  const tokenMints = value
    .filter(({ account }) => typeOf(account) === "TokenInfo")
    .map(({ account }) => coder.decode<Decoded>("TokenInfo", account.data).mint as PublicKey);
  const supplies = await fetchMintSupplies(tokenMints);

  for (const { pubkey, account } of value) {
    const type = typeOf(account);
    const spl =
      type === "TokenInfo"
        ? supplies.get((coder.decode<Decoded>("TokenInfo", account.data).mint as PublicKey).toBase58())
        : undefined;
    await indexAccount(pubkey, account, context.slot, spl).catch((e) =>
      console.error("index failed", pubkey.toBase58(), e?.message),
    );
  }
  return value.length;
}

/** Re-reads specific accounts now (the app calls this right after its own transactions). */
export async function syncAccounts(addresses: PublicKey[]) {
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(addresses);
  let synced = 0;
  for (const [i, info] of value.entries()) {
    if (info?.owner.equals(programId)) {
      await indexAccount(addresses[i], info, context.slot);
      synced++;
    }
  }
  return synced;
}

export function startIndexer() {
  const run = () =>
    fullSync()
      .then((n) => console.log(`indexer: synced ${n} accounts`))
      .catch((e) => console.error("indexer: full sync failed —", e?.message));

  run();
  setInterval(run, FULL_SYNC_MS);

  connection.onProgramAccountChange(
    programId,
    (keyed, context) => {
      indexAccount(keyed.accountId, keyed.accountInfo, context.slot).catch((e) =>
        console.error("indexer: live update failed —", e?.message),
      );
    },
    { commitment: "confirmed" },
  );
  console.log("indexer: listening for account changes");
}
