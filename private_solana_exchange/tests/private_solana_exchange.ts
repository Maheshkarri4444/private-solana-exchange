import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTokenMetadata,
} from "@solana/spl-token";
import {
  RescueCipher,
  awaitComputationFinalization,
  getArciumEnv,
  getArciumProgram,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getLookupTableAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
  uploadCircuit,
  x25519,
} from "@arcium-hq/client";
import { kmac256 } from "@noble/hashes/sha3-addons";
import { ed25519 } from "@noble/curves/ed25519";
import { randomBytes } from "crypto";
import * as fs from "fs";
import { expect } from "chai";
import { PrivateSolanaExchange } from "../target/types/private_solana_exchange";

// ---------- key derivation (same as frontend/src/lib/keys.ts) ----------

const SIGN_MESSAGE = "private exchange on solana";
const enc = (s: string) => new TextEncoder().encode(s);
const DOMAIN = enc("private-exchange");

function deriveKeys(signature: Uint8Array) {
  const masterSeed = kmac256(signature, enc("master-seed"), {
    dkLen: 64,
    personalization: DOMAIN,
  });
  const privateKey = kmac256(masterSeed, enc("x25519"), {
    dkLen: 32,
    personalization: DOMAIN,
  });
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

/** What a wallet's signMessage returns for this keypair (Ed25519 is deterministic). */
function signLoginMessage(kp: Keypair): Uint8Array {
  return ed25519.sign(enc(SIGN_MESSAGE), kp.secretKey.slice(0, 32));
}

// ---------- test setup ----------

const USDC = 1_000_000n; // 6 decimals

describe("private exchange: encrypted token accounts", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace
    .PrivateSolanaExchange as Program<PrivateSolanaExchange>;
  const arciumEnv = getArciumEnv();
  const clusterAccount = getClusterAccAddress(arciumEnv.arciumClusterOffset);

  const alice = (provider.wallet as anchor.Wallet).payer; // also the admin
  const bob = Keypair.generate();
  const aliceKeys = deriveKeys(signLoginMessage(alice));
  const bobKeys = deriveKeys(signLoginMessage(bob));

  const pda = (...seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const usdcMint = pda(Buffer.from("usdc_mint"));
  const tokenInfoPda = (mint: PublicKey) => pda(Buffer.from("token"), mint.toBuffer());
  const etaPda = (owner: PublicKey, mint: PublicKey) =>
    pda(Buffer.from("eta"), owner.toBuffer(), mint.toBuffer());

  let mxePublicKey: Uint8Array;
  let memeMint: Keypair;

  async function mintPrivate(user: Keypair, mint: PublicKey, amount: bigint) {
    const computationOffset = new BN(randomBytes(8), "hex");
    await program.methods
      .mintPrivate(computationOffset, new BN(amount.toString()))
      .accountsPartial({
        payer: user.publicKey,
        tokenInfo: tokenInfoPda(mint),
        eta: etaPda(user.publicKey, mint),
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset,
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("credit_balance")).readUInt32LE(),
        ),
      })
      .signers([user])
      .rpc({ commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed",
    );
  }

  /** Decrypts a balance exactly like the browser does. */
  async function readBalance(
    owner: PublicKey,
    mint: PublicKey,
    privateKey: Uint8Array,
  ): Promise<bigint> {
    const eta = await program.account.encryptedTokenAccount.fetch(
      etaPda(owner, mint),
    );
    if (!eta.isInitialized) return 0n;
    const cipher = new RescueCipher(
      x25519.getSharedSecret(privateKey, mxePublicKey),
    );
    const nonce = new Uint8Array(eta.nonce.toArrayLike(Buffer, "le", 16));
    return cipher.decrypt([Array.from(eta.balanceCt)], nonce)[0];
  }

  before(async () => {
    mxePublicKey = await getMXEPublicKeyWithRetry(provider, program.programId);

    const sig = await provider.connection.requestAirdrop(
      bob.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  });

  it("derives the same keys from the same signature", () => {
    const again = deriveKeys(signLoginMessage(alice));
    expect(Buffer.from(again.publicKey)).to.deep.equal(
      Buffer.from(aliceKeys.publicKey),
    );

    // Fixed vector shared with the frontend: signature bytes 0..63.
    const vector = deriveKeys(Uint8Array.from({ length: 64 }, (_, i) => i));
    expect(Buffer.from(vector.publicKey).toString("hex")).to.equal(
      "87a48f57d50b04b3b7de544b88df9ae01ecd2c89d1bc2b1fc6ade4959ca17f77",
    );
  });

  it("sets up config, fake USDC and the MPC circuit", async () => {
    await program.methods
      .initConfig("https://example.com/usdc.json")
      .accountsPartial({ admin: alice.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID })
      .rpc({ commitment: "confirmed" });

    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(mxeAccount);
    await program.methods
      .initCreditBalanceCompDef(null)
      .accountsPartial({
        payer: alice.publicKey,
        mxeAccount,
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("credit_balance")).readUInt32LE(),
        ),
        addressLookupTable: getLookupTableAddress(program.programId, mxe.lutOffsetSlot),
      })
      .rpc({ commitment: "confirmed" });

    await uploadCircuit(
      provider,
      "credit_balance",
      program.programId,
      fs.readFileSync("build/credit_balance.arcis"),
      false,
      500,
      { skipPreflight: true, preflightCommitment: "confirmed", commitment: "confirmed" },
    );

    const usdc = await getMint(provider.connection, usdcMint, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(usdc.supply).to.equal(0n);
    expect(usdc.decimals).to.equal(6);
    const meta = await getTokenMetadata(provider.connection, usdcMint, "confirmed");
    expect(meta?.symbol).to.equal("USDC");
  });

  it("registers users with their x25519 keys", async () => {
    await program.methods
      .registerUser(Array.from(aliceKeys.publicKey))
      .accountsPartial({ owner: alice.publicKey })
      .rpc({ commitment: "confirmed" });
    await program.methods
      .registerUser(Array.from(bobKeys.publicKey))
      .accountsPartial({ owner: bob.publicKey })
      .signers([bob])
      .rpc({ commitment: "confirmed" });

    const user = await program.account.userAccount.fetch(
      pda(Buffer.from("user"), alice.publicKey.toBuffer()),
    );
    expect(Buffer.from(user.encPubkey)).to.deep.equal(Buffer.from(aliceKeys.publicKey));
  });

  it("mints fake USDC into an encrypted balance", async () => {
    await mintPrivate(alice, usdcMint, 1_000n * USDC);
    expect(await readBalance(alice.publicKey, usdcMint, aliceKeys.privateKey)).to.equal(
      1_000n * USDC,
    );

    // Second mint adds to the existing ciphertext.
    await mintPrivate(alice, usdcMint, 250n * USDC);
    expect(await readBalance(alice.publicKey, usdcMint, aliceKeys.privateKey)).to.equal(
      1_250n * USDC,
    );

    const info = await program.account.tokenInfo.fetch(tokenInfoPda(usdcMint));
    expect(info.exchangeSupply.toString()).to.equal((1_250n * USDC).toString());

    // The ciphertext on-chain is not the plaintext.
    const eta = await program.account.encryptedTokenAccount.fetch(
      etaPda(alice.publicKey, usdcMint),
    );
    expect(Buffer.from(eta.balanceCt).readBigUInt64LE(0)).to.not.equal(1_250n * USDC);
  });

  it("creates a token: real SPL mint with 0 supply, full supply private", async () => {
    memeMint = Keypair.generate();
    const supply = 1_000_000n * USDC;

    await program.methods
      .createToken("Meme Coin", "MEME", "https://example.com/meme.json", new BN(supply.toString()))
      .accountsPartial({
        creator: alice.publicKey,
        mint: memeMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([memeMint])
      .rpc({ commitment: "confirmed" });

    await mintPrivate(alice, memeMint.publicKey, supply);

    const spl = await getMint(provider.connection, memeMint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(spl.supply).to.equal(0n);

    const info = await program.account.tokenInfo.fetch(tokenInfoPda(memeMint.publicKey));
    expect(info.exchangeSupply.toString()).to.equal(supply.toString());
    expect(info.creator.toBase58()).to.equal(alice.publicKey.toBase58());

    expect(
      await readBalance(alice.publicKey, memeMint.publicKey, aliceKeys.privateKey),
    ).to.equal(supply);
    // USDC balance lives in a different ETA and is untouched.
    expect(await readBalance(alice.publicKey, usdcMint, aliceKeys.privateKey)).to.equal(
      1_250n * USDC,
    );

    const meta = await getTokenMetadata(provider.connection, memeMint.publicKey, "confirmed");
    expect(meta?.name).to.equal("Meme Coin");
  });

  it("does not let anyone else mint a created token", async () => {
    try {
      await mintPrivate(bob, memeMint.publicKey, 1n);
      expect.fail("bob minted alice's token");
    } catch (e: any) {
      expect(String(e)).to.match(/NotTokenCreator/);
    }
  });

  it("does not allow minting above max supply", async () => {
    try {
      await mintPrivate(alice, memeMint.publicKey, 1n);
      expect.fail("minted above max supply");
    } catch (e: any) {
      expect(String(e)).to.match(/MaxSupplyExceeded/);
    }
  });

  it("keeps each user's balance readable only with their own key", async () => {
    await mintPrivate(bob, usdcMint, 30n * USDC);
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(
      30n * USDC,
    );
    // Alice's key cannot open Bob's balance.
    expect(await readBalance(bob.publicKey, usdcMint, aliceKeys.privateKey)).to.not.equal(
      30n * USDC,
    );
  });

  it("uses a fresh nonce for every ciphertext of the same user", async () => {
    const usdcEta = await program.account.encryptedTokenAccount.fetch(
      etaPda(alice.publicKey, usdcMint),
    );
    const memeEta = await program.account.encryptedTokenAccount.fetch(
      etaPda(alice.publicKey, memeMint.publicKey),
    );
    expect(usdcEta.nonce.toString()).to.not.equal(memeEta.nonce.toString());
  });
});

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries = 20,
  retryDelayMs = 500,
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const key = await getMXEPublicKey(provider, programId);
      if (key) return key;
    } catch (_) {
      // MXE keygen may still be running
    }
    await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  throw new Error(`MXE public key not available after ${maxRetries} attempts`);
}
