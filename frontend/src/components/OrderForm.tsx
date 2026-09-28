"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useBalances } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { placeOrder } from "@/lib/actions";
import { type BookRecord, getBook } from "@/lib/api";
import { LOT, MAX_ORDERS_PER_USER, myOrders, openOrders, BOOK_SLOTS, parseLots } from "@/lib/books";
import { explainError } from "@/lib/errors";
import { formatAmount, formatPrice, parseAmount } from "@/lib/format";
import { pdas } from "@/lib/program";
import { Button, Field, Input, Notice } from "./ui";

type Result = { tone: "success" | "error" | "info"; text: string };

/** Place a limit order. Side, price and size are encrypted in this browser. */
export function OrderForm({ book, onPlaced }: { book: BookRecord; onPlaced: () => void }) {
  const { program, provider, keys, mxePublicKey, send } = usePrivateAccount();
  const { balances, refresh } = useBalances();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const me = provider?.wallet.publicKey.toBase58() ?? null;
  const symbol = book.token?.symbol ?? "TOKEN";
  const isBuy = side === "buy";
  const priceMicro = parseAmount(price); // micro-USDC per whole token
  const lots = parseLots(size);
  const lock = priceMicro && lots ? (isBuy ? lots * priceMicro : lots * LOT) : 0n;
  const usdcMint = pdas.usdcMint().toBase58();
  const available = balances.find((b) => b.mint === (isBuy ? usdcMint : book.tokenMint))?.amount ?? 0n;

  const mine = me ? book.slots.filter((s) => s.owner === me).length : 0;
  const full = openOrders(book) >= BOOK_SLOTS;
  const blocked = full
    ? "The book is full"
    : mine >= MAX_ORDERS_PER_USER
      ? `You have ${MAX_ORDERS_PER_USER} open orders here: collect or cancel one first`
      : lock > available
        ? `Not enough ${isBuy ? "USDC" : symbol}`
        : null;

  async function submit() {
    if (!program || !provider || !keys || !mxePublicKey || !priceMicro || !lots || !me) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await placeOrder(program, send, provider.wallet.publicKey, keys, mxePublicKey, {
        tokenMint: new PublicKey(book.tokenMint),
        usdcMint: pdas.usdcMint(),
        isBuy,
        price: priceMicro,
        lots,
      });
      if (!r.ok) {
        setResult({ tone: "error", text: "Arcium rejected the order (not enough balance). Nothing was locked." });
      } else {
        // Our newest order, as Arcium left it after matching.
        const updated = await getBook(book.tokenMint);
        const order = updated
          ? myOrders(updated, me, keys, mxePublicKey).sort((a, b) => b.seq - a.seq)[0]
          : undefined;
        const filled = order ? order.lots - order.remaining : 0n;
        setResult(
          !order || filled === 0n
            ? { tone: "info", text: "Order placed. Nothing crossed yet, so it rests in the book." }
            : order.remaining === 0n
              ? { tone: "success", text: `Filled all ${filled.toLocaleString()} ${symbol} right away. It's in your private balance.` }
              : {
                  tone: "success",
                  text: `Filled ${filled.toLocaleString()} of ${order.lots.toLocaleString()} ${symbol} right away; the rest rests in the book.`,
                },
        );
        setSize("");
      }
      refresh();
      onPlaced();
    } catch (e) {
      setResult({ tone: "error", text: explainError(e) });
    } finally {
      setBusy(false);
    }
  }

  const tab = (value: "buy" | "sell", label: string) => (
    <button
      onClick={() => {
        setSide(value);
        setResult(null);
      }}
      className={`h-10 flex-1 rounded-xl text-sm font-semibold transition ${
        side === value
          ? value === "buy"
            ? "bg-accent text-accent-fg"
            : "bg-danger text-white"
          : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl border border-line p-1">
        {tab("buy", `Buy ${symbol}`)}
        {tab("sell", `Sell ${symbol}`)}
      </div>

      <Field
        label={`Limit price (USDC per ${symbol})`}
        hint={book.poolPrice ? `Pool price: ${formatPrice(Number(book.poolPrice) / 1e12)} USDC` : undefined}
      >
        <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.0025" disabled={busy} />
      </Field>

      <Field label={`Amount (whole ${symbol})`} hint={`Private balance: ${formatAmount(available, 4)} ${isBuy ? "USDC" : symbol}`}>
        <Input value={size} onChange={(e) => setSize(e.target.value)} inputMode="numeric" placeholder="1000" disabled={busy} />
      </Field>

      <div className="rounded-xl border border-line bg-bg/60 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Locks from your private balance</span>
          <span className="font-mono">
            {isBuy ? `${formatAmount(lock, 6)} USDC` : `${lots ? lots.toLocaleString() : 0} ${symbol}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Fills happen at the resting order&apos;s price. A buy that fills cheaper gets the difference back.
        </p>
      </div>

      <Button
        className="w-full"
        variant={isBuy ? "primary" : "danger"}
        onClick={submit}
        loading={busy}
        disabled={!priceMicro || priceMicro === 0n || !lots || !!blocked}
      >
        {busy ? "Matching privately in Arcium…" : (blocked ?? `Place private ${side} order`)}
      </Button>

      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </div>
  );
}
