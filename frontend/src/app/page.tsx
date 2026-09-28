"use client";

import Link from "next/link";
import { BookCard } from "@/components/BookCard";
import { PoolCard } from "@/components/PoolCard";
import { Portfolio } from "@/components/Portfolio";
import { Notice, Spinner } from "@/components/ui";
import { useBooks } from "@/hooks/useBooks";
import { usePools } from "@/hooks/usePools";

/** The user panel: private balances on top, live pools and order books below. */
export default function Home() {
  const { pools, loading, error } = usePools();
  const { books, loading: booksLoading, error: booksError } = useBooks();
  const live = pools.filter((p) => p.active);

  return (
    <div className="space-y-12">
      <Portfolio />

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Live pools</h2>
            <p className="mt-1 text-sm text-muted">
              Reserves are private. Arcium publishes only the price and a health score after every trade.
            </p>
          </div>
          <Link
            href="/create/pool"
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            ＋ Create pool
          </Link>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {loading ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading pools…
          </div>
        ) : live.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            No pools yet.{" "}
            <Link href="/create/pool" className="text-accent hover:underline">
              Launch the first one →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((pool) => (
              <PoolCard key={pool.address} pool={pool} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Order books</h2>
            <p className="mt-1 text-sm text-muted">
              Hidden limit orders: side, price and size stay encrypted. Arcium matches them.
            </p>
          </div>
          <Link
            href="/create/orderbook"
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:border-private hover:text-private"
          >
            ＋ Create order book
          </Link>
        </div>

        {booksError && <Notice tone="error">{booksError}</Notice>}
        {booksLoading ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner /> Loading order books…
          </div>
        ) : books.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            No order books yet.{" "}
            <Link href="/create/orderbook" className="text-private hover:underline">
              Open the first one →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <BookCard key={book.address} book={book} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
