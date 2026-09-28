"use client";

import { AccountGate } from "@/components/AccountGate";
import { CreatedTokens } from "@/components/CreatedTokens";
import { CreateTokenForm } from "@/components/CreateTokenForm";
import { useBalances } from "@/hooks/useBalances";

export default function CreateTokenPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold">Create a token</h1>
      <p className="mt-2 mb-8 text-muted">
        A real SPL mint. The whole supply lands privately in your encrypted balance.
      </p>
      <AccountGate>
        <Content />
      </AccountGate>
    </div>
  );
}

function Content() {
  const { tokens, refresh } = useBalances();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CreateTokenForm onCreated={refresh} />
      <CreatedTokens tokens={tokens} />
    </div>
  );
}
