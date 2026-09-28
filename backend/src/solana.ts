import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import { getTokenMetadata } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl/private_solana_exchange.json" with { type: "json" };
import { config } from "./config.js";

export const connection = new Connection(config.rpcUrl, "confirmed");
export const programId = new PublicKey(config.programId);
const coder = new BorshAccountsCoder(idl as Idl);

// The raw IDL keeps Rust field names, so decoded fields are snake_case.
interface TokenInfoAccount {
  mint: PublicKey;
  creator: PublicKey;
  max_supply: { toString(): string };
  is_usdc: boolean;
  created_at: { toNumber(): number };
}

/** Reads a token's public on-chain facts: TokenInfo PDA + Token-2022 metadata. */
export async function fetchTokenOnChain(mint: PublicKey) {
  const [tokenInfoPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token"), mint.toBuffer()],
    programId,
  );
  const account = await connection.getAccountInfo(tokenInfoPda);
  if (!account || !account.owner.equals(programId)) return null;

  const info = coder.decode<TokenInfoAccount>("TokenInfo", account.data);
  const metadata = await getTokenMetadata(connection, mint, "confirmed");
  if (!metadata) return null;

  return {
    mint: mint.toBase58(),
    creator: info.creator.toBase58(),
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    maxSupply: info.max_supply.toString(),
    isUsdc: info.is_usdc,
    createdAt: new Date(info.created_at.toNumber() * 1000),
  };
}
