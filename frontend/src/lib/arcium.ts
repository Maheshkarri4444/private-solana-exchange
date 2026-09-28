import { AnchorProvider, BN } from "@anchor-lang/core";
import {
  RescueCipher,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  getMempoolAccAddress,
  x25519,
} from "@arcium-hq/client";
import { ARCIUM_CLUSTER_OFFSET, PROGRAM_ID } from "./config";

export function newComputationOffset(): BN {
  return new BN(Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(8))), "hex");
}

/** The Arcium accounts every queued computation needs. */
export function arciumAccounts(circuit: string, computationOffset: BN) {
  return {
    computationAccount: getComputationAccAddress(ARCIUM_CLUSTER_OFFSET, computationOffset),
    clusterAccount: getClusterAccAddress(ARCIUM_CLUSTER_OFFSET),
    mxeAccount: getMXEAccAddress(PROGRAM_ID),
    mempoolAccount: getMempoolAccAddress(ARCIUM_CLUSTER_OFFSET),
    executingPool: getExecutingPoolAccAddress(ARCIUM_CLUSTER_OFFSET),
    compDefAccount: getCompDefAccAddress(
      PROGRAM_ID,
      Buffer.from(getCompDefAccOffset(circuit)).readUInt32LE(),
    ),
  };
}

let mxeKey: Uint8Array | null = null;

/** The Arcium network's x25519 public key for our program (cached). */
export async function fetchMxePublicKey(provider: AnchorProvider): Promise<Uint8Array> {
  if (mxeKey) return mxeKey;
  const key = await getMXEPublicKey(provider, PROGRAM_ID);
  if (!key) throw new Error("Arcium MXE key is not ready yet");
  mxeKey = key;
  return key;
}

/** Encrypts amounts for Arcium with the user's key (fresh random nonce every time). */
export function encryptValues(
  privateKey: Uint8Array,
  mxePublicKey: Uint8Array,
  values: bigint[],
): { ct: number[][]; nonce: BN } {
  const cipher = new RescueCipher(x25519.getSharedSecret(privateKey, mxePublicKey));
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { ct: cipher.encrypt(values, nonce), nonce: new BN(nonce, "le") };
}

/** Decrypts values Arcium encrypted to us: x25519 shared secret → Rescue key → decrypt. */
export function decryptValues(
  privateKey: Uint8Array,
  mxePublicKey: Uint8Array,
  ciphertexts: number[][],
  nonce: BN,
): bigint[] {
  const cipher = new RescueCipher(x25519.getSharedSecret(privateKey, mxePublicKey));
  return cipher.decrypt(ciphertexts, new Uint8Array(nonce.toArrayLike(Buffer, "le", 16)));
}

/** Decrypts one value (a balance, a salt). */
export function decryptBalance(
  privateKey: Uint8Array,
  mxePublicKey: Uint8Array,
  ciphertext: number[],
  nonce: BN,
): bigint {
  return decryptValues(privateKey, mxePublicKey, [ciphertext], nonce)[0];
}
