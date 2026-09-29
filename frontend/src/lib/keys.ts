import { x25519 } from "@noble/curves/ed25519";
import { kmac256 } from "@noble/hashes/sha3-addons";

/** The wallet signs exactly this. Changing it changes every user's keys. */
export const SIGN_MESSAGE = "private exchange on solana";

const enc = (s: string) => new TextEncoder().encode(s);
const DOMAIN = enc("private-exchange");

export interface PrivateKeys {
  privateKey: Uint8Array; // x25519, never leaves the browser
  publicKey: Uint8Array; // x25519, registered on-chain
}

/**
 * signature → master seed → x25519 keypair (Umbra pattern).
 * Same derivation as private_solana_exchange/tests.
 * Test vector: signature bytes 0..63 → public key 87a48f57…ca17f77.
 */
export function deriveKeys(signature: Uint8Array): PrivateKeys {
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

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

// Cached for this browser tab only (sessionStorage is cleared when the tab closes).
const storageKey = (wallet: string) => `private-exchange:keys:${wallet}`;

export function saveKeys(wallet: string, keys: PrivateKeys) {
  sessionStorage.setItem(storageKey(wallet), toHex(keys.privateKey));
}

export function loadKeys(wallet: string): PrivateKeys | null {
  const hex = sessionStorage.getItem(storageKey(wallet));
  if (!hex) return null;
  const privateKey = fromHex(hex);
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}
