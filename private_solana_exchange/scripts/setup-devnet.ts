/**
 * One-time devnet setup, safe to re-run (skips finished steps):
 *   1. pin fake-USDC image + metadata to IPFS
 *   2. init_config (config + USDC mint)
 *   3. pin each MPC circuit to IPFS and register it with Arcium
 *   4. index USDC in the backend token registry
 *
 * Run from private_solana_exchange/ (backend must be running for step 4):
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
 *   node --env-file=../backend/.env -r ts-node/register scripts/setup-devnet.ts
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  getArciumProgram,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getLookupTableAddress,
  getMXEAccAddress,
  getMXEPublicKey,
} from "@arcium-hq/client";
import { createHash } from "crypto";
import * as fs from "fs";
import { PrivateSolanaExchange } from "../target/types/private_solana_exchange";
import idl from "../target/idl/private_solana_exchange.json";

const PINATA_JWT = process.env.PINATA_JWT!;
const GATEWAY = process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

async function pin(path: string, body: FormData | string): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${PINATA_JWT}` };
  if (typeof body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(`https://api.pinata.cloud/pinning/${path}`, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Pinata ${path}: ${res.status} ${await res.text()}`);
  return `${GATEWAY}/ipfs/${((await res.json()) as { IpfsHash: string }).IpfsHash}`;
}

function pinFile(file: string, mime: string): Promise<string> {
  const form = new FormData();
  const name = file.split("/").pop()!;
  form.append("file", new Blob([fs.readFileSync(file)], { type: mime }), name);
  form.append("pinataMetadata", JSON.stringify({ name }));
  return pin("pinFileToIPFS", form);
}

const pinJson = (name: string, content: object) =>
  pin("pinJSONToIPFS", JSON.stringify({ pinataContent: content, pinataMetadata: { name } }));

async function main() {
  if (!PINATA_JWT) throw new Error("PINATA_JWT missing (run with --env-file=../backend/.env)");

  // "confirmed" everywhere: a "processed" blockhash can be unknown to the node that simulates.
  const env = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(env.connection.rpcEndpoint, "confirmed"),
    env.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" },
  );
  anchor.setProvider(provider);
  const program = new Program<PrivateSolanaExchange>(idl as PrivateSolanaExchange, provider);
  const admin = provider.wallet.publicKey;
  const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const usdcMint = pda(Buffer.from("usdc_mint"));

  console.log("program:", program.programId.toBase58());
  console.log("admin:  ", admin.toBase58());

  const mxeKey = await getMXEPublicKey(provider, program.programId);
  if (!mxeKey) throw new Error("MXE keys not ready yet — wait for keygen, then re-run");
  console.log("MXE x25519 key ready");

  // 1 + 2. Config and fake USDC.
  if (await provider.connection.getAccountInfo(pda(Buffer.from("config")))) {
    console.log("config: already initialized");
  } else {
    const image = await pinFile("scripts/assets/usdc.svg", "image/svg+xml");
    const uri = await pinJson("USDC-metadata.json", {
      name: "USD Coin (Test)",
      symbol: "USDC",
      description: "Free test USDC for the Private Exchange on Solana devnet. Not real money.",
      image,
    });
    const sig = await program.methods
      .initConfig(uri)
      .accountsPartial({ admin, tokenProgram: TOKEN_2022_PROGRAM_ID })
      .rpc({ commitment: "confirmed" });
    console.log("config: initialized, USDC mint", usdcMint.toBase58(), sig);
  }

  // 3. MPC circuits, hosted on IPFS.
  const circuits = {
    credit_balance: (url: string) => program.methods.initCreditBalanceCompDef(url),
    seed_pool: (url: string) => program.methods.initSeedPoolCompDef(url),
    swap: (url: string) => program.methods.initSwapCompDef(url),
    commit_balance: (url: string) => program.methods.initCommitBalanceCompDef(url),
    debit_balance: (url: string) => program.methods.initDebitBalanceCompDef(url),
    place_order: (url: string) => program.methods.initPlaceOrderCompDef(url),
    settle_order: (url: string) => program.methods.initSettleOrderCompDef(url),
  };
  const mxeAccount = getMXEAccAddress(program.programId);
  const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(mxeAccount);
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

  for (const [name, init] of Object.entries(circuits)) {
    const compDefAccount = getCompDefAccAddress(
      program.programId,
      Buffer.from(getCompDefAccOffset(name)).readUInt32LE(),
    );
    if (await provider.connection.getAccountInfo(compDefAccount)) {
      console.log(`${name} circuit: already registered`);
      continue;
    }
    const circuitFile = `build/${name}.arcis`;
    const url = await pinFile(circuitFile, "application/octet-stream");
    console.log(`${name} circuit pinned:`, url);

    // Arcium nodes check the file's SHA-256 against the hash compiled into the program.
    const served = Buffer.from(await (await fetch(url)).arrayBuffer());
    const local = fs.readFileSync(circuitFile);
    if (hash(served) !== hash(local)) throw new Error(`gateway served a different ${name} file`);
    console.log(`${name} sha256 verified:`, hash(local));

    const sig = await init(url)
      .accountsPartial({
        payer: admin,
        mxeAccount,
        compDefAccount,
        addressLookupTable: getLookupTableAddress(program.programId, mxe.lutOffsetSlot),
      })
      .rpc({ commitment: "confirmed" });
    console.log(`${name} circuit: registered`, sig);
  }

  // 4. Token registry (best effort).
  try {
    const res = await fetch(`${BACKEND_URL}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mint: usdcMint.toBase58() }),
    });
    console.log("backend registry:", res.status, res.ok ? "USDC indexed" : await res.text());
  } catch {
    console.log("backend registry: skipped (backend not running) — re-run later to index USDC");
  }

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
