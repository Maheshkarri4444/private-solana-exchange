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
import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { getTokenMetadata } from "@solana/spl-token";
import { type AccountInfo, PublicKey } from "@solana/web3.js";
import idl from "./idl/private_solana_exchange.json" with { type: "json" };
import { type EtaDoc, type PoolDoc, etas, pools, prices, tokens } from "./db.js";
import { connection, programId } from "./solana.js";

const coder = new BorshAccountsCoder(idl as Idl);
const discriminators = new Map(
  (idl as Idl).accounts!.map((a) => [Buffer.from(a.discriminator).toString("hex"), a.name]),
);

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
    slot,
  };
  await upsertNewer(pools(), doc);

  // Keep every price ever seen, not just the 32 the account holds.
  const points = (a.price_history as Decoded[])
    .slice(0, a.history_len)
    .map((p) => ({ pool: address, time: Number(str(p.timestamp)), price: str(p.price) }));
  if (points.length > 0) {
    await prices()
      .bulkWrite(
        points.map((p) => ({ updateOne: { filter: p, update: { $setOnInsert: p }, upsert: true } })),
        { ordered: false },
      )
      .catch(() => {}); // duplicates are expected
  }
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

/** `splSupply` is passed in when a full sync already fetched every mint in one call. */
async function indexTokenInfo(a: Decoded, slot: number, splSupply?: string) {
  const mint = a.mint as PublicKey;
  const supplies = {
    exchangeSupply: str(a.exchange_supply),
    splSupply: splSupply ?? mintSupply(await connection.getAccountInfo(mint)),
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
  // First time we see this token: pull its metadata once.
  const metadata = await getTokenMetadata(connection, mint, "confirmed").catch(() => null);
  if (!metadata) return;
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
