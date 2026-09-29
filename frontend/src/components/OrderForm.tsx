"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useBalances } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { placeOrder } from "@/lib/actions";
import type { BookRecord } from "@/lib/api";
import {
  BOOK_SLOTS,
  LOT,
  MAX_ORDERS_PER_USER,
  ORDER,
  type OrderKind,
  openOrders,
  parseLots,
  referencePrice,
  toUsdc,
} from "@/lib/books";
import { explainError } from "@/lib/errors";
import { formatAmount, formatPrice, parseAmount } from "@/lib/format";
import { pdas } from "@/lib/program";
import { Button, Field, Input, Notice } from "./ui";

type Result = { tone: "success" | "error" | "info"; text: string };

const KINDS: { kind: OrderKind; label: string; hint: string }[] = [
  { kind: ORDER.LIMIT, label: "Limit", hint: "Trades at your price or better; the rest waits in the book." },
  { kind: ORDER.MARKET, label: "Market", hint: "Trades now at the best prices, up to your slippage; the rest comes back." },
  { kind: ORDER.POST_ONLY, label: "Post-only", hint: "Only waits in the book. Refused if it would trade right away." },
];
const SLIPPAGES = [1, 2, 5, 10];

/** Place an order. Side, price and size are encrypted in this browser. */
export function OrderForm({ book, onPlaced }: { book: BookRecord; onPlaced: () => void }) {
  const { program, provider, keys, mxePublicKey, send } = usePrivateAccount();
  const { balances, refresh } = useBalances();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [kind, setKind] = useState<OrderKind>(ORDER.LIMIT);
  const [price, setPrice] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const me = provider?.wallet.publicKey.toBase58() ?? null;
  const symbol = book.token?.symbol ?? "TOKEN";
  const isBuy = side === "buy";
  const isMarket = kind === ORDER.MARKET;
  const ref = referencePrice(book);
  const lastPrice = book.lastPrice !== "0" ? toUsdc(book.lastPrice) : null;
  const poolPrice = book.poolPrice ? Number(book.poolPrice) / 1e12 : null;

  // A market order's price is its worst acceptable price: the reference ± slippage.
  const marketCap =
    isMarket && ref
      ? BigInt(Math.max(1, (isBuy ? Math.ceil : Math.floor)(ref * (1 + (isBuy ? slippage : -slippage) / 100) * 1e6)))
      : null;
  const priceMicro = isMarket && ref ? marketCap : parseAmount(price);
  const lots = parseLots(size);
  const lock = priceMicro && lots ? (isBuy ? lots * priceMicro : lots * LOT) : 0n;
  const usdcMint = pdas.usdcMint().toBase58();
  const available = balances.find((b) => b.mint === (isBuy ? usdcMint : book.tokenMint))?.amount ?? 0n;

  const mine = me ? book.slots.filter((s) => s.owner === me).length : 0;
  const blocked =
    !isMarket && openOrders(book) >= BOOK_SLOTS
      ? "The book is full: use a market order"
      : !isMarket && mine >= MAX_ORDERS_PER_USER
        ? `You have ${MAX_ORDERS_PER_USER} orders waiting here`
        : lock > available
          ? `Not enough ${isBuy ? "USDC" : symbol}`
          : null;

  const sideWord = isBuy ? "buy" : "sell";
  const submitLabel = isMarket
    ? `${isBuy ? "Buy" : "Sell"} ${symbol} at market`
    : `Place ${kind === ORDER.POST_ONLY ? "post-only" : "limit"} ${sideWord}`;

  function nudge(pct: number) {
    const base = parseAmount(price);
    const from = base ? Number(base) / 1e6 : ref;
    if (from) setPrice(formatPrice(from * (1 + pct / 100)).replace(/,/g, ""));
  }

  async function submit() {
    if (!program || !provider || !keys || !mxePublicKey || !priceMicro || !lots) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await placeOrder(program, send, provider.wallet.publicKey, keys, mxePublicKey, {
        tokenMint: new PublicKey(book.tokenMint),
        usdcMint: pdas.usdcMint(),
        isBuy,
        price: priceMicro,
        lots,
        kind,
      });
      setResult(describe(r, { isBuy, isMarket, kind, lots, symbol }));
      if (r.ok) setSize("");
      refresh();
      onPlaced();
    } catch (e) {
      setResult({ tone: "error", text: explainError(e) });
    } finally {
      setBusy(false);
    }
  }

  const chip = (label: string, onClick: () => void, active = false) => (
    <button
      type="button"
      key={label}
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-2 py-0.5 text-xs transition ${active ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl border border-line p-1">
        {(["buy", "sell"] as const).map((value) => (
          <button
            key={value}
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
            {value === "buy" ? "Buy" : "Sell"} {symbol}
          </button>
        ))}
      </div>

      <div>
        <div className="flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => {
                setKind(k.kind);
                setResult(null);
              }}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                kind === k.kind ? "border-private bg-private/15 text-fg" : "border-line text-muted hover:text-fg"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{KINDS.find((k) => k.kind === kind)?.hint}</p>
      </div>

      {isMarket && ref ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span className="font-medium tracking-wide uppercase">Max slippage</span>
            <div className="flex gap-1">
              {SLIPPAGES.map((s) => chip(`${s}%`, () => setSlippage(s), slippage === s))}
            </div>
          </div>
          <p className="rounded-xl border border-line bg-bg/60 px-3 py-2 text-sm">
            {isBuy ? "Pays at most" : "Sells for at least"}{" "}
            <span className="font-mono">{formatPrice(Number(marketCap) / 1e6)} USDC</span>{" "}
            <span className="text-muted">
              ({lastPrice ? "last price" : "pool price"} {isBuy ? "+" : "−"}
              {slippage}%)
            </span>
          </p>
        </div>
      ) : (
        <Field
          label={isMarket ? `Worst price (USDC per ${symbol})` : `Limit price (USDC per ${symbol})`}
          hint={
            <span className="flex flex-wrap gap-1">
              {lastPrice && chip(`Last ${formatPrice(lastPrice)}`, () => setPrice(formatPrice(lastPrice).replace(/,/g, "")))}
              {poolPrice && chip(`Pool ${formatPrice(poolPrice)}`, () => setPrice(formatPrice(poolPrice).replace(/,/g, "")))}
              {(ref || price) && chip("−1%", () => nudge(-1))}
              {(ref || price) && chip("+1%", () => nudge(1))}
            </span>
          }
        >
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.0025" disabled={busy} />
        </Field>
      )}

      <Field label={`Amount (whole ${symbol})`} hint={`Private balance: ${formatAmount(available, 4)} ${isBuy ? "USDC" : symbol}`}>
        <Input value={size} onChange={(e) => setSize(e.target.value)} inputMode="numeric" placeholder="1000" disabled={busy} />
      </Field>

      <div className="rounded-xl border border-line bg-bg/60 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{isMarket ? "Locks at most" : "Locks from your private balance"}</span>
          <span className="font-mono">
            {isBuy ? `${formatAmount(lock, 6)} USDC` : `${lots ? lots.toLocaleString() : 0} ${symbol}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Trades happen at the waiting order&apos;s price, so a buy often pays less than it locked. The difference
          comes straight back.
        </p>
      </div>

      <Button
        className="w-full"
        variant={isBuy ? "primary" : "danger"}
        onClick={submit}
        loading={busy}
        disabled={!priceMicro || priceMicro === 0n || !lots || !!blocked}
      >
        {busy ? "Matching privately in Arcium…" : (blocked ?? submitLabel)}
      </Button>

      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </div>
  );
}

/** Plain words for what just happened. */
function describe(
  r: { ok: boolean; rests: boolean; filled: bigint; quote: bigint },
  o: { isBuy: boolean; isMarket: boolean; kind: OrderKind; lots: bigint; symbol: string },
): Result {
  if (!r.ok) {
    return o.kind === ORDER.POST_ONLY
      ? {
          tone: "error",
          text: "Refused: a waiting order already matches your price, and a post-only order never trades on arrival. Nothing was locked.",
        }
      : { tone: "error", text: "Arcium refused the order (not enough balance). Nothing was locked." };
  }
  const rest = o.lots - r.filled;
  if (r.filled === 0n) {
    return r.rests
      ? { tone: "info", text: "Order placed. It waits in the book until someone matches it." }
      : { tone: "info", text: "Nothing matched within your price. Nothing was spent." };
  }
  const avg = formatPrice(Number(r.quote) / 1e6 / Number(r.filled));
  const traded = `${o.isBuy ? "Bought" : "Sold"} ${r.filled.toLocaleString()} ${o.symbol} at ${avg} avg for ${formatAmount(r.quote, 6)} USDC.`;
  if (rest === 0n) return { tone: "success", text: traded };
  return {
    tone: "success",
    text: r.rests
      ? `${traded} The other ${rest.toLocaleString()} wait in the book.`
      : `${traded} The other ${rest.toLocaleString()} came back: nothing more within your price.`,
  };
}
