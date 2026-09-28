"use client";

import { AccountGate } from "@/components/AccountGate";
import { CreateOrderBookForm } from "@/components/CreateOrderBookForm";
import { Card } from "@/components/ui";

export default function CreateOrderBookPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold">Create an order book</h1>
      <p className="mt-2 mb-8 text-muted">
        Hidden limit orders for your token: side, price and size stay encrypted, and Arcium does the matching.
      </p>
      <AccountGate>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <CreateOrderBookForm />
          <Card title="What stays private">
            <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted">
              <li>Every order&apos;s side, price and size, and every fill.</li>
              <li>Even whether a trade happened: each action rewrites the whole encrypted book.</li>
              <li>Public: that an order exists, who placed it, and when.</li>
            </ul>
          </Card>
        </div>
      </AccountGate>
    </div>
  );
}
