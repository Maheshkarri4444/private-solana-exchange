import type { BookRecord } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { timeAgo } from "./BookCard";
import { Card } from "./ui";

/** The public side of a book: which slots hold an order, and whose. Nothing else. */
export function BookSlots({ book, me }: { book: BookRecord; me: string | null }) {
  return (
    <Card
      title="The book"
      subtitle="Anyone can see that these orders exist and who placed them. Side, price and size are encrypted: only Arcium can match them."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {book.slots.map((s, i) =>
          s.owner ? (
            <div key={i} className="rounded-xl border border-private/30 bg-private/10 p-3">
              <div className="flex items-center justify-between">
                <span className="text-lg">🔒</span>
                {s.owner === me && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">YOU</span>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold">Hidden order</p>
              <p className="font-mono text-xs text-muted">
                #{s.seq} · {shortAddress(s.owner)}
              </p>
            </div>
          ) : (
            <div key={i} className="flex flex-col justify-center rounded-xl border border-dashed border-line p-3 text-center">
              <p className="text-xs text-muted">Empty slot</p>
            </div>
          ),
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        {book.ordersPlaced.toLocaleString("en-US")} orders placed · last activity {timeAgo(book.lastActivityAt)}
      </p>
    </Card>
  );
}
