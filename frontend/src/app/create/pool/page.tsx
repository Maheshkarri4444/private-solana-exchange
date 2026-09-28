"use client";

import { AccountGate } from "@/components/AccountGate";
import { CreatePoolForm } from "@/components/CreatePoolForm";
import { Card } from "@/components/ui";
import { UsdcMinter } from "@/components/UsdcMinter";
import { useBalances } from "@/hooks/useBalances";

export default function CreatePoolPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold">Create a liquidity pool</h1>
      <p className="mt-2 mb-8 text-muted">
        Launch trading for your token. You set the starting price by how much of each side you add.
      </p>
      <AccountGate>
        <Content />
      </AccountGate>
    </div>
  );
}

function Content() {
  const { refresh } = useBalances();
  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <CreatePoolForm />
      <div className="space-y-6">
        <UsdcMinter onMinted={refresh} />
        <Card title="How it works">
          <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted">
            <li>Your deposit is encrypted in this browser.</li>
            <li>Arcium moves it from your private balances into the pool — nobody sees the amounts.</li>
            <li>
              You get 1,000,000 LP tokens (private). Swap fees stay in the pool, so your LP share grows in
              value.
            </li>
            <li>The starting price = USDC ÷ tokens. From then on, every trade moves it.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
