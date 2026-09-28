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
  /** Real SPL supply in public wallets. */
  splSupply?: string;
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
  token: TokenMeta | null;
  privateSupply: string;
  splSupply: string;
  lpSupply: string;
  history: { price: string; time: number }[];
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

/** Asks the backend to re-read these accounts now (after our own transaction). */
export function syncAccounts(addresses: string[]): Promise<void> {
  return post("/api/sync", { accounts: addresses.slice(0, 20) }).then(
    () => undefined,
    () => undefined, // best effort: the live push catches up anyway
  );
}
