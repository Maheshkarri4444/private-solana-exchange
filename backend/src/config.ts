function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Comma-separated, e.g. "http://localhost:3000,https://your-app.vercel.app".
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim()),
  rpcUrl: required("SOLANA_RPC_URL"),
  programId: required("PROGRAM_ID"),
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB ?? "private_exchange",
  pinataJwt: required("PINATA_JWT"),
  pinataGateway: process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud",
  arciumClusterOffset: Number(process.env.ARCIUM_CLUSTER_OFFSET ?? 456),
  /** JSON secret-key array of the wallet that pays for automatic order settlement (optional). */
  settlerKeypair: process.env.SETTLER_KEYPAIR ?? null,
};
