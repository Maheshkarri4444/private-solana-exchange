import { BN } from "@anchor-lang/core";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { Send } from "@/hooks/usePrivateAccount";
import { syncAccounts, uploadMetadata } from "./api";
import { arciumAccounts, decryptBalance, encryptValues, newComputationOffset } from "./arcium";
import type { PrivateKeys } from "./keys";
import { type ExchangeProgram, pdas } from "./program";
import { proveUnshield } from "./zk";

export type MpcResult = "credited" | "failed" | "timeout";

/**
 * Resolves when `done` holds for the account. Listens on the websocket (instant,
 * no polling), with a slow poll as a safety net in case a message is missed.
 */
function waitFor<T>(
  program: ExchangeProgram,
  address: PublicKey,
  fetch: () => Promise<T | null>,
  done: (account: T) => boolean,
  timeoutMs = 180_000,
): Promise<T | null> {
  const connection = program.provider.connection;
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: T | null) => {
      if (finished) return;
      finished = true;
      connection.removeAccountChangeListener(subscription).catch(() => {});
      clearInterval(poll);
      clearTimeout(timer);
      resolve(result);
    };
    const check = () =>
      fetch()
        .then((account) => {
          if (account && done(account)) finish(account);
        })
        .catch(() => {});
    const subscription = connection.onAccountChange(address, check, { commitment: "confirmed" });
    const poll = setInterval(check, 8000);
    const timer = setTimeout(() => finish(null), timeoutMs);
    check();
  });
}

/** Waits for the Arcium callback on an ETA: the lock clears when it lands. */
async function waitForEta(program: ExchangeProgram, eta: PublicKey, previousNonce: string): Promise<MpcResult> {
  const account = await waitFor(
    program,
    eta,
    () => program.account.encryptedTokenAccount.fetchNullable(eta),
    (a) => a.pendingComputation.equals(PublicKey.default),
  );
  if (!account) return "timeout";
  return account.nonce.toString() !== previousNonce ? "credited" : "failed";
}

/** Waits until the pool is no longer running this computation. */
function waitForPool(program: ExchangeProgram, pool: PublicKey, computation: PublicKey) {
  return waitFor(
    program,
    pool,
    () => program.account.pool.fetch(pool),
    (a) => !a.pendingComputation.equals(computation),
  );
}

/** Tells the backend index to re-read what we just changed. */
const sync = (...addresses: PublicKey[]) => syncAccounts(addresses.map((a) => a.toBase58()));

/** The token accounts a user still needs to open before a pool action. */
async function openMissingAccounts(
  program: ExchangeProgram,
  owner: PublicKey,
  mints: PublicKey[],
): Promise<TransactionInstruction[]> {
  const infos = await program.provider.connection.getMultipleAccountsInfo(mints.map((m) => pdas.eta(owner, m)));
  return Promise.all(
    mints
      .filter((_, i) => !infos[i])
      .map((mint) =>
        program.methods
          .openAccount()
          .accountsPartial({ owner, tokenInfo: pdas.tokenInfo(mint), eta: pdas.eta(owner, mint) })
          .instruction(),
      ),
  );
}

async function readBalance(
  program: ExchangeProgram,
  keys: PrivateKeys,
  mxePublicKey: Uint8Array,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const eta = await program.account.encryptedTokenAccount.fetchNullable(pdas.eta(owner, mint));
  if (!eta?.isInitialized) return 0n;
  return decryptBalance(keys.privateKey, mxePublicKey, eta.balanceCt, eta.nonce);
}

/**
 * Mints fake USDC (anyone) or your own token (creator) into your encrypted
 * balance: queue the MPC job, then wait for its callback.
 */
export async function mintPrivate(
  program: ExchangeProgram,
  send: Send,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint,
): Promise<{ signature: string; result: MpcResult }> {
  const eta = pdas.eta(owner, mint);
  const before = await program.account.encryptedTokenAccount.fetchNullable(eta);
  const previousNonce = before?.nonce.toString() ?? "0";

  const computationOffset = newComputationOffset();
  const tx = await program.methods
    .mintPrivate(computationOffset, new BN(amount.toString()))
    .accountsPartial({
      payer: owner,
      tokenInfo: pdas.tokenInfo(mint),
      eta,
      ...arciumAccounts("credit_balance", computationOffset),
    })
    .transaction();
  const signature = await send(tx);

  const result = await waitForEta(program, eta, previousNonce);
  await sync(eta, pdas.tokenInfo(mint));
  return { signature, result };
}

export type CreateStep = "upload" | "create" | "mint" | "done";

/**
 * 1. pin image + metadata to IPFS   2. create the SPL mint (supply 0)
 * 3. mint the full supply privately (the backend indexes the token by itself)
 */
export async function createToken(
  program: ExchangeProgram,
  send: Send,
  creator: PublicKey,
  input: { name: string; symbol: string; description: string; image: File; supply: bigint },
  onStep: (step: CreateStep) => void,
): Promise<{ mint: PublicKey; result: MpcResult }> {
  onStep("upload");
  const { uri } = await uploadMetadata(input);

  onStep("create");
  const mint = Keypair.generate();
  const tx = await program.methods
    .createToken(input.name, input.symbol, uri, new BN(input.supply.toString()))
    .accountsPartial({
      creator,
      mint: mint.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .transaction();
  await send(tx, [mint]);

  onStep("mint");
  const { result } = await mintPrivate(program, send, creator, mint.publicKey, input.supply);

  onStep("done");
  return { mint: mint.publicKey, result };
}

export type PoolStep = "create" | "seed" | "done";

/**
 * 1. create the pool + LP token (skipped if it already exists)
 * 2. seed it privately: amounts are encrypted here, Arcium moves them
 */
export async function createPool(
  program: ExchangeProgram,
  send: Send,
  creator: PublicKey,
  keys: PrivateKeys,
  mxePublicKey: Uint8Array,
  input: {
    tokenMint: PublicKey;
    usdcMint: PublicKey;
    symbol: string;
    uri: string;
    tokenAmount: bigint;
    usdcAmount: bigint;
    feeBps: number;
  },
  onStep: (step: PoolStep) => void,
): Promise<{ pool: PublicKey; ok: boolean }> {
  const pool = pdas.pool(input.tokenMint);
  const lpMint = pdas.lpMint(pool);

  onStep("create");
  let openLp: TransactionInstruction[] = [];
  if (await program.account.pool.fetchNullable(pool)) {
    // Retrying a seed: the pool exists, the LP account may not.
    openLp = await openMissingAccounts(program, creator, [lpMint]);
  } else {
    // The LP account can only be opened once the LP token exists: same transaction, after it.
    const openLpIx = await program.methods
      .openAccount()
      .accountsPartial({ owner: creator, tokenInfo: pdas.tokenInfo(lpMint), eta: pdas.eta(creator, lpMint) })
      .instruction();
    const tx = await program.methods
      .createPool(input.feeBps, input.symbol, input.uri)
      .accountsPartial({
        creator,
        tokenInfo: pdas.tokenInfo(input.tokenMint),
        pool,
        lpMint,
        lpInfo: pdas.tokenInfo(lpMint),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .postInstructions([openLpIx])
      .transaction();
    await send(tx);
  }

  onStep("seed");
  const deposit = encryptValues(keys.privateKey, mxePublicKey, [input.tokenAmount, input.usdcAmount]);
  const computationOffset = newComputationOffset();
  const arcium = arciumAccounts("seed_pool", computationOffset);
  const tx = await program.methods
    .seedPool(computationOffset, deposit.ct, deposit.nonce)
    .accountsPartial({
      payer: creator,
      config: pdas.config(),
      pool,
      tokenInfo: pdas.tokenInfo(input.tokenMint),
      tokenMint: input.tokenMint,
      tokenEta: pdas.eta(creator, input.tokenMint),
      usdcEta: pdas.eta(creator, input.usdcMint),
      lpEta: pdas.eta(creator, lpMint),
      lpInfo: pdas.tokenInfo(lpMint),
      ...arcium,
    })
    .preInstructions(openLp)
    .transaction();
  await send(tx);

  await waitForPool(program, pool, arcium.computationAccount);
  const ok = (await program.account.pool.fetch(pool)).status === 1;
  await sync(
    pool,
    pdas.tokenInfo(lpMint),
    pdas.eta(creator, input.tokenMint),
    pdas.eta(creator, input.usdcMint),
    pdas.eta(creator, lpMint),
  );

  onStep("done");
  return { pool, ok };
}

export interface SwapResult {
  ok: boolean;
  spent: bigint;
  received: bigint;
  signature: string;
}

/**
 * Private swap. The amount and the [minOut, maxOut] range are encrypted here;
 * Arcium pays the best amount in that range that keeps x·y = k. The result is
 * read back by decrypting our own balances before and after.
 */
export async function swap(
  program: ExchangeProgram,
  send: Send,
  owner: PublicKey,
  keys: PrivateKeys,
  mxePublicKey: Uint8Array,
  input: {
    tokenMint: PublicKey;
    usdcMint: PublicKey;
    isBuy: boolean;
    amountIn: bigint;
    minOut: bigint;
    maxOut: bigint;
  },
): Promise<SwapResult> {
  const pool = pdas.pool(input.tokenMint);
  const spendMint = input.isBuy ? input.usdcMint : input.tokenMint;
  const receiveMint = input.isBuy ? input.tokenMint : input.usdcMint;
  const balances = () =>
    Promise.all([
      readBalance(program, keys, mxePublicKey, owner, spendMint),
      readBalance(program, keys, mxePublicKey, owner, receiveMint),
    ]);

  const [spendBefore, receiveBefore] = await balances();
  const openIxs = await openMissingAccounts(program, owner, [input.tokenMint, input.usdcMint]);
  const order = encryptValues(keys.privateKey, mxePublicKey, [input.amountIn, input.minOut, input.maxOut]);
  const computationOffset = newComputationOffset();
  const arcium = arciumAccounts("swap", computationOffset);

  const tx = await program.methods
    .swap(computationOffset, input.isBuy, order.ct, order.nonce)
    .accountsPartial({
      payer: owner,
      config: pdas.config(),
      pool,
      tokenInfo: pdas.tokenInfo(input.tokenMint),
      tokenMint: input.tokenMint,
      usdcEta: pdas.eta(owner, input.usdcMint),
      tokenEta: pdas.eta(owner, input.tokenMint),
      ...arcium,
    })
    .preInstructions(openIxs)
    .transaction();
  const signature = await send(tx);

  await waitForPool(program, pool, arcium.computationAccount);
  const [spendAfter, receiveAfter] = await balances();
  await sync(pool, pdas.eta(owner, input.usdcMint), pdas.eta(owner, input.tokenMint));
  return {
    ok: spendAfter < spendBefore,
    spent: spendBefore - spendAfter,
    received: receiveAfter - receiveBefore,
    signature,
  };
}

/** EncryptedTokenAccount.unshield_state (see the program's unshield.rs). */
export const UNSHIELD = { NONE: 0, COMMITTING: 1, READY: 2, DEBITING: 3 } as const;

export type UnshieldStep = "fingerprint" | "prove" | "mint" | "debit" | "done";

const fetchEta = (program: ExchangeProgram, eta: PublicKey) =>
  program.account.encryptedTokenAccount.fetch(eta);

/** Waits for the MPC callback on an ETA, then returns the account. */
async function settledEta(program: ExchangeProgram, eta: PublicKey) {
  const account = await waitFor(
    program,
    eta,
    () => fetchEta(program, eta),
    (a) => a.pendingComputation.equals(PublicKey.default),
  );
  if (!account) throw new Error("Arcium is taking longer than usual. Refresh in a minute; your funds are safe.");
  return account;
}

/** Queues Arcium's debit of the already-minted amount (step 3; also the retry). */
async function finishIx(program: ExchangeProgram, owner: PublicKey, eta: PublicKey) {
  const computationOffset = newComputationOffset();
  return program.methods
    .finishUnshield(computationOffset)
    .accountsPartial({ payer: owner, eta, ...arciumAccounts("debit_balance", computationOffset) })
    .instruction();
}

/**
 * Moves tokens from the encrypted balance to the public wallet as real SPL tokens.
 * 1. Arcium fingerprints the balance: SHA3(balance ‖ salt)  (skipped if already done)
 * 2. this browser proves in zero knowledge that the balance covers `amount`
 * 3. the program checks the proof and mints; Arcium subtracts `amount` (one transaction)
 */
export async function unshield(
  program: ExchangeProgram,
  send: Send,
  owner: PublicKey,
  keys: PrivateKeys,
  mxePublicKey: Uint8Array,
  mint: PublicKey,
  amount: bigint,
  onStep: (step: UnshieldStep) => void,
): Promise<{ signature: string; debited: boolean }> {
  const eta = pdas.eta(owner, mint);
  let account = await fetchEta(program, eta);
  if (account.unshieldState === UNSHIELD.DEBITING) {
    throw new Error("Your previous move to wallet is still finishing");
  }

  onStep("fingerprint");
  if (account.unshieldState === UNSHIELD.NONE) {
    const computationOffset = newComputationOffset();
    const tx = await program.methods
      .prepareUnshield(computationOffset)
      .accountsPartial({ payer: owner, eta, ...arciumAccounts("commit_balance", computationOffset) })
      .transaction();
    await send(tx);
  }
  account = await settledEta(program, eta);
  if (account.unshieldState !== UNSHIELD.READY) {
    throw new Error("Arcium could not fingerprint your balance. Please try again.");
  }

  onStep("prove");
  const proof = await proveUnshield({
    fingerprint: account.unshieldCommitment,
    balance: decryptBalance(keys.privateKey, mxePublicKey, account.balanceCt, account.nonce),
    salt: decryptBalance(keys.privateKey, mxePublicKey, account.unshieldSaltCt, account.unshieldSaltNonce),
    amount,
  });

  onStep("mint");
  const destination = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const tx = await program.methods
    .unshield(new BN(amount.toString()), proof)
    .accountsPartial({
      owner,
      eta,
      tokenInfo: pdas.tokenInfo(mint),
      mint,
      destination,
      config: pdas.config(),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .preInstructions([
      createAssociatedTokenAccountIdempotentInstruction(owner, destination, owner, mint, TOKEN_2022_PROGRAM_ID),
    ])
    .postInstructions([await finishIx(program, owner, eta)])
    .transaction();
  const signature = await send(tx);

  onStep("debit");
  const after = await settledEta(program, eta);
  await sync(eta, pdas.tokenInfo(mint));
  onStep("done");
  return { signature, debited: after.unshieldState === UNSHIELD.NONE };
}

/** Retries Arcium's debit when a move to wallet got stuck after minting. */
export async function finishUnshield(
  program: ExchangeProgram,
  send: Send,
  owner: PublicKey,
  mint: PublicKey,
): Promise<boolean> {
  const eta = pdas.eta(owner, mint);
  await send(new Transaction().add(await finishIx(program, owner, eta)));
  const after = await settledEta(program, eta);
  await sync(eta);
  return after.unshieldState === UNSHIELD.NONE;
}

/** Unfreezes an account whose move to wallet stopped before anything was minted. */
export async function cancelUnshield(program: ExchangeProgram, send: Send, owner: PublicKey, mint: PublicKey) {
  const eta = pdas.eta(owner, mint);
  const tx = await program.methods.cancelUnshield().accountsPartial({ owner, eta }).transaction();
  await send(tx);
  await sync(eta);
}
