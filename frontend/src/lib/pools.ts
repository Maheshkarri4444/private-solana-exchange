import { type PoolRecord, type TokenMeta, getPool, listPools } from "./api";
import { PRICE_SCALE } from "./config";

/** Everything public about a pool. Reserves are never here — they are encrypted. */
export interface PoolView {
  address: string;
  tokenMint: string;
  lpMint: string;
  creator: string;
  feeBps: number;
  active: boolean;
  /** USDC per token. */
  price: number;
  /** Exact on-chain price: USDC per token × 1e12. */
  priceE12: bigint;
  /** Coarse 0–100 score from Arcium. */
  health: number;
  swapCount: number;
  createdAt: number;
  lastTradeAt: number;
  /** Oldest → newest. */
  history: { price: number; time: number }[];
  /** An Arcium job is running on the pool right now. */
  busy: boolean;
  token: TokenMeta | null;
  privateSupply: bigint;
  splSupply: bigint;
  totalSupply: bigint;
  lpSupply: bigint;
}

function toView(p: PoolRecord): PoolView {
  const privateSupply = BigInt(p.privateSupply);
  const splSupply = BigInt(p.splSupply);
  return {
    address: p.address,
    tokenMint: p.tokenMint,
    lpMint: p.lpMint,
    creator: p.creator,
    feeBps: p.feeBps,
    active: p.status === 1,
    price: Number(p.price) / PRICE_SCALE,
    priceE12: BigInt(p.price),
    health: p.health,
    swapCount: p.swapCount,
    createdAt: p.createdAt,
    lastTradeAt: p.lastTradeAt,
    history: p.history.map((h) => ({ price: Number(h.price) / PRICE_SCALE, time: h.time })),
    busy: p.busy,
    token: p.token,
    privateSupply,
    splSupply,
    totalSupply: privateSupply + splSupply,
    lpSupply: BigInt(p.lpSupply),
  };
}

/** All pools, newest first (from the backend index — no chain scan). */
export async function fetchPools(): Promise<PoolView[]> {
  return (await listPools()).map(toView);
}

/** One pool by its token mint, or null if it doesn't exist. */
export async function fetchPool(tokenMint: string): Promise<PoolView | null> {
  try {
    return toView(await getPool(tokenMint));
  } catch {
    return null;
  }
}

/** Price change across the stored history, in percent. */
export function priceChange(pool: PoolView): number {
  const first = pool.history[0]?.price;
  const last = pool.history[pool.history.length - 1]?.price;
  return first && last ? ((last - first) / first) * 100 : 0;
}

/** Market cap = price × total supply (whole tokens). */
export const marketCap = (pool: PoolView) => pool.price * (Number(pool.totalSupply) / 1e6);

export function healthLabel(score: number): { label: string; tone: "good" | "fair" | "weak" | "risky" } {
  if (score >= 75) return { label: "Healthy", tone: "good" };
  if (score >= 50) return { label: "Fair", tone: "fair" };
  if (score >= 25) return { label: "Weak", tone: "weak" };
  return { label: "Risky", tone: "risky" };
}

/**
 * Same scoring as the circuit, for the create-pool preview (the creator knows
 * their own deposit, so computing it locally reveals nothing new).
 */
export function previewHealth(tokenReserve: bigint, usdcReserve: bigint, totalSupply: bigint): number {
  const t = (passed: boolean) => (passed ? 1 : 0);
  const depth =
    t(usdcReserve >= 50_000_000n) + t(usdcReserve >= 250_000_000n) +
    t(usdcReserve >= 1_000_000_000n) + t(usdcReserve >= 5_000_000_000n);
  const lhs = 2n * tokenReserve * 10_000n;
  const backing =
    t(lhs >= 500n * totalSupply) + t(lhs >= 1_000n * totalSupply) +
    t(lhs >= 2_500n * totalSupply) + t(lhs >= 5_000n * totalSupply);
  return Math.floor(((depth + backing) * 25) / 2);
}
