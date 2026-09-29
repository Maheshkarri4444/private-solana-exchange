"use client";

import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useBalances } from "@/hooks/useBalances";
import { usePools } from "@/hooks/usePools";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { type PoolStep, createPool } from "@/lib/actions";
import { publicSupply } from "@/lib/api";
import { INITIAL_LP_SUPPLY } from "@/lib/config";
import { formatAmount, formatPrice, formatUsd, parseAmount, toNumber } from "@/lib/format";
import { explainError } from "@/lib/errors";
import { previewHealth } from "@/lib/pools";
import { pdas } from "@/lib/program";
import { HealthBadge } from "./HealthBadge";
import { Button, Card, Field, Input, Notice, PrivateBadge, Spinner } from "./ui";

const FEES = [
  { bps: 10, label: "0.1%" },
  { bps: 30, label: "0.3%" },
  { bps: 100, label: "1%" },
  { bps: 300, label: "3%" },
];

const STEPS: { key: PoolStep; label: string }[] = [
  { key: "create", label: "Create the pool and its LP token" },
  { key: "seed", label: "Move your liquidity in privately (Arcium)" },
];

export function CreatePoolForm() {
  const { program, provider, keys, mxePublicKey, send } = usePrivateAccount();
  const { balances, tokens, refresh } = useBalances();
  const { pools, refresh: refreshPools } = usePools();

  const me = provider?.wallet.publicKey.toBase58();
  const usdcMint = pdas.usdcMint().toBase58();
  const poolByMint = new Map(pools.map((p) => [p.tokenMint, p]));
  const lpMints = new Set(pools.map((p) => p.lpMint));
  // Your own tokens that don't have a live pool yet.
  const candidates = tokens.filter(
    (t) => t.creator === me && !t.isUsdc && !lpMints.has(t.mint) && !poolByMint.get(t.mint)?.active,
  );

  const [mint, setMint] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [feeBps, setFeeBps] = useState(30);
  const [step, setStep] = useState<PoolStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ mint: string; ok: boolean } | null>(null);

  const selected = candidates.find((t) => t.mint === mint) ?? candidates[0];
  const selectedMint = selected?.mint ?? "";
  // Public total supply = private (exchange) + SPL, for the preview.
  const totalSupply = selected
    ? BigInt(selected.exchangeSupply ?? "0") + publicSupply(selected)
    : null;

  if (tokens.length > 0 && candidates.length === 0 && !created) {
    return (
      <Card>
        <p className="text-sm text-muted">
          You have no token without a pool.{" "}
          <Link href="/create/token" className="text-accent hover:underline">
            Create a token first →
          </Link>
        </p>
      </Card>
    );
  }

  const tokenBal = balances.find((b) => b.mint === selectedMint)?.amount ?? 0n;
  const usdcBal = balances.find((b) => b.mint === usdcMint)?.amount ?? 0n;
  const tokenAmt = parseAmount(tokenAmount);
  const usdcAmt = parseAmount(usdcAmount);
  const min = 1_000_000n; // 1 whole token / 1 USDC, same as the circuit
  const busy = step !== null && step !== "done";
  const valid =
    !!selected && !!tokenAmt && !!usdcAmt && tokenAmt >= min && usdcAmt >= min &&
    tokenAmt <= tokenBal && usdcAmt <= usdcBal;

  const price = tokenAmt && usdcAmt ? toNumber(usdcAmt) / toNumber(tokenAmt) : 0;
  const mcap = totalSupply ? price * toNumber(totalSupply) : 0;
  const health = tokenAmt && usdcAmt && totalSupply ? previewHealth(tokenAmt, usdcAmt, totalSupply) : null;

  async function submit() {
    if (!program || !provider || !keys || !mxePublicKey || !selected || !tokenAmt || !usdcAmt) return;
    setError(null);
    setCreated(null);
    try {
      const { ok } = await createPool(
        program,
        send,
        provider.wallet.publicKey,
        keys,
        mxePublicKey,
        {
          tokenMint: new PublicKey(selected.mint),
          usdcMint: pdas.usdcMint(),
          symbol: selected.symbol,
          uri: selected.uri,
          tokenAmount: tokenAmt,
          usdcAmount: usdcAmt,
          feeBps,
        },
        setStep,
      );
      setCreated({ mint: selected.mint, ok });
      refresh();
      refreshPools();
    } catch (e) {
      setError(explainError(e));
      setStep(null);
    }
  }

  const stepIndex = step ? STEPS.findIndex((s) => s.key === step) : -1;
  const pct = (value: bigint, set: (v: string) => void) => (
    <div className="mt-1.5 flex gap-2">
      {[25n, 50n, 100n].map((p) => (
        <button
          key={p.toString()}
          type="button"
          onClick={() => set(formatAmount((value * p) / 100n, 6).replace(/,/g, ""))}
          className="rounded-lg border border-line px-2 py-0.5 text-xs text-muted hover:text-fg"
        >
          {p.toString()}%
        </button>
      ))}
    </div>
  );

  return (
    <Card
      title="Create liquidity pool"
      subtitle={
        <>
          Pair your token with USDC. Your deposit is encrypted in the browser — the pool&apos;s
          reserves stay <PrivateBadge />
        </>
      }
    >
      {tokens.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Loading your tokens…
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Token">
            <select
              value={selectedMint}
              onChange={(e) => setMint(e.target.value)}
              disabled={busy}
              className="h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-fg outline-none focus:border-accent"
            >
              {candidates.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol} — {t.name}
                  {poolByMint.has(t.mint) ? " (pool waiting for liquidity)" : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field label={`${selected?.symbol ?? "Token"} to add`} hint={`You have ${formatAmount(tokenBal)}`}>
                <Input value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} inputMode="decimal" placeholder="500000" disabled={busy} />
              </Field>
              {pct(tokenBal, setTokenAmount)}
            </div>
            <div>
              <Field label="USDC to add" hint={`You have ${formatAmount(usdcBal)}`}>
                <Input value={usdcAmount} onChange={(e) => setUsdcAmount(e.target.value)} inputMode="decimal" placeholder="1000" disabled={busy} />
              </Field>
              {pct(usdcBal, setUsdcAmount)}
            </div>
          </div>

          <Field label="Swap fee (goes to liquidity providers)">
            <div className="flex gap-2">
              {FEES.map((f) => (
                <button
                  key={f.bps}
                  type="button"
                  onClick={() => setFeeBps(f.bps)}
                  disabled={busy}
                  className={`h-10 flex-1 rounded-xl border text-sm transition ${
                    feeBps === f.bps ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-fg"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-bg/60 p-4 text-sm sm:grid-cols-4">
            <Stat label="Starting price" value={price ? `${formatPrice(price)} USDC` : "—"} />
            <Stat label="Market cap" value={mcap ? formatUsd(mcap) : "—"} />
            <Stat label="Health" value={health === null ? "—" : <HealthBadge score={health} />} />
            <Stat label="You get" value={`${formatAmount(INITIAL_LP_SUPPLY, 0)} LP`} />
          </div>

          <Button className="w-full" onClick={submit} loading={busy} disabled={!valid}>
            Create pool
          </Button>

          {step && (
            <ol className="space-y-2 rounded-xl border border-line p-4 text-sm">
              {STEPS.map((s, i) => {
                const done = step === "done" || i < stepIndex;
                const active = i === stepIndex;
                return (
                  <li key={s.key} className={`flex items-center gap-2 ${done || active ? "text-fg" : "text-muted"}`}>
                    <span className="flex w-4 justify-center">{done ? "✓" : active ? <Spinner /> : "·"}</span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          )}

          {created && (
            <Notice tone={created.ok ? "success" : "error"}>
              {created.ok ? (
                <>
                  Pool is live!{" "}
                  <Link href={`/pool/${created.mint}`} className="underline">
                    Open it →
                  </Link>
                </>
              ) : (
                "The deposit didn't go through (not enough balance?). Nothing moved — you can try again."
              )}
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 font-mono">{value}</div>
    </div>
  );
}
