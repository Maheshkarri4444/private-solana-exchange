"use client";

import { useEffect, useRef } from "react";
import { notifyBalancesChanged } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { listBooks } from "@/lib/api";
import { myOrders, readView, toUsdc } from "@/lib/books";
import { formatAmount, formatPrice } from "@/lib/format";
import { useToast } from "./Toaster";

const POLL_MS = 8_000;

interface Tracked {
  book: string;
  slot: number;
  symbol: string;
  isBuy: boolean;
  price: bigint;
  lots: bigint;
  remaining: bigint;
}

/**
 * Watches your waiting orders and tells you when they fill. Fills made by
 * other traders are settled into your balance by the backend; this notices
 * the change in your own (encrypted) order copy, on any page.
 */
export function FillNotifier() {
  const { provider, keys, mxePublicKey } = usePrivateAccount();
  const toast = useToast();
  const tracked = useRef<Map<string, Tracked> | null>(null);
  const me = provider?.wallet.publicKey.toBase58() ?? null;

  useEffect(() => {
    tracked.current = null;
    if (!me || !keys || !mxePublicKey) return;
    let stopped = false;

    const announce = (t: Tracked, filled: bigint, done: boolean) => {
      const usdc = filled * t.price; // resting orders trade at their own price
      toast(
        done ? `Your ${t.isBuy ? "buy" : "sell"} order filled` : `Your ${t.isBuy ? "buy" : "sell"} order partly filled`,
        `${t.isBuy ? "Bought" : "Sold"} ${filled.toLocaleString()} ${t.symbol} at ${formatPrice(toUsdc(t.price))}: ` +
          (t.isBuy
            ? `${filled.toLocaleString()} ${t.symbol} are in your private balance.`
            : `+${formatAmount(usdc, 6)} USDC is in your private balance.`),
      );
    };

    async function poll() {
      const books = await listBooks();
      const now = new Map<string, Tracked>();
      let changed = false;
      for (const book of books) {
        const symbol = book.token?.symbol ?? "TOKEN";
        for (const o of myOrders(book, me!, keys!, mxePublicKey!)) {
          now.set(`${book.address}:${o.seq}`, {
            book: book.address,
            slot: o.slot,
            symbol,
            isBuy: o.isBuy,
            price: o.price,
            lots: o.lots,
            remaining: o.remaining,
          });
        }
        if (!tracked.current) continue;
        // Orders we knew that left this book: read their final copy for what filled.
        for (const [key, t] of tracked.current) {
          if (t.book !== book.address || now.has(key)) continue;
          const reused = book.slots[t.slot].owner && book.slots[t.slot].owner !== me;
          const last = reused ? null : readView(book, t.slot, keys!, mxePublicKey!);
          const same = last && last.lots === t.lots && last.price === t.price && last.is_buy === t.isBuy;
          if (same && last.remaining < t.remaining) {
            announce(t, t.remaining - last.remaining, last.remaining === 0n);
            changed = true;
          }
        }
      }
      if (tracked.current) {
        for (const [key, t] of now) {
          const before = tracked.current.get(key);
          if (before && t.remaining < before.remaining) {
            announce(t, before.remaining - t.remaining, false);
            changed = true;
          }
        }
      }
      tracked.current = now;
      if (changed) notifyBalancesChanged();
    }

    const run = () => {
      if (!stopped) poll().catch(() => {});
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [me, keys, mxePublicKey, toast]);

  return null;
}
