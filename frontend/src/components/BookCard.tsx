import Link from "next/link";
import type { BookRecord } from "@/lib/api";
import { BOOK_SLOTS, openOrders } from "@/lib/books";
import { formatPrice, shortAddress } from "@/lib/format";
import { PrivateBadge, TokenIcon } from "./ui";

export function timeAgo(unix: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unix));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function BookCard({ book }: { book: BookRecord }) {
  const open = openOrders(book);
  return (
    <Link
      href={`/book/${book.tokenMint}`}
      className="group flex flex-col rounded-2xl border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-private/60"
    >
      <div className="flex items-center gap-3">
        <TokenIcon image={book.token?.image} symbol={book.token?.symbol} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{book.token?.name ?? shortAddress(book.tokenMint)}</p>
          <p className="text-xs text-muted">${book.token?.symbol ?? "?"} / USDC</p>
        </div>
        <PrivateBadge>order book</PrivateBadge>
      </div>

      <div className="mt-4 flex gap-1">
        {book.slots.map((s, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${s.owner ? "bg-private" : "bg-white/10"}`} />
        ))}
      </div>

      <div className="mt-3 flex items-end justify-between text-sm">
        <div>
          <p className="text-xs text-muted">Open orders</p>
          <p className="font-mono font-semibold">
            {open} / {BOOK_SLOTS}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">
            {book.poolPrice ? `Pool ${formatPrice(Number(book.poolPrice) / 1e12)} USDC` : "Prices hidden"}
          </p>
          <p className="text-xs text-muted">Active {timeAgo(book.lastActivityAt)}</p>
        </div>
      </div>
    </Link>
  );
}
