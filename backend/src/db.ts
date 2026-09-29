import { Collection, MongoClient } from "mongodb";
import { config } from "./config.js";

/** A token: metadata + public supplies. On-chain data is the source of truth; this is a fast index. */
export interface TokenDoc {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  image: string | null;
  description: string | null;
  maxSupply: string;
  isUsdc: boolean;
  createdAt: Date;
  /** Private supply: sum of all encrypted balances (TokenInfo.exchange_supply). */
  exchangeSupply?: string;
  /** Real SPL supply: tokens moved out to public wallets. */
  splSupply?: string;
  /** Public tokens held in the program's vault (moved in from wallets with `shield`). */
  vaultAmount?: string;
  /** Slot the supplies were read at (older snapshots never overwrite newer ones). */
  supplySlot?: number;
  /** An SPL token this exchange didn't create: never minted here, only held in the vault. */
  isExternal?: boolean;
  /** Exchange-made tokens always have 6; outside tokens can have any. */
  decimals?: number;
}

/**
 * An encrypted token account, exactly as stored on-chain. The balance is a
 * ciphertext: the backend cannot read it, only the owner's browser can.
 */
export interface EtaDoc {
  address: string;
  owner: string;
  mint: string;
  balanceCt: string; // base64, 32 bytes
  nonce: string;
  isInitialized: boolean;
  pending: boolean;
  unshieldState: number;
  unshieldCommitment: string; // hex, 32 bytes
  unshieldSaltCt: string; // base64, 32 bytes
  unshieldSaltNonce: string;
  unshieldAmount: string;
  /** Tokens already in the vault whose private credit hasn't landed yet (a failed MPC job). */
  shieldOwed: string;
  slot: number;
}

export interface PoolDoc {
  address: string;
  tokenMint: string;
  lpMint: string;
  creator: string;
  feeBps: number;
  status: number;
  price: string; // USDC per token × 1e12
  health: number;
  swapCount: number;
  createdAt: number;
  lastTradeAt: number;
  busy: boolean;
  /** Swap fees are being tracked for LP holders (false until the first trade after the upgrade). */
  feesOn: boolean;
  slot: number;
}

/**
 * A private order book. Public: which slots hold an order and whose. The orders
 * themselves are one ciphertext only Arcium can read.
 */
export interface BookDoc {
  address: string;
  tokenMint: string;
  creator: string;
  initialized: boolean;
  /** One entry per slot; owner is null when the slot is free. */
  slots: { owner: string | null; seq: number }[];
  ordersPlaced: number;
  createdAt: number;
  lastActivityAt: number;
  busy: boolean;
  /** Slots that traded and wait for the settler (one bit per slot). */
  settleMask: number;
  /** Last trade price, micro-USDC per token (public). */
  lastPrice: string;
  lastTradeAt: number;
  trades: number;
  slot: number;
}

/**
 * One LP holder's share of a pool's swap fees. Public: how many trades are paid
 * out. The lifetime total is a ciphertext only the holder can open.
 */
export interface LpPositionDoc {
  address: string;
  pool: string;
  owner: string;
  earnedCt: string; // base64, 32 bytes
  earnedNonce: string;
  earnedInitialized: boolean;
  paidSwapCount: number;
  paidAt: number;
  pending: boolean;
  slot: number;
}

/** Each owner's encrypted copy of their order (decrypted only in their browser). */
export interface BookViewsDoc {
  address: string;
  book: string;
  views: { ciphertexts: string[]; nonce: string }[]; // base64
  slot: number;
}

/** Every public trade price of an order book. */
export interface BookPriceDoc {
  book: string;
  time: number;
  price: string;
}

/** Every public price a pool has had (the on-chain ring buffer keeps only 32). */
export interface PricePointDoc {
  pool: string;
  time: number;
  price: string;
}

const client = new MongoClient(config.mongoUri);
let db: ReturnType<MongoClient["db"]> | undefined;

export async function connectDb(): Promise<void> {
  await client.connect();
  db = client.db(config.mongoDb);
  await tokens().createIndex({ mint: 1 }, { unique: true });
  await tokens().createIndex({ creator: 1, createdAt: -1 });
  await etas().createIndex({ address: 1 }, { unique: true });
  await etas().createIndex({ owner: 1 });
  await pools().createIndex({ address: 1 }, { unique: true });
  await pools().createIndex({ tokenMint: 1 }, { unique: true });
  await prices().createIndex({ pool: 1, time: 1, price: 1 }, { unique: true });
  await books().createIndex({ address: 1 }, { unique: true });
  await books().createIndex({ tokenMint: 1 }, { unique: true });
  await bookViews().createIndex({ address: 1 }, { unique: true });
  await bookViews().createIndex({ book: 1 }, { unique: true });
  await bookPrices().createIndex({ book: 1, time: 1, price: 1 }, { unique: true });
  await lpPositions().createIndex({ address: 1 }, { unique: true });
  await lpPositions().createIndex({ owner: 1 });
}

function collection<T extends object>(name: string): Collection<T> {
  if (!db) throw new Error("Database not connected");
  return db.collection<T>(name);
}

export const tokens = () => collection<TokenDoc>("tokens");
export const etas = () => collection<EtaDoc>("etas");
export const pools = () => collection<PoolDoc>("pools");
export const prices = () => collection<PricePointDoc>("pool_prices");
export const books = () => collection<BookDoc>("books");
export const bookViews = () => collection<BookViewsDoc>("book_views");
export const bookPrices = () => collection<BookPriceDoc>("book_prices");
export const lpPositions = () => collection<LpPositionDoc>("lp_positions");
