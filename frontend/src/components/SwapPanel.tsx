"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useBalances } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { swap } from "@/lib/actions";
import { explainError } from "@/lib/errors";
import { formatAmount, parseAmount } from "@/lib/format";
import type { PoolView } from "@/lib/pools";
import { pdas } from "@/lib/program";
import { AccountGate } from "./AccountGate";
import { Button, Card, Input, Notice } from "./ui";

const SLIPPAGES = [1, 5, 10, 20];
const E12 = 10n ** 12n;

export function SwapPanel({ pool, onTraded }: { pool: PoolView; onTraded: () => void }) {
  return (
    <Card title="Trade" subtitle="Your amount is encrypted in the browser — only Arcium sees it.">
      <AccountGate inline>
        <SwapForm pool={pool} onTraded={onTraded} />
      </AccountGate>
    </Card>
  );
}


function SwapForm({ pool, onTraded }: { pool: PoolView; onTraded: () => void }) {
  const { program, provider, keys, mxePublicKey, send } = usePrivateAccount();
  const { balances, refresh } = useBalances();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const isBuy = side === "buy";
  const symbol = pool.token?.symbol ?? "TOKEN";
  const inSymbol = isBuy ? "USDC" : symbol;
  const outSymbol = isBuy ? symbol : "USDC";
  const inMint = isBuy ? pdas.usdcMint().toBase58() : pool.tokenMint;
  const balanceIn = balances.find((b) => b.mint === inMint)?.amount ?? 0n;

  // Estimate from the public price. Price impact is private (it depends on the
  // hidden reserves), so this is an upper bound; the pool pays the best amount
  // between "at least" and this.
  const amountIn = parseAmount(amount);
  const keep = 10_000n - BigInt(pool.feeBps);
  const gross =
    amountIn && pool.priceE12 > 0n
      ? isBuy
        ? (amountIn * E12) / pool.priceE12
        : (amountIn * pool.priceE12) / E12
      : 0n;
  const maxOut = (gross * keep) / 10_000n;
  const minOut = (maxOut * BigInt(100 - slippage)) / 100n;
  const tooMuch = !!amountIn && amountIn > balanceIn;

  async function submit() {
    if (!program || !provider || !keys || !mxePublicKey || !amountIn) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await swap(program, send, provider.wallet.publicKey, keys, mxePublicKey, {
        tokenMint: new PublicKey(pool.tokenMint),
        usdcMint: pdas.usdcMint(),
        isBuy,
        amountIn,
        minOut,
        maxOut,
      });
      setResult(
        r.ok
          ? { tone: "success", text: `You received ${formatAmount(r.received, 6)} ${outSymbol} for ${formatAmount(r.spent, 6)} ${inSymbol}.` }
          : { tone: "error", text: "Didn't go through — the price moved more than your slippage. Nothing was spent." },
      );
      if (r.ok) setAmount("");
      refresh();
      onTraded();
    } catch (e) {
      setResult({ tone: "error", text: explainError(e) });
    } finally {
      setBusy(false);
    }
  }

  const tab = (value: "buy" | "sell", label: string) => (
    <button
      onClick={() => { setSide(value); setAmount(""); setResult(null); }}
      className={`h-10 flex-1 rounded-xl text-sm font-semibold transition ${
        side === value
          ? value === "buy" ? "bg-accent text-accent-fg" : "bg-danger text-white"
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

      <div>
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>You pay ({inSymbol})</span>
          <button onClick={() => setAmount(formatAmount(balanceIn, 6).replace(/,/g, ""))} className="hover:text-accent">
            Balance {formatAmount(balanceIn, 4)} · Max
          </button>
        </div>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" disabled={busy} />
      </div>

      <div className="rounded-xl border border-line bg-bg/60 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">You receive (up to)</span>
          <span className="font-mono">{formatAmount(maxOut, 6)} {outSymbol}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">At least</span>
          <span className="font-mono">{formatAmount(minOut, 6)} {outSymbol}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Fee</span>
          <span>{(pool.feeBps / 100).toFixed(2)}% to liquidity providers</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>Slippage</span>
        <div className="flex gap-1">
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`rounded-lg px-2.5 py-1 ${slippage === s ? "bg-white/10 text-fg" : "hover:text-fg"}`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        variant={isBuy ? "primary" : "danger"}
        onClick={submit}
        loading={busy}
        disabled={!amountIn || amountIn === 0n || tooMuch || minOut === 0n}
      >
        {busy ? "Matching privately in Arcium…" : tooMuch ? `Not enough ${inSymbol}` : `${isBuy ? "Buy" : "Sell"} ${symbol}`}
      </Button>

      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <p className="text-xs leading-relaxed text-muted">
        Price impact depends on the hidden reserves, so bigger trades may need more slippage. If the
        price moves too far, nothing happens and nothing is spent.
      </p>
    </div>
  );
}
