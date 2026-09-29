import { BACKEND_URL } from "./config";

/**
 * The backend mirrors the program's accounts (ciphertexts included), so the
 * browser never has to scan the chain. It cannot read any balance.
 */

export interface TokenMeta {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  image: string | null;
  description: string | null;
  maxSupply: string;
  isUsdc: boolean;
  createdAt: string;
  /** Private supply: sum of all encrypted balances. */
  exchangeSupply?: string;
  /** Real SPL supply (includes what sits in the exchange's vault). */
  splSupply?: string;
  /** Public tokens moved into the exchange's vault (counted in the private supply). */
  vaultAmount?: string;
  /** An SPL token the exchange didn't create: moved in and out through the vault only. */
  isExternal?: boolean;
  decimals?: number;
}

/** Tokens in public wallets: the SPL supply minus what sits in the vault. */
export function publicSupply(token: TokenMeta | null | undefined): bigint {
  const outside = BigInt(token?.splSupply ?? "0") - BigInt(token?.vaultAmount ?? "0");
  return outside > 0n ? outside : 0n;
}

/** One LP holder's share of a pool's swap fees; the lifetime total is encrypted to them. */
export interface LpPositionRecord {
  address: string;
  pool: string;
  owner: string;
  earnedCt: string; // base64
  earnedNonce: string;
  earnedInitialized: boolean;
  /** The pool's trade count their payouts cover. */
  paidSwapCount: number;
  paidAt: number;
  pending: boolean;
}

/** An encrypted token account as stored on-chain: the balance is still a ciphertext. */
export interface EtaRecord {
  address: string;
  owner: string;
  mint: string;
  balanceCt: string; // base64
  nonce: string;
  isInitialized: boolean;
  pending: boolean;
  unshieldState: number;
  unshieldCommitment: string; // hex
  unshieldSaltCt: string; // base64
  unshieldSaltNonce: string;
  unshieldAmount: string;
  /** Tokens already in the vault whose private credit hasn't landed yet. */
  shieldOwed?: string;
  token: TokenMeta | null;
}

export interface PoolRecord {
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
  /** Swap fees are tracked for LP holders (from the first trade after the fee upgrade). */
  feesOn?: boolean;
  token: TokenMeta | null;
  privateSupply: string;
  splSupply: string;
  lpSupply: string;
  history: { price: string; time: number }[];
}

/** A private order book. Which slots hold an order (and whose) is public; the orders are not. */
export interface BookRecord {
  address: string;
  tokenMint: string;
  creator: string;
  initialized: boolean;
  slots: { owner: string | null; seq: number }[];
  ordersPlaced: number;
  createdAt: number;
  lastActivityAt: number;
  busy: boolean;
  /** Slots that traded and are being settled into their owners' balances (one bit per slot). */
  settleMask: number;
  /** Last trade price, micro-USDC per token ("0" = no trade yet). Public. */
  lastPrice: string;
  lastTradeAt: number;
  trades: number;
  /** Public trade prices (micro-USDC per token), oldest first. */
  history: { price: string; time: number }[];
  token: TokenMeta | null;
  /** The pool's public price (USDC per token × 1e12), as a reference, if a pool exists. */
  poolPrice: string | null;
  /** Each owner's encrypted copy of their order, by slot. */
  views: { ciphertexts: string[]; nonce: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Backend error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Pins the image + metadata JSON to IPFS. Returns the metadata URI. */
export function uploadMetadata(input: {
  name: string;
  symbol: string;
  description: string;
  image: File;
}): Promise<{ uri: string; image: string }> {
  const form = new FormData();
  form.append("name", input.name);
  form.append("symbol", input.symbol);
  form.append("description", input.description);
  form.append("image", input.image);
  return request("/api/metadata", { method: "POST", body: form });
}

export const listTokens = (creator?: string) =>
  request<TokenMeta[]>(`/api/tokens${creator ? `?creator=${creator}` : ""}`);

export const listPools = () => request<PoolRecord[]>("/api/pools");

export const getPool = (tokenMint: string) => request<PoolRecord>(`/api/pools/${tokenMint}`);

export const listEtas = (owner: string) => request<EtaRecord[]>(`/api/etas?owner=${owner}`);

export const listLpPositions = (owner: string) => request<LpPositionRecord[]>(`/api/lp-positions?owner=${owner}`);

/** Asks the backend to re-read these accounts now (after our own transaction). */
export function syncAccounts(addresses: string[]): Promise<void> {
  return post("/api/sync", { accounts: addresses.slice(0, 20) }).then(
    () => undefined,
    () => undefined, // best effort: the live push catches up anyway
  );
}

export const listBooks = () => request<BookRecord[]>("/api/books");

export async function getBook(mint: string): Promise<BookRecord | null> {
  try {
    return await request<BookRecord>(`/api/books/${mint}`);
  } catch {
    return null;
  }
}
