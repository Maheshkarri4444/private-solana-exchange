"use client";

import type { PrivateBalance } from "@/hooks/useBalances";
import { explorerUrl } from "@/lib/config";
import { formatAmount, shortAddress } from "@/lib/format";
import { Button, Card, Notice, Spinner, TokenIcon } from "./ui";

export function BalancesCard({
  balances,
  loading,
  error,
  onRefresh,
}: {
  balances: PrivateBalance[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <Card
      title="Private balances"
      subtitle="Encrypted on-chain. Decrypted only here, in your browser."
      action={
        <Button variant="ghost" onClick={onRefresh} loading={loading} className="h-9 px-3">
          Refresh
        </Button>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      {!error && balances.length === 0 && !loading && (
        <p className="text-sm text-muted">No tokens yet. Mint some test USDC to get started.</p>
      )}

      <ul className="divide-y divide-line">
        {balances.map((b) => (
          <li key={b.mint} className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <TokenIcon image={b.token?.image} symbol={b.token?.symbol} />
              <div className="min-w-0">
                <p className="font-medium">{b.token?.symbol ?? shortAddress(b.mint)}</p>
                <a
                  href={explorerUrl(b.mint)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted hover:text-fg"
                >
                  {b.token?.name ?? "Unknown token"} · {shortAddress(b.mint)}
                </a>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-base">{formatAmount(b.amount)}</p>
              {b.pending ? (
                <p className="flex items-center justify-end gap-1.5 text-xs text-accent">
                  <Spinner /> updating in MPC
                </p>
              ) : (
                <p className="text-xs text-muted">🔒 private</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
