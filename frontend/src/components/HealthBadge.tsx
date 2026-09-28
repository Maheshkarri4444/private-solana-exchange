import { healthLabel } from "@/lib/pools";
import { Badge } from "./ui";

const TONES = {
  good: "bg-accent/15 text-accent",
  fair: "bg-yellow-400/15 text-yellow-300",
  weak: "bg-orange-400/15 text-orange-300",
  risky: "bg-danger/15 text-danger",
};

export const HEALTH_HELP =
  "Computed privately by Arcium from the hidden reserves: how much USDC backs the pool, " +
  "and how much of the market cap the pool's liquidity covers. Kept coarse on purpose — " +
  "an exact number would reveal the reserves.";

export function HealthBadge({ score }: { score: number }) {
  const { label, tone } = healthLabel(score);
  return (
    <span title={HEALTH_HELP}>
      <Badge className={TONES[tone]}>
        {label} · {score}
      </Badge>
    </span>
  );
}
