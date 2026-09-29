import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getTokenMetadata,
  mintTo,
} from "@solana/spl-token";
import {
  RescueCipher,
  awaitComputationFinalization,
  createPacker,
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
import { sha3_256 } from "@noble/hashes/sha3";
import * as snarkjs from "snarkjs";
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
  // "confirmed" for blockhash + preflight: "processed" flakes on a busy validator.
  const envProvider = anchor.AnchorProvider.env();
  anchor.setProvider(
    new anchor.AnchorProvider(
      new anchor.web3.Connection(envProvider.connection.rpcEndpoint, "confirmed"),
      envProvider.wallet,
      { commitment: "confirmed", preflightCommitment: "confirmed" },
    ),
  );
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
        tokenMint: mint,
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

  // ---------------------------- private AMM ----------------------------

  const FEE_BPS = 30;
  const MEME_SUPPLY = 1_000_000n * USDC;
  const configPda = pda(Buffer.from("config"));
  const poolPda = (mint: PublicKey) => pda(Buffer.from("pool"), mint.toBuffer());
  const lpMintPda = (pool: PublicKey) => pda(Buffer.from("lp_mint"), pool.toBuffer());

  /** The real reserves, tracked here only to check the circuit's math. */
  let reserves = { token: 0n, usdc: 0n };

  const afterFee = (amountIn: bigint) => {
    const feeQ14 = BigInt(Math.ceil((FEE_BPS * 16384) / 10000));
    return (amountIn * (16384n - feeQ14)) >> 14n;
  };
  /** Fee per LP unit × 2^40, added up exactly like the pool_swap circuit does. */
  const FEE_SCALE = ((1n << 64n) - 1n) / (1_000_000n * USDC);
  const growth = { token: 0n, usdc: 0n };
  const addFee = (side: "token" | "usdc", amountIn: bigint) => {
    growth[side] += ((amountIn - afterFee(amountIn)) * FEE_SCALE) >> 24n;
  };
  /** Best possible output for a trade (constant product on the input after fee). */
  function quote(reserveIn: bigint, reserveOut: bigint, amountIn: bigint): bigint {
    const a = afterFee(amountIn);
    return (reserveOut * a) / (reserveIn + a);
  }
  /** Mirrors the swap circuit: the largest of min + span·k/16 (k = 0..16) that fits. */
  function executedOut(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, minOut: bigint, maxOut: bigint): bigint {
    const a = afterFee(amountIn);
    const span = maxOut > minOut ? maxOut - minOut : 0n;
    let out = 0n;
    for (let k = 0n; k <= 16n; k++) {
      const c = minOut + ((span * k) >> 4n);
      if (c * (reserveIn + a) <= reserveOut * a) out = c;
    }
    return out;
  }
  const priceOf = (r: typeof reserves) => (r.usdc * 10n ** 12n) / (r.token > 0n ? r.token : 1n);
  /** Arcium computes the public price in fixed point, so allow a rounding hair. */
  function expectPrice(actual: { toString(): string }, r: typeof reserves) {
    const got = BigInt(actual.toString());
    const want = priceOf(r);
    const diff = got > want ? got - want : want - got;
    expect(diff <= want / 1_000_000_000n + 1n, `price ${got} vs ${want}`).to.equal(true);
  }
  function healthOf(r: typeof reserves, supply: bigint): number {
    const t = (passed: boolean) => (passed ? 1 : 0);
    const depth =
      t(r.usdc >= 50_000_000n) + t(r.usdc >= 250_000_000n) +
      t(r.usdc >= 1_000_000_000n) + t(r.usdc >= 5_000_000_000n);
    const lhs = 2n * r.token * 10_000n;
    const backing =
      t(lhs >= 500n * supply) + t(lhs >= 1_000n * supply) +
      t(lhs >= 2_500n * supply) + t(lhs >= 5_000n * supply);
    return Math.floor(((depth + backing) * 25) / 2);
  }

  /** Encrypts amounts with the user's key, like the browser does. */
  function encryptValues(keys: { privateKey: Uint8Array }, values: bigint[]) {
    const cipher = new RescueCipher(x25519.getSharedSecret(keys.privateKey, mxePublicKey));
    const nonce = randomBytes(16);
    return { ct: cipher.encrypt(values, nonce), nonce: new BN(nonce, "le") };
  }

  function arciumAccounts(circuit: string, computationOffset: BN) {
    return {
      computationAccount: getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset),
      clusterAccount,
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      compDefAccount: getCompDefAccAddress(
        program.programId,
        Buffer.from(getCompDefAccOffset(circuit)).readUInt32LE(),
      ),
    };
  }

  const openAccountIx = (owner: PublicKey, mint: PublicKey) =>
    program.methods
      .openAccount()
      .accountsPartial({ owner, tokenInfo: tokenInfoPda(mint), eta: etaPda(owner, mint) })
      .instruction();

  async function seedPool(user: Keypair, keys: typeof aliceKeys, mint: PublicKey, token: bigint, usdc: bigint) {
    const pool = poolPda(mint);
    const lpMint = lpMintPda(pool);
    const deposit = encryptValues(keys, [token, usdc]);
    const offset = new BN(randomBytes(8), "hex");
    await program.methods
      .seedPool(offset, deposit.ct, deposit.nonce)
      .accountsPartial({
        payer: user.publicKey,
        config: configPda,
        pool,
        tokenInfo: tokenInfoPda(mint),
        tokenMint: mint,
        tokenEta: etaPda(user.publicKey, mint),
        usdcEta: etaPda(user.publicKey, usdcMint),
        lpEta: etaPda(user.publicKey, lpMint),
        lpInfo: tokenInfoPda(lpMint),
        ...arciumAccounts("seed_pool", offset),
      })
      .signers([user])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  /** Opens missing accounts in the same transaction, then swaps and waits for Arcium. */
  async function swap(user: Keypair, keys: typeof aliceKeys, mint: PublicKey, isBuy: boolean, amountIn: bigint, minOut: bigint, maxOut: bigint) {
    const pre = [];
    for (const m of [mint, usdcMint]) {
      if (!(await provider.connection.getAccountInfo(etaPda(user.publicKey, m)))) {
        pre.push(await openAccountIx(user.publicKey, m));
      }
    }
    const order = encryptValues(keys, [amountIn, minOut, maxOut]);
    const offset = new BN(randomBytes(8), "hex");
    await program.methods
      .swap(offset, isBuy, order.ct, order.nonce)
      .accountsPartial({
        payer: user.publicKey,
        config: configPda,
        pool: poolPda(mint),
        tokenInfo: tokenInfoPda(mint),
        tokenMint: mint,
        usdcEta: etaPda(user.publicKey, usdcMint),
        tokenEta: etaPda(user.publicKey, mint),
        ...arciumAccounts("pool_swap", offset),
      })
      .preInstructions(pre)
      .signers([user])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  const poolState = () => program.account.pool.fetch(poolPda(memeMint.publicKey));

  it("sets up the pool circuits", async () => {
    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(mxeAccount);
    const accounts = (circuit: string) => ({
      payer: alice.publicKey,
      mxeAccount,
      compDefAccount: arciumAccounts(circuit, new BN(0)).compDefAccount,
      addressLookupTable: getLookupTableAddress(program.programId, mxe.lutOffsetSlot),
    });
    await program.methods.initSeedPoolCompDef(null).accountsPartial(accounts("seed_pool")).rpc({ commitment: "confirmed" });
    await program.methods.initPoolSwapCompDef(null).accountsPartial(accounts("pool_swap")).rpc({ commitment: "confirmed" });
    await program.methods.initLpCollectCompDef(null).accountsPartial(accounts("lp_collect")).rpc({ commitment: "confirmed" });
    for (const circuit of ["seed_pool", "pool_swap", "lp_collect"]) {
      await uploadCircuit(provider, circuit, program.programId, fs.readFileSync(`build/${circuit}.arcis`), false, 500, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      });
    }
  });

  it("only the token creator can create its pool", async () => {
    try {
      await program.methods
        .createPool(FEE_BPS, "MEME", "https://example.com/meme.json")
        .accountsPartial({
          creator: bob.publicKey,
          tokenInfo: tokenInfoPda(memeMint.publicKey),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([bob])
        .rpc({ commitment: "confirmed" });
      expect.fail("bob created a pool for alice's token");
    } catch (e: any) {
      expect(String(e)).to.match(/NotPoolCreator/);
    }
  });

  it("creates a MEME/USDC pool with its own LP token", async () => {
    const meme = memeMint.publicKey;
    const pool = poolPda(meme);
    const lpMint = lpMintPda(pool);
    await program.methods
      .createPool(FEE_BPS, "MEME", "https://example.com/meme.json")
      .accountsPartial({
        creator: alice.publicKey,
        tokenInfo: tokenInfoPda(meme),
        pool,
        lpMint,
        lpInfo: tokenInfoPda(lpMint),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .postInstructions([await openAccountIx(alice.publicKey, lpMint)])
      .rpc({ commitment: "confirmed" });

    const p = await poolState();
    expect(p.status).to.equal(0);
    expect(p.feeBps).to.equal(FEE_BPS);
    // Nobody can sign as the pool PDA, so nobody can mint LP through `mint_private`.
    const lpInfo = await program.account.tokenInfo.fetch(tokenInfoPda(lpMint));
    expect(lpInfo.creator.toBase58()).to.equal(pool.toBase58());
    const lpMeta = await getTokenMetadata(provider.connection, lpMint, "confirmed");
    expect(lpMeta?.symbol).to.equal("MEMELP");
  });

  it("seeds the pool privately and publishes only price + health", async () => {
    const meme = memeMint.publicKey;
    await seedPool(alice, aliceKeys, meme, 500_000n * USDC, 1_000n * USDC);
    reserves = { token: 500_000n * USDC, usdc: 1_000n * USDC };

    const p = await poolState();
    expect(p.status).to.equal(1);
    expectPrice(p.price, reserves); // 0.002 USDC per MEME
    expect(p.health).to.equal(healthOf(reserves, MEME_SUPPLY));
    expect(p.historyLen).to.equal(1);
    // Reserves on-chain are ciphertext, not the numbers.
    expect(Buffer.from(p.reservesCt[0]).readBigUInt64LE(0)).to.not.equal(reserves.token);

    // The deposit left Alice's private balances; she got 1,000,000 LP.
    expect(await readBalance(alice.publicKey, meme, aliceKeys.privateKey)).to.equal(500_000n * USDC);
    expect(await readBalance(alice.publicKey, usdcMint, aliceKeys.privateKey)).to.equal(250n * USDC);
    const lpMint = lpMintPda(poolPda(meme));
    expect(await readBalance(alice.publicKey, lpMint, aliceKeys.privateKey)).to.equal(1_000_000n * USDC);
    const lpInfo = await program.account.tokenInfo.fetch(tokenInfoPda(lpMint));
    expect(lpInfo.exchangeSupply.toString()).to.equal((1_000_000n * USDC).toString());
  });

  it("cannot seed the same pool twice", async () => {
    try {
      await seedPool(alice, aliceKeys, memeMint.publicKey, 1n * USDC, 1n * USDC);
      expect.fail("seeded twice");
    } catch (e: any) {
      expect(String(e)).to.match(/PoolAlreadySeeded/);
    }
  });

  it("buys privately and the price goes up", async () => {
    const meme = memeMint.publicKey;
    const before = await poolState();
    const amountIn = 20n * USDC;
    // The browser only knows the public price, so it asks for "spot price, minus
    // 5% slippage". The pool pays the largest step in that range that fits.
    const spot = (amountIn * 10n ** 12n) / BigInt(before.price.toString());
    const maxOut = spot;
    const minOut = (spot * 95n) / 100n;
    const out = executedOut(reserves.usdc, reserves.token, amountIn, minOut, maxOut);
    expect(out <= quote(reserves.usdc, reserves.token, amountIn)).to.equal(true);

    await swap(bob, bobKeys, meme, true, amountIn, minOut, maxOut);
    // Only the input after the fee joins the reserves; the fee is owed to LPs.
    reserves = { token: reserves.token - out, usdc: reserves.usdc + afterFee(amountIn) };
    addFee("usdc", amountIn);

    const after = await poolState();
    expect(BigInt(after.price.toString()) > BigInt(before.price.toString())).to.equal(true);
    expectPrice(after.price, reserves);
    expect(after.health).to.equal(healthOf(reserves, MEME_SUPPLY));
    expect(after.swapCount.toString()).to.equal("1");
    expect(await readBalance(bob.publicKey, meme, bobKeys.privateKey)).to.equal(out);
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(10n * USDC);
  });

  it("sells privately and the price goes down", async () => {
    const meme = memeMint.publicKey;
    const before = await poolState();
    const held = await readBalance(bob.publicKey, meme, bobKeys.privateKey);
    const amountIn = held / 2n;
    // Exact best output as the top of the range: the pool pays exactly that.
    const best = quote(reserves.token, reserves.usdc, amountIn);
    const out = executedOut(reserves.token, reserves.usdc, amountIn, (best * 99n) / 100n, best);
    expect(out).to.equal(best);

    await swap(bob, bobKeys, meme, false, amountIn, (best * 99n) / 100n, best);
    reserves = { token: reserves.token + afterFee(amountIn), usdc: reserves.usdc - out };
    addFee("token", amountIn);

    const after = await poolState();
    expect(BigInt(after.price.toString()) < BigInt(before.price.toString())).to.equal(true);
    expectPrice(after.price, reserves);
    expect(await readBalance(bob.publicKey, meme, bobKeys.privateKey)).to.equal(held - amountIn);
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(10n * USDC + out);
  });

  it("a swap that misses its slippage limit changes nothing", async () => {
    const meme = memeMint.publicKey;
    const before = await poolState();
    const usdcBefore = await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey);
    const best = quote(reserves.usdc, reserves.token, 5n * USDC);

    // Asking for even 1 unit more than the pool can give fails the whole swap.
    await swap(bob, bobKeys, meme, true, 5n * USDC, best + 1n, best + 100n);

    const after = await poolState();
    expect(after.price.toString()).to.equal(before.price.toString());
    expect(after.swapCount.toString()).to.equal(before.swapCount.toString());
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(usdcBefore);
  });

  it("cannot spend more than the private balance", async () => {
    const before = await poolState();
    const usdcBefore = await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey);

    await swap(bob, bobKeys, memeMint.publicKey, true, 1_000n * USDC, 1n, 1_000_000n * USDC);

    const after = await poolState();
    expect(after.price.toString()).to.equal(before.price.toString());
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(usdcBefore);
  });

  it("keeps a public price history for charts", async () => {
    const p = await poolState();
    expect(p.historyLen).to.equal(3); // seed, buy, sell
    const prices = p.priceHistory.slice(0, 3).map((pt) => BigInt(pt.price.toString()));
    expect(prices[1] > prices[0]).to.equal(true);
    expect(prices[2] < prices[1]).to.equal(true);
  });

  // ------------------------------ LP fees ------------------------------

  const LP_SUPPLY = 1_000_000n * USDC;
  const lpPositionPda = (pool: PublicKey, owner: PublicKey) =>
    pda(Buffer.from("lp_fees"), pool.toBuffer(), owner.toBuffer());
  const u64Type = { Integer: { signed: false, width: 64 } } as const;
  type Earned = { token: bigint; usdc: bigint };
  /** The holder's lifetime LP fees: 1 ciphertext only they can open. */
  const earnedPacker = createPacker<Earned, Earned>(
    [
      { name: "token", type: u64Type },
      { name: "usdc", type: u64Type },
    ] as const,
    "Earned",
  );

  /** `payer` sends it (the backend, in the app); the fees go to `owner`. */
  async function collectLpFees(payer: Keypair, owner: PublicKey, mint: PublicKey) {
    const pool = poolPda(mint);
    const offset = new BN(randomBytes(8), "hex");
    await program.methods
      .collectLpFees(offset)
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        pool,
        position: lpPositionPda(pool, owner),
        lpEta: etaPda(owner, lpMintPda(pool)),
        usdcEta: etaPda(owner, usdcMint),
        tokenEta: etaPda(owner, mint),
        ...arciumAccounts("lp_collect", offset),
      })
      .signers([payer])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  async function lpEarned(keys: typeof aliceKeys, owner: PublicKey, mint: PublicKey): Promise<Earned> {
    const position = await program.account.lpPosition.fetch(lpPositionPda(poolPda(mint), owner));
    const cipher = new RescueCipher(x25519.getSharedSecret(keys.privateKey, mxePublicKey));
    const nonce = new Uint8Array(position.earnedNonce.toArrayLike(Buffer, "le", 16));
    return earnedPacker.unpack(cipher.decrypt([Array.from(position.earnedCt)], nonce));
  }

  const memeBalances = async (user: Keypair, keys: typeof aliceKeys) => ({
    usdc: await readBalance(user.publicKey, usdcMint, keys.privateKey),
    meme: await readBalance(user.publicKey, memeMint.publicKey, keys.privateKey),
  });

  it("pays the swap fees to the LP holder privately; anyone can send the payout", async () => {
    const meme = memeMint.publicKey;
    const pool = poolPda(meme);
    await program.methods
      .openLpPosition()
      .accountsPartial({ payer: bob.publicKey, pool, owner: alice.publicKey })
      .signers([bob])
      .rpc({ commitment: "confirmed" });
    const aliceBefore = await memeBalances(alice, aliceKeys);
    const bobBefore = await memeBalances(bob, bobKeys);

    await collectLpFees(bob, alice.publicKey, meme); // bob plays the backend

    // Alice holds all the LP, so she gets the whole fee of both trades
    // (0.30% of 20 USDC, and of the MEME sold), less a rounding unit at most.
    const paid = { token: (LP_SUPPLY * growth.token) >> 40n, usdc: (LP_SUPPLY * growth.usdc) >> 40n };
    const buyFee = 20n * USDC - afterFee(20n * USDC);
    expect(paid.usdc >= buyFee - 1n && paid.usdc <= buyFee).to.equal(true);
    expect(paid.token > 0n).to.equal(true);
    expect(await memeBalances(alice, aliceKeys)).to.deep.equal({
      usdc: aliceBefore.usdc + paid.usdc,
      meme: aliceBefore.meme + paid.token,
    });
    expect(await memeBalances(bob, bobKeys)).to.deep.equal(bobBefore);

    // Her lifetime total is encrypted to her; the chain only sees "paid up to trade N".
    expect(await lpEarned(aliceKeys, alice.publicKey, meme)).to.deep.equal(paid);
    const position = await program.account.lpPosition.fetch(lpPositionPda(pool, alice.publicKey));
    expect(position.paidSwapCount.toString()).to.equal((await poolState()).swapCount.toString());
    expect(position.pendingComputation.equals(PublicKey.default)).to.equal(true);
  });

  it("has nothing to pay again until the next trade", async () => {
    try {
      await collectLpFees(bob, alice.publicKey, memeMint.publicKey);
      expect.fail("paid twice for the same trades");
    } catch (e: any) {
      expect(String(e)).to.match(/NothingToCollect/);
    }
  });

  it("the next payout covers only the new trade, and the lifetime total adds up", async () => {
    const meme = memeMint.publicKey;
    const earnedBefore = await lpEarned(aliceKeys, alice.publicKey, meme);
    const growthBefore = { ...growth };

    const amountIn = 5n * USDC;
    const best = quote(reserves.usdc, reserves.token, amountIn);
    const out = executedOut(reserves.usdc, reserves.token, amountIn, (best * 99n) / 100n, best);
    await swap(bob, bobKeys, meme, true, amountIn, (best * 99n) / 100n, best);
    reserves = { token: reserves.token - out, usdc: reserves.usdc + afterFee(amountIn) };
    addFee("usdc", amountIn);

    const before = await memeBalances(alice, aliceKeys);
    await collectLpFees(alice, alice.publicKey, meme);
    const newUsdc = (LP_SUPPLY * (growth.usdc - growthBefore.usdc)) >> 40n;
    expect(await memeBalances(alice, aliceKeys)).to.deep.equal({ usdc: before.usdc + newUsdc, meme: before.meme });
    expect(await lpEarned(aliceKeys, alice.publicKey, meme)).to.deep.equal({
      token: earnedBefore.token,
      usdc: earnedBefore.usdc + newUsdc,
    });
  });

  // ------------------------- move to wallet (ZK proof) -------------------------

  const UNSHIELD = { NONE: 0, COMMITTING: 1, READY: 2, DEBITING: 3 };
  const ZK_BUILD = "../zk/build";

  // snarkjs keeps worker threads alive; without this, mocha never exits.
  after(async () => {
    await (globalThis as any).curve_bn128?.terminate();
  });

  function decrypt(keys: { privateKey: Uint8Array }, ct: number[], nonce: BN): bigint {
    const cipher = new RescueCipher(x25519.getSharedSecret(keys.privateKey, mxePublicKey));
    return cipher.decrypt([ct], new Uint8Array(nonce.toArrayLike(Buffer, "le", 16)))[0];
  }

  /** The 24 bytes Arcium hashes: balance (8, LE) ‖ salt (16, LE). */
  function fingerprintOf(balance: bigint, salt: bigint): string {
    const msg = Buffer.alloc(24);
    msg.writeBigUInt64LE(balance, 0);
    msg.writeBigUInt64LE(salt & ((1n << 64n) - 1n), 8);
    msg.writeBigUInt64LE(salt >> 64n, 16);
    return Buffer.from(sha3_256(msg)).toString("hex");
  }

  /** Groth16 proof from snarkjs, converted to the program's encoding (EIP-197). */
  async function prove(fingerprint: number[], balance: bigint, salt: bigint, amount: bigint) {
    const hex = Buffer.from(fingerprint).toString("hex");
    const { proof } = await snarkjs.groth16.fullProve(
      {
        commitmentHi: BigInt("0x" + hex.slice(0, 32)).toString(),
        commitmentLo: BigInt("0x" + hex.slice(32)).toString(),
        amount: amount.toString(),
        balance: balance.toString(),
        salt: salt.toString(),
      },
      `${ZK_BUILD}/unshield_js/unshield.wasm`,
      `${ZK_BUILD}/unshield.zkey`,
    );
    const be = (n: string) => Buffer.from(BigInt(n).toString(16).padStart(64, "0"), "hex");
    const bytes = (...parts: string[]) => Array.from(Buffer.concat(parts.map(be)));
    return {
      a: bytes(proof.pi_a[0], proof.pi_a[1]),
      b: bytes(proof.pi_b[0][1], proof.pi_b[0][0], proof.pi_b[1][1], proof.pi_b[1][0]),
      c: bytes(proof.pi_c[0], proof.pi_c[1]),
    };
  }

  async function prepareUnshield(user: Keypair, mint: PublicKey) {
    const offset = new BN(randomBytes(8), "hex");
    const info = await program.account.tokenInfo.fetch(tokenInfoPda(mint));
    await program.methods
      .prepareUnshield(offset)
      .accountsPartial({
        payer: user.publicKey,
        eta: etaPda(user.publicKey, mint),
        tokenInfo: tokenInfoPda(mint),
        tokenCreator: info.creator,
        ...arciumAccounts("commit_balance", offset),
      })
      .signers([user])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
    return program.account.encryptedTokenAccount.fetch(etaPda(user.publicKey, mint));
  }

  const vaultPda = (mint: PublicKey) => pda(Buffer.from("vault"), mint.toBuffer());

  /** unshield (verify + pay out) and finish_unshield (MPC debit) in one transaction, like the app. */
  async function unshield(
    user: Keypair,
    mint: PublicKey,
    amount: bigint,
    proof: Awaited<ReturnType<typeof prove>>,
    tokenProgram = TOKEN_2022_PROGRAM_ID,
  ) {
    const eta = etaPda(user.publicKey, mint);
    const destination = getAssociatedTokenAddressSync(mint, user.publicKey, false, tokenProgram);
    const offset = new BN(randomBytes(8), "hex");
    const finish = await program.methods
      .finishUnshield(offset)
      .accountsPartial({ payer: user.publicKey, eta, ...arciumAccounts("debit_balance", offset) })
      .instruction();
    const tx = await program.methods
      .unshield(new BN(amount.toString()), proof)
      .accountsPartial({
        owner: user.publicKey,
        eta,
        tokenInfo: tokenInfoPda(mint),
        mint,
        destination,
        vault: vaultPda(mint),
        config: configPda,
        tokenProgram,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(user.publicKey, destination, user.publicKey, mint, tokenProgram),
      ])
      .postInstructions([finish])
      .transaction();
    tx.feePayer = user.publicKey;
    tx.recentBlockhash = (await provider.connection.getLatestBlockhash("confirmed")).blockhash;
    tx.sign(user);
    const size = tx.serialize().length;
    const signature = await provider.connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
    await provider.connection.confirmTransaction(signature, "confirmed");
    const confirmed = await provider.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (confirmed?.meta?.err) throw new Error(JSON.stringify(confirmed.meta.logMessages));
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
    return { destination, size, computeUnits: confirmed?.meta?.computeUnitsConsumed };
  }

  it("sets up the unshield circuits", async () => {
    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(mxeAccount);
    const accounts = (circuit: string) => ({
      payer: alice.publicKey,
      mxeAccount,
      compDefAccount: arciumAccounts(circuit, new BN(0)).compDefAccount,
      addressLookupTable: getLookupTableAddress(program.programId, mxe.lutOffsetSlot),
    });
    await program.methods.initCommitBalanceCompDef(null).accountsPartial(accounts("commit_balance")).rpc({ commitment: "confirmed" });
    await program.methods.initDebitBalanceCompDef(null).accountsPartial(accounts("debit_balance")).rpc({ commitment: "confirmed" });
    for (const circuit of ["commit_balance", "debit_balance"]) {
      await uploadCircuit(provider, circuit, program.programId, fs.readFileSync(`build/${circuit}.arcis`), false, 500, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      });
    }
  });

  let bobProof: Awaited<ReturnType<typeof prove>>;
  const MOVE = 4n * USDC;

  it("Arcium fingerprints the balance with the same SHA3 as the ZK circuit", async () => {
    const eta = await prepareUnshield(bob, usdcMint);
    expect(eta.unshieldState).to.equal(UNSHIELD.READY);

    const balance = decrypt(bobKeys, eta.balanceCt, eta.nonce);
    const salt = decrypt(bobKeys, eta.unshieldSaltCt, eta.unshieldSaltNonce);
    // Arcis SHA3 (in MPC) == @noble SHA3 here == the circom SHA3 (zk/scripts/test-vectors.mjs).
    expect(Buffer.from(eta.unshieldCommitment).toString("hex")).to.equal(fingerprintOf(balance, salt));
    // The salt is random 128-bit and only Bob can decrypt it.
    expect(salt > 1n << 64n).to.equal(true);
    expect(decrypt(aliceKeys, eta.unshieldSaltCt, eta.unshieldSaltNonce)).to.not.equal(salt);

    bobProof = await prove(eta.unshieldCommitment, balance, salt, MOVE);
  });

  it("freezes the balance until the move finishes", async () => {
    try {
      await mintPrivate(bob, usdcMint, 1n);
      expect.fail("changed a frozen balance");
    } catch (e: any) {
      expect(String(e)).to.match(/AccountFrozen/);
    }
    try {
      await swap(bob, bobKeys, memeMint.publicKey, true, 1n * USDC, 1n, 2n);
      expect.fail("traded from a frozen balance");
    } catch (e: any) {
      expect(String(e)).to.match(/AccountFrozen/);
    }
  });

  it("rejects the proof for any other amount", async () => {
    try {
      await unshield(bob, usdcMint, MOVE + 1n, bobProof);
      expect.fail("proof accepted for a different amount");
    } catch (e: any) {
      expect(String(e)).to.match(/InvalidProof|0x1785/);
    }
  });

  it("moves tokens to the public wallet as real SPL tokens", async () => {
    const privateBefore = await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey);
    const infoBefore = await program.account.tokenInfo.fetch(tokenInfoPda(usdcMint));

    const { destination, size, computeUnits } = await unshield(bob, usdcMint, MOVE, bobProof);
    console.log(`      unshield tx: ${size} bytes, ${computeUnits} CU`);

    const wallet = await getAccount(provider.connection, destination, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(wallet.amount).to.equal(MOVE);
    const spl = await getMint(provider.connection, usdcMint, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(spl.supply).to.equal(MOVE);

    // Private side: balance and public private-supply both drop by the same amount.
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(privateBefore - MOVE);
    const infoAfter = await program.account.tokenInfo.fetch(tokenInfoPda(usdcMint));
    expect(BigInt(infoBefore.exchangeSupply.toString()) - BigInt(infoAfter.exchangeSupply.toString())).to.equal(MOVE);

    const eta = await program.account.encryptedTokenAccount.fetch(etaPda(bob.publicKey, usdcMint));
    expect(eta.unshieldState).to.equal(UNSHIELD.NONE);
    expect(eta.pendingComputation.equals(PublicKey.default)).to.equal(true);
  });

  it("a proof works only once", async () => {
    try {
      await unshield(bob, usdcMint, MOVE, bobProof);
      expect.fail("proof reused");
    } catch (e: any) {
      expect(String(e)).to.match(/WrongUnshieldStep|0x1784/);
    }
  });

  it("a fresh fingerprint cannot be opened with an old proof, and can be cancelled", async () => {
    const eta = await prepareUnshield(bob, usdcMint);
    expect(eta.unshieldState).to.equal(UNSHIELD.READY);
    try {
      await unshield(bob, usdcMint, MOVE, bobProof); // new salt → new fingerprint
      expect.fail("old proof accepted");
    } catch (e: any) {
      expect(String(e)).to.match(/InvalidProof|0x1785/);
    }

    const before = await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey);
    await program.methods
      .cancelUnshield()
      .accountsPartial({ owner: bob.publicKey, eta: etaPda(bob.publicKey, usdcMint) })
      .signers([bob])
      .rpc({ commitment: "confirmed" });
    const after = await program.account.encryptedTokenAccount.fetch(etaPda(bob.publicKey, usdcMint));
    expect(after.unshieldState).to.equal(UNSHIELD.NONE);
    // Unfrozen and untouched: minting works again.
    await mintPrivate(bob, usdcMint, 1n * USDC);
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(before + 1n * USDC);
  });

  // ------------------------- public tokens in (vault) -------------------------

  const mintAuthorityPda = pda(Buffer.from("mint_authority"));
  const walletOf = (owner: PublicKey, mint: PublicKey, tokenProgram = TOKEN_2022_PROGRAM_ID) =>
    getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
  const splAmount = async (account: PublicKey, tokenProgram = TOKEN_2022_PROGRAM_ID) =>
    (await getAccount(provider.connection, account, "confirmed", tokenProgram)).amount;

  const openVault = (payer: Keypair, mint: PublicKey, tokenProgram = TOKEN_2022_PROGRAM_ID) =>
    program.methods
      .openVault()
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        tokenInfo: tokenInfoPda(mint),
        mint,
        mintAuthority: mintAuthorityPda,
        vault: vaultPda(mint),
        tokenProgram,
      })
      .signers([payer])
      .rpc({ commitment: "confirmed" });

  /** Public wallet → vault → private balance (credited by Arcium). */
  async function shield(user: Keypair, mint: PublicKey, amount: bigint, tokenProgram = TOKEN_2022_PROGRAM_ID) {
    const info = await program.account.tokenInfo.fetch(tokenInfoPda(mint));
    const offset = new BN(randomBytes(8), "hex");
    await program.methods
      .shield(offset, new BN(amount.toString()))
      .accountsPartial({
        payer: user.publicKey,
        tokenInfo: tokenInfoPda(mint),
        tokenCreator: info.creator,
        mint,
        source: walletOf(user.publicKey, mint, tokenProgram),
        vault: vaultPda(mint),
        eta: etaPda(user.publicKey, mint),
        tokenProgram,
        ...arciumAccounts("credit_balance", offset),
      })
      .signers([user])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  /** The whole move to wallet: fingerprint, prove, pay out, debit. */
  async function moveToWallet(user: Keypair, keys: typeof aliceKeys, mint: PublicKey, amount: bigint, tokenProgram = TOKEN_2022_PROGRAM_ID) {
    const eta = await prepareUnshield(user, mint);
    const balance = decrypt(keys, eta.balanceCt, eta.nonce);
    const salt = decrypt(keys, eta.unshieldSaltCt, eta.unshieldSaltNonce);
    await unshield(user, mint, amount, await prove(eta.unshieldCommitment, balance, salt, amount), tokenProgram);
  }

  it("LP tokens stay private: they can't be moved to a wallet", async () => {
    try {
      await prepareUnshield(alice, lpMintPda(poolPda(memeMint.publicKey)));
      expect.fail("moved LP tokens out");
    } catch (e: any) {
      expect(String(e)).to.match(/LpTokensStayPrivate/);
    }
  });

  it("public tokens of an exchange token move back in through the vault", async () => {
    const wallet = walletOf(bob.publicKey, usdcMint);
    const walletBefore = await splAmount(wallet); // the 4 USDC moved out above
    const privateBefore = await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey);
    const infoBefore = await program.account.tokenInfo.fetch(tokenInfoPda(usdcMint));
    const supplyBefore = (await getMint(provider.connection, usdcMint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;

    await openVault(bob, usdcMint); // anyone, once per token
    await shield(bob, usdcMint, 3n * USDC);

    // Not burned and re-minted: the tokens sit in the program's vault.
    expect(await splAmount(wallet)).to.equal(walletBefore - 3n * USDC);
    expect(await splAmount(vaultPda(usdcMint))).to.equal(3n * USDC);
    expect((await getMint(provider.connection, usdcMint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply).to.equal(supplyBefore);
    expect(await readBalance(bob.publicKey, usdcMint, bobKeys.privateKey)).to.equal(privateBefore + 3n * USDC);
    const info = await program.account.tokenInfo.fetch(tokenInfoPda(usdcMint));
    expect(info.vaultAmount.toString()).to.equal((3n * USDC).toString());
    expect(BigInt(info.exchangeSupply.toString()) - BigInt(infoBefore.exchangeSupply.toString())).to.equal(3n * USDC);
    const eta = await program.account.encryptedTokenAccount.fetch(etaPda(bob.publicKey, usdcMint));
    expect(eta.shieldOwed.toString()).to.equal("0");
  });

  it("moving out pays from the vault first and mints only the rest", async () => {
    const wallet = walletOf(bob.publicKey, usdcMint);
    const walletBefore = await splAmount(wallet);
    const supplyBefore = (await getMint(provider.connection, usdcMint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply;

    await moveToWallet(bob, bobKeys, usdcMint, 5n * USDC); // 3 from the vault + 2 minted

    expect(await splAmount(wallet)).to.equal(walletBefore + 5n * USDC);
    expect(await splAmount(vaultPda(usdcMint))).to.equal(0n);
    expect((await getMint(provider.connection, usdcMint, "confirmed", TOKEN_2022_PROGRAM_ID)).supply).to.equal(
      supplyBefore + 2n * USDC,
    );
    const info = await program.account.tokenInfo.fetch(tokenInfoPda(usdcMint));
    expect(info.vaultAmount.toString()).to.equal("0");
  });

  it("tokens moved out still count toward the max supply", async () => {
    await moveToWallet(alice, aliceKeys, memeMint.publicKey, 1n * USDC); // 1 MEME minted to her wallet
    try {
      await mintPrivate(alice, memeMint.publicKey, 1n);
      expect.fail("re-minted what moved out");
    } catch (e: any) {
      expect(String(e)).to.match(/MaxSupplyExceeded/);
    }
  });

  it("any other SPL token can move in, and moves out only from the vault", async () => {
    // A token this program didn't create: classic SPL Token, 9 decimals.
    const ONE = 1_000_000_000n;
    const ext = await createMint(provider.connection, alice, alice.publicKey, null, 9, undefined, undefined, TOKEN_PROGRAM_ID);
    const wallet = await createAssociatedTokenAccount(provider.connection, alice, ext, bob.publicKey, undefined, TOKEN_PROGRAM_ID);
    await mintTo(provider.connection, alice, ext, wallet, alice, 100n * ONE, [], undefined, TOKEN_PROGRAM_ID);

    // Anyone lists it and opens its vault; Bob opens his private account for it.
    await program.methods
      .registerExternalToken()
      .accountsPartial({ payer: bob.publicKey, mint: ext, tokenInfo: tokenInfoPda(ext), tokenProgram: TOKEN_PROGRAM_ID })
      .signers([bob])
      .rpc({ commitment: "confirmed" });
    await openVault(bob, ext, TOKEN_PROGRAM_ID);
    await program.methods
      .openAccount()
      .accountsPartial({ owner: bob.publicKey, tokenInfo: tokenInfoPda(ext), eta: etaPda(bob.publicKey, ext) })
      .signers([bob])
      .rpc({ commitment: "confirmed" });

    await shield(bob, ext, 40n * ONE, TOKEN_PROGRAM_ID);
    expect(await readBalance(bob.publicKey, ext, bobKeys.privateKey)).to.equal(40n * ONE);
    expect(await splAmount(wallet, TOKEN_PROGRAM_ID)).to.equal(60n * ONE);
    expect(await splAmount(vaultPda(ext), TOKEN_PROGRAM_ID)).to.equal(40n * ONE);
    const info = await program.account.tokenInfo.fetch(tokenInfoPda(ext));
    expect(info.isExternal).to.equal(true);
    expect(info.creator.equals(PublicKey.default)).to.equal(true);

    // Nobody can mint it here.
    try {
      await mintPrivate(alice, ext, 1n);
      expect.fail("minted an outside token");
    } catch (e: any) {
      expect(String(e)).to.match(/NotTokenCreator/);
    }

    await moveToWallet(bob, bobKeys, ext, 15n * ONE, TOKEN_PROGRAM_ID);
    expect(await splAmount(wallet, TOKEN_PROGRAM_ID)).to.equal(75n * ONE);
    expect(await splAmount(vaultPda(ext), TOKEN_PROGRAM_ID)).to.equal(25n * ONE);
    expect((await getMint(provider.connection, ext, "confirmed", TOKEN_PROGRAM_ID)).supply).to.equal(100n * ONE);
    expect(await readBalance(bob.publicKey, ext, bobKeys.privateKey)).to.equal(25n * ONE);
  });

  // ------------------------------ private order book ------------------------------

  const LOT = 1_000_000n; // 1 whole token
  const LIMIT = 0, MARKET = 1, POST_ONLY = 2;
  const bookPda = (mint: PublicKey) => pda(Buffer.from("book"), mint.toBuffer());
  const viewsPda = (book: PublicKey) => pda(Buffer.from("book_views"), book.toBuffer());
  const u = (width: number) => ({ Integer: { signed: false, width } }) as const;
  /** An owner's copy of their order arrives packed into 1 ciphertext. */
  type View = { is_buy: boolean; price: bigint; lots: bigint; remaining: bigint; quote: bigint };
  const viewPacker = createPacker<View, View>(
    [
      { name: "is_buy", type: "Bool" },
      { name: "price", type: u(64) },
      { name: "lots", type: u(32) },
      { name: "remaining", type: u(32) },
      { name: "quote", type: u(64) },
    ] as const,
    "OrderView",
  );

  async function placeOrder(
    user: Keypair,
    keys: typeof aliceKeys,
    mint: PublicKey,
    isBuy: boolean,
    price: bigint,
    lots: bigint,
    kind = LIMIT,
  ) {
    const pre = [];
    for (const m of [mint, usdcMint]) {
      if (!(await provider.connection.getAccountInfo(etaPda(user.publicKey, m)))) {
        pre.push(await openAccountIx(user.publicKey, m));
      }
    }
    const order = encryptValues(keys, [isBuy ? 1n : 0n, price, lots]);
    const offset = new BN(randomBytes(8), "hex");
    await program.methods
      .placeOrder(offset, order.ct, order.nonce, kind)
      .accountsPartial({
        payer: user.publicKey,
        config: configPda,
        book: bookPda(mint),
        usdcEta: etaPda(user.publicKey, usdcMint),
        tokenEta: etaPda(user.publicKey, mint),
        ...arciumAccounts("book_place", offset),
      })
      .preInstructions(pre)
      .signers([user])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  /** `payer` triggers it; the order's `owner` gets the funds. */
  async function settleOrder(payer: Keypair, owner: PublicKey, mint: PublicKey, slot: number, cancel = false) {
    const offset = new BN(randomBytes(8), "hex");
    await program.methods
      .settleOrder(offset, slot, cancel)
      .accountsPartial({
        payer: payer.publicKey,
        config: configPda,
        book: bookPda(mint),
        usdcEta: etaPda(owner, usdcMint),
        tokenEta: etaPda(owner, mint),
        ...arciumAccounts("book_settle", offset),
      })
      .signers([payer])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  /** Decrypts the owner's copy of the order in `slot`, like the browser does. */
  async function myOrder(keys: typeof aliceKeys, mint: PublicKey, slot: number) {
    const views = await program.account.orderViews.fetch(viewsPda(bookPda(mint)));
    const cipher = new RescueCipher(x25519.getSharedSecret(keys.privateKey, mxePublicKey));
    const nonce = new Uint8Array(views.nonces[slot].toArrayLike(Buffer, "le", 16));
    return viewPacker.unpack(cipher.decrypt(views.views[slot].map((c) => Array.from(c)), nonce));
  }

  const bookState = () => program.account.orderBook.fetch(bookPda(memeMint.publicKey));
  const occupied = async () => (await bookState()).seqs.map((q) => !q.isZero());
  const balances = async (user: Keypair, keys: typeof aliceKeys) => ({
    usdc: await readBalance(user.publicKey, usdcMint, keys.privateKey),
    meme: await readBalance(user.publicKey, memeMint.publicKey, keys.privateKey),
  });

  it("sets up the order book circuits", async () => {
    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(mxeAccount);
    const accounts = (circuit: string) => ({
      payer: alice.publicKey,
      mxeAccount,
      compDefAccount: arciumAccounts(circuit, new BN(0)).compDefAccount,
      addressLookupTable: getLookupTableAddress(program.programId, mxe.lutOffsetSlot),
    });
    await program.methods.initBookPlaceCompDef(null).accountsPartial(accounts("book_place")).rpc({ commitment: "confirmed" });
    await program.methods.initBookSettleCompDef(null).accountsPartial(accounts("book_settle")).rpc({ commitment: "confirmed" });
    for (const circuit of ["book_place", "book_settle"]) {
      await uploadCircuit(provider, circuit, program.programId, fs.readFileSync(`build/${circuit}.arcis`), false, 500, {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      });
    }
  });

  it("only the token's creator can open its order book, and not for USDC", async () => {
    const create = (user: Keypair, mint: PublicKey) =>
      program.methods
        .createOrderBook()
        .accountsPartial({ creator: user.publicKey, tokenInfo: tokenInfoPda(mint) })
        .signers([user])
        .rpc({ commitment: "confirmed" });
    try {
      await create(bob, memeMint.publicKey);
      expect.fail("bob opened a book for alice's token");
    } catch (e: any) {
      expect(String(e)).to.match(/NotTokenCreator/);
    }
    try {
      await create(alice, usdcMint);
      expect.fail("opened a USDC/USDC book");
    } catch (e: any) {
      expect(String(e)).to.match(/InvalidMarket/);
    }
  });

  it("opens a private MEME/USDC order book", async () => {
    await program.methods
      .createOrderBook()
      .accountsPartial({ creator: alice.publicKey, tokenInfo: tokenInfoPda(memeMint.publicKey) })
      .rpc({ commitment: "confirmed" });
    const book = await bookState();
    expect(book.tokenMint.toBase58()).to.equal(memeMint.publicKey.toBase58());
    expect(book.initialized).to.equal(false);
    expect(book.seqs.every((q) => q.isZero())).to.equal(true);
  });

  it("a resting sell locks tokens; its side, price and size stay hidden", async () => {
    const before = await balances(alice, aliceKeys);
    const etaBefore = await program.account.encryptedTokenAccount.fetch(etaPda(alice.publicKey, usdcMint));

    await placeOrder(alice, aliceKeys, memeMint.publicKey, false, 2500n, 1000n); // sell 1,000 @ 0.0025

    const book = await bookState();
    expect(book.initialized).to.equal(true);
    expect(book.owners[0].toBase58()).to.equal(alice.publicKey.toBase58());
    expect(book.settleMask).to.equal(0);
    expect(book.lastPrice.toString()).to.equal("0");
    expect(await myOrder(aliceKeys, memeMint.publicKey, 0)).to.deep.include({
      is_buy: false, price: 2500n, lots: 1000n, remaining: 1000n, quote: 0n,
    });
    const after = await balances(alice, aliceKeys);
    expect(after.meme).to.equal(before.meme - 1000n * LOT);
    expect(after.usdc).to.equal(before.usdc);
    // Both balances were rewritten, so the chain can't tell this was a sell.
    const etaAfter = await program.account.encryptedTokenAccount.fetch(etaPda(alice.publicKey, usdcMint));
    expect(etaAfter.nonce.toString()).to.not.equal(etaBefore.nonce.toString());
  });

  it("a buy that fills completely is paid at once and never takes a slot", async () => {
    await mintPrivate(bob, usdcMint, 10n * USDC);
    const before = await balances(bob, bobKeys);

    // Buy 400 with a 0.003 limit: fills against the 0.0025 sell, at 0.0025.
    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 3000n, 400n);

    const after = await balances(bob, bobKeys);
    expect(after.meme).to.equal(before.meme + 400n * LOT);
    expect(after.usdc).to.equal(before.usdc - 400n * 2500n); // 1.00 USDC, not the 1.20 locked
    const book = await bookState();
    expect(await occupied()).to.deep.equal([true, false, false, false, false, false, false, false]);
    // Public: alice's order (slot 0) traded, at 0.0025. Not the size, not the side.
    expect(book.settleMask).to.equal(0b1);
    expect(book.lastPrice.toString()).to.equal("2500");
    expect(book.trades.toString()).to.equal("1");
  });

  it("anyone can settle a traded order, and only its owner gets the funds", async () => {
    const aliceBefore = await balances(alice, aliceKeys);
    const bobBefore = await balances(bob, bobKeys);

    await settleOrder(bob, alice.publicKey, memeMint.publicKey, 0); // bob plays the backend

    const aliceAfter = await balances(alice, aliceKeys);
    expect(aliceAfter.usdc).to.equal(aliceBefore.usdc + 400n * 2500n);
    expect(await balances(bob, bobKeys)).to.deep.equal(bobBefore);
    expect(await myOrder(aliceKeys, memeMint.publicKey, 0)).to.deep.include({ remaining: 600n, quote: 400n * 2500n });
    expect((await bookState()).settleMask).to.equal(0);

    // Nothing left to settle, and only the owner may cancel.
    for (const [cancel, error] of [[false, /NothingToSettle/], [true, /NotOrderOwner/]] as const) {
      try {
        await settleOrder(bob, alice.publicKey, memeMint.publicKey, 0, cancel);
        expect.fail("bob touched alice's order");
      } catch (e: any) {
        expect(String(e)).to.match(error);
      }
    }
  });

  it("the cheapest sell fills first (price priority)", async () => {
    await placeOrder(alice, aliceKeys, memeMint.publicKey, false, 2000n, 500n); // slot 1: sell 500 @ 0.002
    const before = await balances(bob, bobKeys);

    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 2600n, 300n); // buy 300 @ 0.0026

    const after = await balances(bob, bobKeys);
    expect(after.meme).to.equal(before.meme + 300n * LOT);
    expect(after.usdc).to.equal(before.usdc - 300n * 2000n); // filled at 0.002, not 0.0025
    expect((await bookState()).settleMask).to.equal(0b10);
    await settleOrder(bob, alice.publicKey, memeMint.publicKey, 1);
    expect(await myOrder(aliceKeys, memeMint.publicKey, 1)).to.deep.include({ remaining: 200n, quote: 300n * 2000n });
  });

  it("a market buy sweeps the best prices and a filled order leaves the book by itself", async () => {
    const before = await balances(bob, bobKeys);

    // Book: sell 600 @ 0.0025 (slot 0), sell 200 @ 0.002 (slot 1). Buy 250, paying at most 0.0026.
    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 2600n, 250n, MARKET);

    const after = await balances(bob, bobKeys);
    expect(after.meme).to.equal(before.meme + 250n * LOT);
    expect(after.usdc).to.equal(before.usdc - (200n * 2000n + 50n * 2500n));
    const book = await bookState();
    expect(book.settleMask).to.equal(0b11);
    expect(book.lastPrice.toString()).to.equal("2500");

    await settleOrder(bob, alice.publicKey, memeMint.publicKey, 1); // fully filled → leaves the book
    await settleOrder(bob, alice.publicKey, memeMint.publicKey, 0);
    expect(await occupied()).to.deep.equal([true, false, false, false, false, false, false, false]);
    expect(await myOrder(aliceKeys, memeMint.publicKey, 0)).to.deep.include({ remaining: 550n });
  });

  it("a market order that finds no price within its limit returns everything", async () => {
    const before = await balances(bob, bobKeys);
    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 2400n, 1000n, MARKET); // nothing sells ≤ 0.0024
    expect(await balances(bob, bobKeys)).to.deep.equal(before);
    expect(await occupied()).to.deep.equal([true, false, false, false, false, false, false, false]);
  });

  it("a post-only order is refused if it would trade, and rests otherwise", async () => {
    const before = await balances(bob, bobKeys);
    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 2600n, 100n, POST_ONLY); // would hit 0.0025
    expect(await balances(bob, bobKeys)).to.deep.equal(before);
    expect(await occupied()).to.deep.equal([true, false, false, false, false, false, false, false]);

    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 2400n, 100n, POST_ONLY); // below the best sell
    expect((await balances(bob, bobKeys)).usdc).to.equal(before.usdc - 100n * 2400n);
    expect((await bookState()).owners[1].toBase58()).to.equal(bob.publicKey.toBase58());
  });

  it("an order the trader can't afford is rejected and changes nothing", async () => {
    const before = await balances(bob, bobKeys);
    const seqsBefore = (await bookState()).seqs.map(String);
    await placeOrder(bob, bobKeys, memeMint.publicKey, true, 1_000_000n, 1_000_000n); // 1M USDC
    expect((await bookState()).seqs.map(String)).to.deep.equal(seqsBefore);
    expect(await balances(bob, bobKeys)).to.deep.equal(before);
  });

  it("cancelling returns what is still locked and frees the slot", async () => {
    const alice0 = await balances(alice, aliceKeys);
    await settleOrder(alice, alice.publicKey, memeMint.publicKey, 0, true); // 550 left of the first sell
    expect((await balances(alice, aliceKeys)).meme).to.equal(alice0.meme + 550n * LOT);

    const bob0 = await balances(bob, bobKeys);
    await settleOrder(bob, bob.publicKey, memeMint.publicKey, 1, true); // the post-only buy
    expect((await balances(bob, bobKeys)).usdc).to.equal(bob0.usdc + 100n * 2400n);
    expect(await occupied()).to.deep.equal(Array(8).fill(false));
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
