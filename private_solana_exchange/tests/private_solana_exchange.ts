import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
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
  /** Best possible output for a trade (exact constant product, fee kept in the pool). */
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
        ...arciumAccounts("swap", offset),
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
    await program.methods.initSwapCompDef(null).accountsPartial(accounts("swap")).rpc({ commitment: "confirmed" });
    for (const circuit of ["seed_pool", "swap"]) {
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
    reserves = { token: reserves.token - out, usdc: reserves.usdc + amountIn };

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
    reserves = { token: reserves.token + amountIn, usdc: reserves.usdc - out };

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
    await program.methods
      .prepareUnshield(offset)
      .accountsPartial({
        payer: user.publicKey,
        eta: etaPda(user.publicKey, mint),
        ...arciumAccounts("commit_balance", offset),
      })
      .signers([user])
      .rpc({ commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
    return program.account.encryptedTokenAccount.fetch(etaPda(user.publicKey, mint));
  }

  /** unshield (verify + mint) and finish_unshield (MPC debit) in one transaction, like the app. */
  async function unshield(user: Keypair, mint: PublicKey, amount: bigint, proof: Awaited<ReturnType<typeof prove>>) {
    const eta = etaPda(user.publicKey, mint);
    const destination = getAssociatedTokenAddressSync(mint, user.publicKey, false, TOKEN_2022_PROGRAM_ID);
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
        config: configPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(user.publicKey, destination, user.publicKey, mint, TOKEN_2022_PROGRAM_ID),
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
