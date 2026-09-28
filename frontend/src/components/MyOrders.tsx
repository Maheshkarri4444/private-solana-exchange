"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useBalances } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { settleOrder } from "@/lib/actions";
import type { BookRecord } from "@/lib/api";
import { type MyOrder, myOrders } from "@/lib/books";
import { explainError } from "@/lib/errors";
import { formatPrice } from "@/lib/format";
import { pdas } from "@/lib/program";
import { Button, Notice } from "./ui";

/** Your orders in this book, decrypted in this browser. Nobody else can read them. */
export function MyOrders({ book, onChanged }: { book: BookRecord; onChanged: () => void }) {
  const { program, provider, keys, mxePublicKey, send } = usePrivateAccount();
  const { refresh } = useBalances();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const me = provider?.wallet.publicKey.toBase58() ?? null;
  if (!me || !keys || !mxePublicKey) return null;
  const orders = myOrders(book, me, keys, mxePublicKey).sort((a, b) => a.seq - b.seq);
  const symbol = book.token?.symbol ?? "TOKEN";

  async function act(order: MyOrder, cancel: boolean) {
    if (!program || !provider) return;
    setBusy(`${order.slot}-${cancel}`);
    setNotice(null);
    try {
      await settleOrder(program, send, provider.wallet.publicKey, {
        tokenMint: new PublicKey(book.tokenMint),
        usdcMint: pdas.usdcMint(),
        slot: order.slot,
        cancel,
      });
      setNotice({
        tone: "success",
        text: cancel
          ? "Order closed. Everything it held is back in your private balance."
          : "Up to date. Any fills are now in your private balance.",
      });
      refresh();
      onChanged();
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e) });
    } finally {
      setBusy(null);
    }
  }

  if (orders.length === 0) {
    return <p className="text-sm text-muted">You have no orders in this book.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted">
        When someone trades against your order, only Arcium knows. Press <span className="text-fg">Collect</span> to
        see new fills and move them into your balance.
      </p>
      {orders.map((o) => {
        const filled = o.lots - o.remaining;
        const done = o.remaining === 0n;
        return (
          <div key={o.slot} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-semibold ${o.isBuy ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"}`}
              >
                {o.isBuy ? "BUY" : "SELL"}
              </span>
              <span className="font-mono text-sm">
                {o.lots.toLocaleString()} {symbol} @ {formatPrice(Number(o.price) / 1e6)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={o.isBuy ? "h-full bg-accent" : "h-full bg-danger"}
                style={{ width: `${o.lots > 0n ? Number((filled * 100n) / o.lots) : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              {done ? "Filled" : `Filled ${filled.toLocaleString()} of ${o.lots.toLocaleString()}`} · order #{o.seq}
            </p>
            <div className="mt-3 flex gap-2">
              {!done && (
                <Button
                  variant="ghost"
                  className="h-9 flex-1"
                  onClick={() => act(o, false)}
                  loading={busy === `${o.slot}-false`}
                  disabled={!!busy}
                >
                  Collect
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-9 flex-1"
                onClick={() => act(o, true)}
                loading={busy === `${o.slot}-true`}
                disabled={!!busy}
              >
                {done ? "Close" : "Cancel"}
              </Button>
            </div>
          </div>
        );
      })}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </div>
  );
}
