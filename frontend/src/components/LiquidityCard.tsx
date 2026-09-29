"use client";

import { useBalances } from "@/hooks/useBalances";
import { useLpFees } from "@/hooks/useLpFees";
import { formatAmount } from "@/lib/format";
import type { PoolView } from "@/lib/pools";
import { Card, PrivateBadge, Spinner } from "./ui";

/**
 * Your LP share of this pool and the swap fees it has paid you. Only this
 * browser can read the numbers; nothing to claim, payouts land by themselves.
 */
export function LiquidityCard({ pool }: { pool: PoolView }) {
  const { balances } = useBalances();
  const fees = useLpFees();
  const lp = balances.find((b) => b.mint === pool.lpMint);
  if (!lp || lp.amount === 0n) return null;

  const symbol = pool.token?.symbol ?? "TOKEN";
  const mine = fees?.find((f) => f.position.pool === pool.address);
  const earned = mine?.earned ?? { token: 0n, usdc: 0n };
  const share = pool.lpSupply > 0n ? Number((lp.amount * 1_000_000n) / pool.lpSupply) / 10_000 : 0;
  const owed = pool.feesOn && pool.swapCount > (mine?.position.paidSwapCount ?? 0);

  return (
    <Card title="Your liquidity" subtitle="Only your browser can read these numbers." action={<PrivateBadge />}>
      <dl className="space-y-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">LP tokens</dt>
          <dd className="text-right font-mono">
            {formatAmount(lp.amount)} {pool.token?.symbol ?? ""}LP
            <span className="block text-xs text-muted">{share.toLocaleString("en-US")}% of the pool</span>
          </dd>
        </div>
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">Swap fees earned (all time)</dt>
          <dd className="mt-1 flex flex-wrap gap-x-4 font-mono text-lg font-semibold text-accent">
            <span>+{formatAmount(earned.usdc, 6)} USDC</span>
            <span>
              +{formatAmount(earned.token, 4)} {symbol}
            </span>
          </dd>
          <p className="mt-1 text-xs text-muted">Paid straight into your private USDC and {symbol} balances.</p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted">
          {!pool.feesOn ? (
            "Fees start with the next trade."
          ) : owed ? (
            <>
              <Spinner /> Fees from the latest trades are on their way (sent when trading pauses).
            </>
          ) : (
            "Up to date: every trade's fee so far has been paid to you."
          )}
        </p>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Every trade pays a {(pool.feeBps / 100).toFixed(2)}% fee. It stays out of the pool&apos;s reserves and goes to
        LP holders by their share: no claiming needed.
      </p>
    </Card>
  );
}
