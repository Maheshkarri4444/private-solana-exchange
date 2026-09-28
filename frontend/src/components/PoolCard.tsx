import Link from "next/link";
import { formatPct, formatPrice, formatUsd, shortAddress } from "@/lib/format";
import { type PoolView, marketCap, priceChange } from "@/lib/pools";
import { HealthBadge } from "./HealthBadge";
import { PriceChart } from "./PriceChart";
import { TokenIcon } from "./ui";

export function PoolCard({ pool }: { pool: PoolView }) {
  const change = priceChange(pool);
  return (
    <Link
      href={`/pool/${pool.tokenMint}`}
      className="group flex flex-col rounded-2xl border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-accent/60"
    >
      <div className="flex items-center gap-3">
        <TokenIcon image={pool.token?.image} symbol={pool.token?.symbol} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{pool.token?.name ?? shortAddress(pool.tokenMint)}</p>
          <p className="text-xs text-muted">${pool.token?.symbol ?? "?"}</p>
        </div>
        <HealthBadge score={pool.health} />
      </div>

      <div className="mt-3">
        <PriceChart points={pool.history} height={56} />
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">Price</p>
          <p className="font-mono font-semibold">{formatPrice(pool.price)} USDC</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${change >= 0 ? "text-accent" : "text-danger"}`}>
            {formatPct(change)}
          </p>
          <p className="text-xs text-muted">MC {formatUsd(marketCap(pool))}</p>
        </div>
      </div>
    </Link>
  );
}
