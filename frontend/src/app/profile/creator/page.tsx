"use client";

import { useState } from "react";
import { AccountGate } from "@/components/AccountGate";
import { BalancesCard } from "@/components/BalancesCard";
import { CreatedTokens } from "@/components/CreatedTokens";
import { CreateTokenForm } from "@/components/CreateTokenForm";
import { UsdcMinter } from "@/components/UsdcMinter";
import { useBalances } from "@/hooks/useBalances";

export default function CreatorPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold">Creator</h1>
      <p className="mt-2 mb-8 text-muted">Mint test USDC and launch your own token — privately.</p>
      <AccountGate>
        <CreatorContent />
      </AccountGate>
    </div>
  );
}

function CreatorContent() {
  const { balances, tokens, loading, error, refresh } = useBalances();
  const [version, setVersion] = useState(0);

  const onChange = () => {
    refresh();
    setVersion((v) => v + 1);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <UsdcMinter onMinted={onChange} />
        <BalancesCard balances={balances} loading={loading} error={error} onRefresh={refresh} />
      </div>
      <div className="space-y-6">
        <CreateTokenForm onCreated={onChange} />
        <CreatedTokens tokens={tokens} version={version} />
      </div>
    </div>
  );
}
