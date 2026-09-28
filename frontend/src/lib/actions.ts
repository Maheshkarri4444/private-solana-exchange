import { BN } from "@anchor-lang/core";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { registerToken, uploadMetadata } from "./api";
import { arciumAccounts, newComputationOffset } from "./arcium";
import { type ExchangeProgram, pdas } from "./program";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MpcResult = "credited" | "failed" | "timeout";

/**
 * Waits for the Arcium callback on an ETA. The lock clears when the callback
 * lands; a new nonce means a new ciphertext was written.
 */
async function waitForCallback(
  program: ExchangeProgram,
  eta: PublicKey,
  previousNonce: string,
  timeoutMs = 180_000,
): Promise<MpcResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(2500);
    const account = await program.account.encryptedTokenAccount.fetchNullable(eta);
    if (!account || !account.pendingComputation.equals(PublicKey.default)) continue;
    return account.nonce.toString() !== previousNonce ? "credited" : "failed";
  }
  return "timeout";
}

/**
 * Mints fake USDC (anyone) or your own token (creator) into your encrypted
 * balance: queue the MPC job, then wait for its callback.
 */
export async function mintPrivate(
  program: ExchangeProgram,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint,
): Promise<{ signature: string; result: MpcResult }> {
  const eta = pdas.eta(owner, mint);
  const before = await program.account.encryptedTokenAccount.fetchNullable(eta);
  const previousNonce = before?.nonce.toString() ?? "0";

  const computationOffset = newComputationOffset();
  const signature = await program.methods
    .mintPrivate(computationOffset, new BN(amount.toString()))
    .accountsPartial({
      payer: owner,
      tokenInfo: pdas.tokenInfo(mint),
      eta,
      ...arciumAccounts("credit_balance", computationOffset),
    })
    .rpc({ commitment: "confirmed" });

  const result = await waitForCallback(program, eta, previousNonce);
  return { signature, result };
}

export type CreateStep = "upload" | "create" | "mint" | "done";

/** The token list is only an index; a failure here must not break token creation. */
async function indexToken(mint: PublicKey) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await registerToken(mint.toBase58());
      return;
    } catch {
      await sleep(2000);
    }
  }
  console.warn("Could not index token in the backend registry:", mint.toBase58());
}

/**
 * 1. pin image + metadata to IPFS   2. create the SPL mint (supply 0)
 * 3. mint the full supply privately 4. index it in the backend token list
 */
export async function createToken(
  program: ExchangeProgram,
  creator: PublicKey,
  input: { name: string; symbol: string; description: string; image: File; supply: bigint },
  onStep: (step: CreateStep) => void,
): Promise<{ mint: PublicKey; result: MpcResult }> {
  onStep("upload");
  const { uri } = await uploadMetadata(input);

  onStep("create");
  const mint = Keypair.generate();
  await program.methods
    .createToken(input.name, input.symbol, uri, new BN(input.supply.toString()))
    .accountsPartial({
      creator,
      mint: mint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([mint])
    .rpc({ commitment: "confirmed" });

  onStep("mint");
  const { result } = await mintPrivate(program, creator, mint.publicKey, input.supply);
  await indexToken(mint.publicKey);

  onStep("done");
  return { mint: mint.publicKey, result };
}
