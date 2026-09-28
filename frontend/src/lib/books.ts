import { BN } from "@anchor-lang/core";
import { createPacker } from "@arcium-hq/client";
import type { BookRecord } from "./api";
import { decryptValues } from "./arcium";
import { TOKEN_DECIMALS } from "./config";
import type { PrivateKeys } from "./keys";

/** Slots per book (the program's BOOK_SLOTS). */
export const BOOK_SLOTS = 8;
/** Open orders one wallet may have in one book (the program's MAX_ORDERS_PER_USER). */
export const MAX_ORDERS_PER_USER = 3;
/** Orders trade whole tokens; prices are USDC base units (micro-USDC) per whole token. */
export const LOT = 10n ** BigInt(TOKEN_DECIMALS);

const u = (width: number) => ({ Integer: { signed: false, width } }) as const;

type ViewFields = {
  is_buy: boolean;
  price: bigint;
  lots: bigint;
  remaining: bigint;
};

/** An owner's copy of their order: the circuit's `OrderView`, packed into 1 ciphertext. */
const viewPacker = createPacker<ViewFields, ViewFields>(
  [
    { name: "is_buy", type: "Bool" },
    { name: "price", type: u(64) },
    { name: "lots", type: u(32) },
    { name: "remaining", type: u(32) },
  ] as const,
  "OrderView",
);

/** One of your orders, decrypted in this browser. */
export interface MyOrder {
  slot: number;
  seq: number;
  isBuy: boolean;
  /** Micro-USDC per whole token. */
  price: bigint;
  /** Whole tokens. */
  lots: bigint;
  /** As of your last action on this order: fills by others show up after you collect. */
  remaining: bigint;
}

/** Your orders in a book. Each is your own encrypted copy, updated when you act on it. */
export function myOrders(
  book: BookRecord,
  owner: string,
  keys: PrivateKeys,
  mxePublicKey: Uint8Array,
): MyOrder[] {
  return book.slots.flatMap((s, slot) => {
    const view = book.views[slot];
    if (s.owner !== owner || !view) return [];
    const values = decryptValues(
      keys.privateKey,
      mxePublicKey,
      view.ciphertexts.map((c) => Array.from(Buffer.from(c, "base64"))),
      new BN(view.nonce),
    );
    const o = viewPacker.unpack(values);
    return [
      {
        slot,
        seq: s.seq,
        isBuy: o.is_buy,
        price: o.price,
        lots: o.lots,
        remaining: o.remaining,
      },
    ];
  });
}

export const openOrders = (book: BookRecord) => book.slots.filter((s) => s.owner).length;

/** Whole tokens only (orders trade in lots of 1 token). */
export function parseLots(value: string): bigint | null {
  const v = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(v)) return null;
  const lots = BigInt(v);
  return lots > 0n && lots < 2n ** 32n ? lots : null;
}
