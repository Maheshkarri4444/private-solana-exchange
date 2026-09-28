import { Collection, MongoClient } from "mongodb";
import { config } from "./config.js";

/** A token in the registry. On-chain data is the source of truth; this is a fast index. */
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
}

const client = new MongoClient(config.mongoUri);
let tokenCollection: Collection<TokenDoc> | undefined;

export async function connectDb(): Promise<void> {
  await client.connect();
  tokenCollection = client.db(config.mongoDb).collection<TokenDoc>("tokens");
  await tokenCollection.createIndex({ mint: 1 }, { unique: true });
  await tokenCollection.createIndex({ creator: 1, createdAt: -1 });
}

export function tokens(): Collection<TokenDoc> {
  if (!tokenCollection) throw new Error("Database not connected");
  return tokenCollection;
}
