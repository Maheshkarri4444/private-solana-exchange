"use client";

import { useEffect, useRef } from "react";
import { notifyBalancesChanged } from "@/hooks/useBalances";
import { useLpFees } from "@/hooks/useLpFees";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { listPools } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import type { Earned } from "@/lib/lp";
import { useToast } from "./Toaster";

/**
 * Tells liquidity providers when a fee payout lands. The backend sends the
 * payouts after trades; this notices your (encrypted) lifetime total going
 * up, on any page.
 */
export function LpFeeNotifier() {
  const { provider } = usePrivateAccount();
  const fees = useLpFees();
  const toast = useToast();
  const seen = useRef<{ owner: string; earned: Map<string, Earned> } | null>(null);
  const me = provider?.wallet.publicKey.toBase58() ?? null;

  useEffect(() => {
    if (!me || !fees) return;
    const mine = fees.filter((f) => f.position.owner === me);
    const before = seen.current?.owner === me ? seen.current.earned : null;
    seen.current = { owner: me, earned: new Map(mine.map((f) => [f.position.address, f.earned])) };
    if (!before) return; // first load: nothing to announce

    const zero: Earned = { token: 0n, usdc: 0n };
    const paid = mine
      .map((f) => {
        const b = before.get(f.position.address) ?? zero;
        return { pool: f.position.pool, usdc: f.earned.usdc - b.usdc, token: f.earned.token - b.token };
      })
      .filter((p) => p.usdc > 0n || p.token > 0n);
    if (paid.length === 0) return;

    listPools()
      .then((pools) => {
        for (const p of paid) {
          const symbol = pools.find((pool) => pool.address === p.pool)?.token?.symbol ?? "TOKEN";
          const parts = [
            p.usdc > 0n && `+${formatAmount(p.usdc, 6)} USDC`,
            p.token > 0n && `+${formatAmount(p.token, 6)} ${symbol}`,
          ].filter(Boolean);
          toast(
            "LP fees received",
            `${parts.join(" and ")} from trades in the ${symbol}/USDC pool, paid into your private balance.`,
          );
        }
      })
      .catch(() => {})
      .finally(notifyBalancesChanged);
  }, [fees, me, toast]);

  return null;
}
