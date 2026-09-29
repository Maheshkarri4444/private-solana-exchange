"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { HEALTH_HELP, HealthBadge } from "@/components/HealthBadge";
import { LiquidityCard } from "@/components/LiquidityCard";
import { PriceChart } from "@/components/PriceChart";
import { SwapPanel } from "@/components/SwapPanel";
import { Card, PrivateBadge, Spinner, TokenIcon } from "@/components/ui";
import { usePool } from "@/hooks/usePools";
import { explorerUrl } from "@/lib/config";
import { formatAmount, formatPct, formatPrice, formatUsd, shortAddress } from "@/lib/format";
import { marketCap, priceChange } from "@/lib/pools";

export default function PoolPage() {
  const { mint } = useParams<{ mint: string }>();
  const { pool, loading, refresh } = usePool(mint);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Loading pool…
      </div>
    );
  }
  if (!pool || !pool.active) {
    return (
      <Card>
        <p className="text-muted">
          {pool ? "This pool is waiting for its first liquidity." : "No pool for this token."}{" "}
          <Link href="/" className="text-accent hover:underline">
            Back to pools
          </Link>
        </p>
      </Card>
    );
  }

  const change = priceChange(pool);
  const token = pool.token;
  const date = (unix: number) => new Date(unix * 1000).toLocaleString();

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <TokenIcon image={token?.image} symbol={token?.symbol} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{token?.name ?? shortAddress(pool.tokenMint)}</h1>
            <p className="text-sm text-muted">
              ${token?.symbol} · by{" "}
              <a href={explorerUrl(pool.creator)} target="_blank" rel="noreferrer" className="font-mono hover:text-fg">
                {shortAddress(pool.creator)}
              </a>
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-semibold">{formatPrice(pool.price)} USDC</p>
            <p className={`text-sm font-semibold ${change >= 0 ? "text-accent" : "text-danger"}`}>
              {formatPct(change)} <span className="font-normal text-muted">over last {pool.history.length} prices</span>
            </p>
          </div>
        </div>

        <Card>
          <PriceChart points={pool.history} height={220} />
        </Card>

        <Card title="Pool details" subtitle="Everything here is public. The reserves are not.">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Stat label="Market cap" value={formatUsd(marketCap(pool))} />
            <Stat label="Total supply" value={formatAmount(pool.totalSupply)} />
            <Stat label="Private supply" value={formatAmount(pool.privateSupply)} hint="inside the exchange" />
            <Stat label="Public supply" value={formatAmount(pool.splSupply)} hint="SPL tokens in wallets" />
            <Stat label="LP supply" value={formatAmount(pool.lpSupply)} hint="each holder's share is private" />
            <Stat label="Swap fee" value={`${(pool.feeBps / 100).toFixed(2)}%`} hint="goes to liquidity providers" />
            <Stat label="Trades" value={pool.swapCount.toLocaleString("en-US")} />
            <Stat label="Health" value={<HealthBadge score={pool.health} />} />
            <Stat label="Reserves" value={<PrivateBadge>hidden by Arcium</PrivateBadge>} />
            <Stat label="Created" value={date(pool.createdAt)} />
            <Stat label="Last trade" value={date(pool.lastTradeAt)} />
            <Stat
              label="Token mint"
              value={
                <a href={explorerUrl(pool.tokenMint)} target="_blank" rel="noreferrer" className="font-mono hover:text-accent">
                  {shortAddress(pool.tokenMint)}
                </a>
              }
            />
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-muted">
            <span className="text-fg">How health works:</span> {HEALTH_HELP}
          </p>
        </Card>

        {token?.description && (
          <Card title="About">
            <p className="text-sm leading-relaxed text-muted">{token.description}</p>
          </Card>
        )}
      </div>

      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <SwapPanel pool={pool} onTraded={refresh} />
        <LiquidityCard pool={pool} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-mono">{value}</dd>
      {hint && <p className="text-[11px] text-muted/70">{hint}</p>}
    </div>
  );
}
