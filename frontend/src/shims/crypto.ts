/**
 * Browser stand-in for Node's `crypto`, covering only what @arcium-hq/client calls:
 * randomBytes, and createHash for sha256 / sha3-256.
 */
import { sha256 } from "@noble/hashes/sha2";
import { sha3_256 } from "@noble/hashes/sha3";
import { Buffer } from "buffer";

export function randomBytes(size: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}

export function createHash(algorithm: string) {
  const hasher =
    algorithm === "sha256"
      ? sha256.create()
      : algorithm === "sha3-256"
        ? sha3_256.create()
        : null;
  if (!hasher) throw new Error(`createHash(${algorithm}) is not supported in the browser`);

  const api = {
    update(data: Uint8Array) {
      hasher.update(data);
      return api;
    },
    digest(): Buffer {
      return Buffer.from(hasher.digest());
    },
  };
  return api;
}

function unsupported(): never {
  throw new Error("AES ciphers are not used by this app");
}
export const createCipheriv = unsupported;
export const createDecipheriv = unsupported;

export default { randomBytes, createHash, createCipheriv, createDecipheriv };
