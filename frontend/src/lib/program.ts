import { AnchorProvider, Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import idl from "@/idl/private_solana_exchange.json";
import type { PrivateSolanaExchange } from "@/idl/private_solana_exchange";
import { PROGRAM_ID } from "./config";

export type ExchangeProgram = Program<PrivateSolanaExchange>;

export function getProgram(provider: AnchorProvider): ExchangeProgram {
  return new Program<PrivateSolanaExchange>(
    { ...(idl as PrivateSolanaExchange), address: PROGRAM_ID.toBase58() },
    provider,
  );
}

const pda = (...seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

export const pdas = {
  config: () => pda(Buffer.from("config")),
  usdcMint: () => pda(Buffer.from("usdc_mint")),
  user: (owner: PublicKey) => pda(Buffer.from("user"), owner.toBuffer()),
  tokenInfo: (mint: PublicKey) => pda(Buffer.from("token"), mint.toBuffer()),
  eta: (owner: PublicKey, mint: PublicKey) =>
    pda(Buffer.from("eta"), owner.toBuffer(), mint.toBuffer()),
  pool: (tokenMint: PublicKey) => pda(Buffer.from("pool"), tokenMint.toBuffer()),
  lpMint: (pool: PublicKey) => pda(Buffer.from("lp_mint"), pool.toBuffer()),
};

/** Byte offset of `owner` in EncryptedTokenAccount: discriminator 8 + balance_ct 32 + nonce 16. */
export const ETA_OWNER_OFFSET = 56;
/** Byte offset of `creator` in TokenInfo: discriminator 8 + mint 32. */
export const TOKEN_INFO_CREATOR_OFFSET = 40;
