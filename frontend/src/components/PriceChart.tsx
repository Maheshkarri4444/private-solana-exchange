"use client";

import { useId } from "react";

/** Area chart of public pool prices. Green when the price is up, red when down. */
export function PriceChart({
  points,
  height = 180,
}: {
  points: { price: number; time: number }[];
  height?: number;
}) {
  const id = useId();

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted"
        style={{ height }}
      >
        The chart starts after the first trade
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const width = 600;

  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * width,
    height - ((p.price - lo) / (hi - lo)) * height,
  ]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? "var(--accent)" : "var(--danger)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={`Price chart, ${up ? "up" : "down"} over the last ${points.length} trades`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
