import { sha3_256 } from "@noble/hashes/sha3";

/** The fingerprint Arcium publishes: SHA3-256(balance LE 8 bytes ‖ salt LE 16 bytes),
 *  split into two big-endian 16-byte halves (the circuit's public inputs). */
export function commitment(balance, salt) {
  const msg = new Uint8Array(24);
  new DataView(msg.buffer).setBigUint64(0, balance, true);
  for (let i = 0; i < 16; i++) msg[8 + i] = Number((salt >> BigInt(8 * i)) & 0xffn);
  const d = sha3_256(msg);
  const half = (b) => BigInt("0x" + Buffer.from(b).toString("hex"));
  return { hi: half(d.slice(0, 16)), lo: half(d.slice(16)) };
}
