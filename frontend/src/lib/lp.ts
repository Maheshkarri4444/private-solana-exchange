import { BN } from "@anchor-lang/core";
import { createPacker } from "@arcium-hq/client";
import type { LpPositionRecord } from "./api";
import { decryptValues } from "./arcium";
import type { PrivateKeys } from "./keys";

/** Lifetime swap fees paid to one LP holder, in base units. (A type alias: the packer needs one.) */
export type Earned = {
  token: bigint;
  usdc: bigint;
};

const u64 = { Integer: { signed: false, width: 64 } } as const;

/** The circuit's `Earned`, packed into 1 ciphertext encrypted to the holder. */
const earnedPacker = createPacker<Earned, Earned>(
  [
    { name: "token", type: u64 },
    { name: "usdc", type: u64 },
  ] as const,
  "Earned",
);

/** Decrypts a position's lifetime fees in this browser (zero before the first payout). */
export function decryptEarned(position: LpPositionRecord, keys: PrivateKeys, mxePublicKey: Uint8Array): Earned {
  if (!position.earnedInitialized) return { token: 0n, usdc: 0n };
  const values = decryptValues(
    keys.privateKey,
    mxePublicKey,
    [Array.from(Buffer.from(position.earnedCt, "base64"))],
    new BN(position.earnedNonce),
  );
  return earnedPacker.unpack(values);
}
