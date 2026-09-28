"use client";

import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useState } from "react";
import { useBalances } from "@/hooks/useBalances";
import { useBooks } from "@/hooks/useBooks";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { createOrderBook } from "@/lib/actions";
import { explainError } from "@/lib/errors";
import { Button, Card, Notice, TokenIcon } from "./ui";

/** Your tokens, each with its order book or a button to open one. */
export function CreateOrderBookForm() {
  const { program, provider, send } = usePrivateAccount();
  const { tokens } = useBalances();
  const { books, refresh } = useBooks();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = provider?.wallet.publicKey.toBase58();
  const mine = tokens.filter((t) => t.creator === me && !t.isUsdc);
  const hasBook = new Set(books.map((b) => b.tokenMint));

  async function create(mint: string) {
    if (!program || !provider) return;
    setBusy(mint);
    setError(null);
    try {
      await createOrderBook(program, send, provider.wallet.publicKey, new PublicKey(mint));
      await refresh();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Your tokens" subtitle="Open a private TOKEN/USDC order book for a token you created.">
      {mine.length === 0 ? (
        <p className="text-sm text-muted">
          You haven&apos;t created a token yet.{" "}
          <Link href="/create/token" className="text-accent hover:underline">
            Create one →
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {mine.map((t) => (
            <div key={t.mint} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <TokenIcon image={t.image} symbol={t.symbol} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.name}</p>
                <p className="text-xs text-muted">${t.symbol}</p>
              </div>
              {hasBook.has(t.mint) ? (
                <Link href={`/book/${t.mint}`} className="text-sm text-accent hover:underline">
                  Open book →
                </Link>
              ) : (
                <Button className="h-9" onClick={() => create(t.mint)} loading={busy === t.mint} disabled={!!busy}>
                  Create order book
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </Card>
  );
}
