function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  rpcUrl: required("SOLANA_RPC_URL"),
  programId: required("PROGRAM_ID"),
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB ?? "private_exchange",
  pinataJwt: required("PINATA_JWT"),
  pinataGateway: process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud",
};
