import { sha3_256 } from "@noble/hashes/sha3";

/**
 * The "move to wallet" zero-knowledge proof, made in the browser.
 *
 * Proves SHA3-256(balance ‖ salt) = the fingerprint Arcium published, and
 * 0 < amount ≤ balance, without revealing balance or salt.
 * Circuit: zk/circuits/unshield.circom. Prover: snarkjs (Groth16).
 */

const SNARKJS_URL = "/zk/snarkjs.min.js";
const WASM_URL = "/zk/unshield.wasm";
/** Lists the proving key's parts (82 MB in total, split for GitHub) and its SHA-256. */
const ZKEY_MANIFEST_URL = "/zk/unshield.json";

const hex = (bytes: Uint8Array | number[]) => Buffer.from(bytes).toString("hex");
const be32 = (n: string) => BigInt(n).toString(16).padStart(64, "0");
const toBytes = (h: string) => Array.from(Buffer.from(h, "hex"));

interface SnarkProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}
interface SnarkJs {
  groth16: {
    fullProve(
      input: Record<string, string>,
      wasm: string,
      zkey: Uint8Array,
    ): Promise<{ proof: SnarkProof; publicSignals: string[] }>;
  };
}

let loading: Promise<SnarkJs> | null = null;

/** snarkjs ships a ready browser bundle; loading it as a script avoids bundler trouble. */
function loadSnarkJs(): Promise<SnarkJs> {
  const w = window as unknown as { snarkjs?: SnarkJs };
  if (w.snarkjs) return Promise.resolve(w.snarkjs);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SNARKJS_URL;
    script.onload = () => (w.snarkjs ? resolve(w.snarkjs) : reject(new Error("The ZK prover failed to load")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not load the ZK prover"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

let provingKey: Promise<Uint8Array> | null = null;

/** Downloads the proving key parts once per tab, joins them and checks the SHA-256. */
function loadProvingKey(onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  provingKey ??= (async () => {
    const manifest = (await (await fetch(ZKEY_MANIFEST_URL, { cache: "no-cache" })).json()) as {
      parts: string[];
      bytes: number;
      sha256: string;
    };
    const key = new Uint8Array(manifest.bytes);
    let received = 0;
    for (const part of manifest.parts) {
      // The hash in the URL makes a new key a new URL, so old copies are never reused.
      const res = await fetch(`/zk/${part}?v=${manifest.sha256.slice(0, 16)}`);
      if (!res.ok || !res.body) throw new Error("Could not download the proving key");
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        key.set(value, received);
        received += value.length;
        onProgress?.(received / manifest.bytes);
      }
    }
    const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", key)));
    if (received !== manifest.bytes || digest !== manifest.sha256) {
      throw new Error("The proving key download is corrupted. Please try again.");
    }
    return key;
  })().catch((e) => {
    provingKey = null;
    throw e;
  });
  return provingKey;
}

/** The exact 24 bytes Arcium hashed: balance (8, little-endian) ‖ salt (16, little-endian). */
function fingerprintOf(balance: bigint, salt: bigint): Uint8Array {
  const message = new Uint8Array(24);
  new DataView(message.buffer).setBigUint64(0, balance, true);
  for (let i = 0; i < 16; i++) message[8 + i] = Number((salt >> BigInt(8 * i)) & 0xffn);
  return sha3_256(message);
}


/** The program's `Groth16Proof`: big-endian, G2 as x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0 (EIP-197). */
export interface ProofBytes {
  a: number[];
  b: number[];
  c: number[];
}

export async function proveUnshield(
  input: {
    fingerprint: number[];
    balance: bigint;
    salt: bigint;
    amount: bigint;
  },
  onDownload?: (fraction: number) => void,
): Promise<ProofBytes> {
  const fingerprint = hex(input.fingerprint);
  // Cheap check first: the prover would fail anyway, with a vaguer error.
  if (hex(fingerprintOf(input.balance, input.salt)) !== fingerprint) {
    throw new Error("Your balance no longer matches its fingerprint. Cancel and try again.");
  }
  if (input.amount <= 0n || input.amount > input.balance) {
    throw new Error("Amount must be more than 0 and at most your balance");
  }

  const [snarkjs, zkey] = await Promise.all([loadSnarkJs(), loadProvingKey(onDownload)]);
  const { proof } = await snarkjs.groth16.fullProve(
    {
      commitmentHi: BigInt("0x" + fingerprint.slice(0, 32)).toString(),
      commitmentLo: BigInt("0x" + fingerprint.slice(32)).toString(),
      amount: input.amount.toString(),
      balance: input.balance.toString(),
      salt: input.salt.toString(),
    },
    WASM_URL,
    zkey,
  );
  return {
    a: toBytes(be32(proof.pi_a[0]) + be32(proof.pi_a[1])),
    b: toBytes(
      be32(proof.pi_b[0][1]) + be32(proof.pi_b[0][0]) + be32(proof.pi_b[1][1]) + be32(proof.pi_b[1][0]),
    ),
    c: toBytes(be32(proof.pi_c[0]) + be32(proof.pi_c[1])),
  };
}
