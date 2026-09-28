import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";

export const connection = new Connection(config.rpcUrl, "confirmed");
export const programId = new PublicKey(config.programId);
