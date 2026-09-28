"use client";

import Link from "next/link";
import { usePools } from "@/hooks/usePools";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import type { TokenMeta } from "@/lib/api";
import { explorerUrl } from "@/lib/config";
import { formatAmount, shortAddress } from "@/lib/format";
import { Card, TokenIcon } from "./ui";

/** Tokens you created: total = private (inside the exchange) + SPL (in public wallets). */
export function CreatedTokens({ tokens }: { tokens: TokenMeta[] }) {
  const { provider } = usePrivateAccount();
  const { pools } = usePools();

  const me = provider?.wallet.publicKey.toBase58();
  const lpMints = new Set(pools.map((p) => p.lpMint));
  const mine = tokens.filter((t) => t.creator === me && !t.isUsdc && !lpMints.has(t.mint));

  const poolStatus = (mint: string) => {
    const pool = pools.find((p) => p.tokenMint === mint);
    if (pool?.active) return <Link href={`/pool/${mint}`} className="text-accent hover:underline">Live pool →</Link>;
    return (
      <Link href="/create/pool" className="text-muted hover:text-accent">
        {pool ? "Add liquidity →" : "Create pool →"}
      </Link>
    );
  };

  return (
    <Card title="Tokens you created" subtitle="Supplies are public. Who holds how much is private.">
      {mine.length === 0 ? (
        <p className="text-sm text-muted">No tokens yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {mine.map((token) => {
            const privateSupply = BigInt(token.exchangeSupply ?? "0");
            const splSupply = BigInt(token.splSupply ?? "0");
            return (
              <li key={token.mint} className="py-4">
                <div className="flex items-center gap-3">
                  <TokenIcon image={token.image} symbol={token.symbol} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{token.symbol}</p>
                    <a href={explorerUrl(token.mint)} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-fg">
                      {token.name} · {shortAddress(token.mint)}
                    </a>
                  </div>
                  <div className="text-sm">{poolStatus(token.mint)}</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-bg/60 p-3 text-sm">
                  <Supply label="Total supply" value={privateSupply + splSupply} />
                  <Supply label="Private supply" value={privateSupply} hint="inside the exchange" />
                  <Supply label="SPL supply" value={splSupply} hint="in public wallets" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Supply({ label, value, hint }: { label: string; value: bigint; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono">{formatAmount(value)}</p>
      {hint && <p className="text-[11px] text-muted/70">{hint}</p>}
    </div>
  );
}
