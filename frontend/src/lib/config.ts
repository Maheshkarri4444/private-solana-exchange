import { PublicKey } from "@solana/web3.js";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP",
);
export const ARCIUM_CLUSTER_OFFSET = Number(process.env.NEXT_PUBLIC_ARCIUM_CLUSTER_OFFSET ?? 456);
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** Every exchange token uses 6 decimals (same as the program's TOKEN_DECIMALS). */
export const TOKEN_DECIMALS = 6;

/** The user-panel faucet: 30 test USDC per click. */
export const FAUCET_AMOUNT = 30n * 10n ** BigInt(TOKEN_DECIMALS);

/** Pools store the price as USDC per token × 1e12. */
export const PRICE_SCALE = 1e12;

/** LP minted to a pool's creator when it is seeded (program's INITIAL_LP_SUPPLY). */
export const INITIAL_LP_SUPPLY = 1_000_000n * 10n ** BigInt(TOKEN_DECIMALS);

export const explorerUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;
export const explorerTxUrl = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
