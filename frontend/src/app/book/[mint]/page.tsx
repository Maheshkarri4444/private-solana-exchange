"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AccountGate } from "@/components/AccountGate";
import { BookSlots } from "@/components/BookSlots";
import { MyOrders } from "@/components/MyOrders";
import { OrderForm } from "@/components/OrderForm";
import { Card, PrivateBadge, Spinner, TokenIcon } from "@/components/ui";
import { useBook } from "@/hooks/useBooks";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { explorerUrl } from "@/lib/config";
import { formatPrice, shortAddress } from "@/lib/format";

export default function BookPage() {
  const { mint } = useParams<{ mint: string }>();
  const { book, loading, refresh } = useBook(mint);
  const { provider } = usePrivateAccount();
  const me = provider?.wallet.publicKey.toBase58() ?? null;
  // After our own action: now, and once more in a moment in case the index is a beat behind.
  const refreshSoon = () => {
    refresh();
    setTimeout(refresh, 2500);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Loading order book…
      </div>
    );
  }
  if (!book) {
    return (
      <Card>
        <p className="text-muted">
          No order book for this token.{" "}
          <Link href="/" className="text-accent hover:underline">
            Back to markets
          </Link>
        </p>
      </Card>
    );
  }

  const token = book.token;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <TokenIcon image={token?.image} symbol={token?.symbol} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{token?.name ?? shortAddress(book.tokenMint)} order book</h1>
            <p className="text-sm text-muted">
              ${token?.symbol} / USDC · by{" "}
              <a href={explorerUrl(book.creator)} target="_blank" rel="noreferrer" className="font-mono hover:text-fg">
                {shortAddress(book.creator)}
              </a>
            </p>
          </div>
          <div className="text-right">
            <PrivateBadge>prices hidden</PrivateBadge>
            {book.poolPrice && (
              <p className="mt-1 text-sm text-muted">
                Pool price <span className="font-mono text-fg">{formatPrice(Number(book.poolPrice) / 1e12)} USDC</span>
              </p>
            )}
          </div>
        </div>

        <BookSlots book={book} me={me} />

        <Card title="How it works">
          <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted">
            <li>Your order (buy or sell, price, size) is encrypted in this browser.</li>
            <li>
              Arcium locks the funds from your private balance and matches it against the book: best price first,
              then oldest. Trades happen at the resting order&apos;s price.
            </li>
            <li>Whatever fills right away lands in your private balance. The rest waits in the book.</li>
            <li>
              When others fill your resting order, press <span className="text-fg">Collect</span>. Cancel returns
              anything still locked.
            </li>
          </ol>
          <p className="mt-4 text-xs text-muted">
            Orders trade in whole tokens. A book holds up to 8 orders, 3 per wallet.
          </p>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <Card title="Place a limit order" subtitle="Side, price and size are encrypted: only Arcium sees them.">
          <AccountGate inline>
            <OrderForm book={book} onPlaced={refreshSoon} />
          </AccountGate>
        </Card>
        {me && (
          <Card title="Your orders" subtitle="Decrypted only in this browser.">
            <AccountGate inline>
              <MyOrders book={book} onChanged={refreshSoon} />
            </AccountGate>
          </Card>
        )}
      </div>
    </div>
  );
}
