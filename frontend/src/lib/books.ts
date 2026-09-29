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

/** Order types (the program's ORDER_*). */
export const ORDER = { LIMIT: 0, MARKET: 1, POST_ONLY: 2 } as const;
export type OrderKind = (typeof ORDER)[keyof typeof ORDER];

const u = (width: number) => ({ Integer: { signed: false, width } }) as const;

type ViewFields = {
  is_buy: boolean;
  price: bigint;
  lots: bigint;
  remaining: bigint;
  quote: bigint;
};

/** An owner's copy of their order: the circuit's `OrderView`, packed into 1 ciphertext. */
const viewPacker = createPacker<ViewFields, ViewFields>(
  [
    { name: "is_buy", type: "Bool" },
    { name: "price", type: u(64) },
    { name: "lots", type: u(32) },
    { name: "remaining", type: u(32) },
    { name: "quote", type: u(64) },
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
  /** Unfilled part, as of the order's last settlement. */
  remaining: bigint;
  /** USDC paid or received by the fills of its last placement / settlement. */
  quote: bigint;
  /** Traded just now; the backend is moving the fills into the owner's balances. */
  settling: boolean;
}

/** Decrypted owner's copy (its packed values) → fields. */
export const unpackView = (values: bigint[]) => viewPacker.unpack(values);

/** Decrypts the owner's copy stored for `slot` (only its owner's key opens it). */
export function readView(book: BookRecord, slot: number, keys: PrivateKeys, mxePublicKey: Uint8Array) {
  const view = book.views[slot];
  if (!view) return null;
  const values = decryptValues(
    keys.privateKey,
    mxePublicKey,
    view.ciphertexts.map((c) => Array.from(Buffer.from(c, "base64"))),
    new BN(view.nonce),
  );
  return unpackView(values);
}

/** Your open orders in a book, decrypted in this browser. */
export function myOrders(
  book: BookRecord,
  owner: string,
  keys: PrivateKeys,
  mxePublicKey: Uint8Array,
): MyOrder[] {
  return book.slots.flatMap((s, slot) => {
    if (s.owner !== owner) return [];
    const o = readView(book, slot, keys, mxePublicKey);
    if (!o) return [];
    return [
      {
        slot,
        seq: s.seq,
        isBuy: o.is_buy,
        price: o.price,
        lots: o.lots,
        remaining: o.remaining,
        quote: o.quote,
        settling: (book.settleMask & (1 << slot)) !== 0,
      },
    ];
  });
}

/** Micro-USDC per token → USDC per token. */
export const toUsdc = (micro: bigint | string) => Number(micro) / 1e6;

/** Public reference price (USDC per token): the last trade, else the pool's price. */
export function referencePrice(book: BookRecord): number | null {
  if (book.lastPrice !== "0") return toUsdc(book.lastPrice);
  if (book.poolPrice) return Number(book.poolPrice) / 1e12;
  return null;
}

export const openOrders = (book: BookRecord) => book.slots.filter((s) => s.owner).length;

/** Whole tokens only (orders trade in lots of 1 token). */
export function parseLots(value: string): bigint | null {
  const v = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(v)) return null;
  const lots = BigInt(v);
  return lots > 0n && lots < 2n ** 32n ? lots : null;
}
