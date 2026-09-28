"use client";

import Link from "next/link";
import { AccountGate } from "@/components/AccountGate";
import { BalancesCard } from "@/components/BalancesCard";
import { Button, Card } from "@/components/ui";
import { useBalances } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { explorerUrl } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export default function ProfilePage() {
  return (
    <div>
      <h1 className="mb-8 text-3xl font-semibold">Profile</h1>
      <AccountGate>
        <ProfileContent />
      </AccountGate>
    </div>
  );
}

function ProfileContent() {
  const { provider, keys, lock } = usePrivateAccount();
  const { balances, loading, error, refresh } = useBalances();
  const wallet = provider?.wallet.publicKey.toBase58() ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-6">
        <Card title="Your account">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Wallet</dt>
              <dd>
                <a href={explorerUrl(wallet)} target="_blank" rel="noreferrer" className="font-mono hover:text-accent">
                  {shortAddress(wallet)}
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Encryption key</dt>
              <dd className="font-mono">
                {keys ? shortAddress(Buffer.from(keys.publicKey).toString("hex")) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Status</dt>
              <dd className="text-emerald-400">Unlocked in this tab</dd>
            </div>
          </dl>
          <Button variant="ghost" onClick={lock} className="mt-5 w-full">
            Lock
          </Button>
        </Card>

        <Link
          href="/profile/creator"
          className="block rounded-2xl border border-line bg-card p-6 transition hover:border-accent"
        >
          <p className="font-semibold">Creator page →</p>
          <p className="mt-1 text-sm text-muted">Mint test USDC and create your own private token.</p>
        </Link>
      </div>

      <BalancesCard balances={balances} loading={loading} error={error} onRefresh={refresh} />
    </div>
  );
}
