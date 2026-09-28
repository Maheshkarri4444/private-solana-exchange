import { PublicKey } from "@solana/web3.js";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "7DtBhe3Fi46dy6Gp1Mj7FbW9oZD3xzRs2RKXurtmL3VP",
);
export const ARCIUM_CLUSTER_OFFSET = Number(process.env.NEXT_PUBLIC_ARCIUM_CLUSTER_OFFSET ?? 456);
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/** Every exchange token uses 6 decimals (same as the program's TOKEN_DECIMALS). */
export const TOKEN_DECIMALS = 6;

export const explorerUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;
export const explorerTxUrl = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
