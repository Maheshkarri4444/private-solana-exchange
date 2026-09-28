"use client";

import Link from "next/link";
import { useState } from "react";
import { type PrivateBalance, useBalances } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { mintPrivate } from "@/lib/actions";
import { FAUCET_AMOUNT } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatAmount, shortAddress } from "@/lib/format";
import { pdas } from "@/lib/program";
import { AccountGate } from "./AccountGate";
import { MoveToWallet } from "./MoveToWallet";
import { Button, Notice, PrivateBadge, Spinner, TokenIcon } from "./ui";

/** Top of the user panel: your encrypted balances + the 30 USDC faucet. */
export function Portfolio() {
  return (
    <section className="rounded-3xl border border-line bg-card/70 p-6">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-semibold">Your private balances</h2>
        <PrivateBadge>encrypted on-chain</PrivateBadge>
      </div>
      <AccountGate inline>
        <Balances />
      </AccountGate>
    </section>
  );
}

function Balances() {
  const { program, provider, send } = usePrivateAccount();
  const { balances, loading, error, refresh } = useBalances();
  const [minting, setMinting] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const selected = balances.find((b) => b.mint === moving);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function mintUsdc() {
    if (!program || !provider) return;
    setMinting(true);
    setNotice(null);
    try {
      const { result } = await mintPrivate(program, send, provider.wallet.publicKey, pdas.usdcMint(), FAUCET_AMOUNT);
      setNotice(
        result === "credited"
          ? { tone: "success", text: `+${formatAmount(FAUCET_AMOUNT)} USDC added to your private balance.` }
          : { tone: "error", text: "Arcium didn't finish yet. Refresh in a minute." },
      );
      refresh();
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e) });
    } finally {
      setMinting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Only your browser can decrypt these numbers.</p>
        <div className="flex items-center gap-4">
          <Link href="/create/token" className="text-sm text-muted transition hover:text-accent">
            ＋ Create your own token
          </Link>
          <Button onClick={mintUsdc} loading={minting} className="h-10">
            {minting ? "Encrypting in Arcium…" : `Mint ${formatAmount(FAUCET_AMOUNT)} USDC`}
          </Button>
        </div>
      </div>

      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {!error && balances.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          {loading ? "Decrypting your balances…" : "Nothing here yet — mint some test USDC to start trading."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.map((b) => (
          <BalanceChip key={b.mint} balance={b} onMove={() => setMoving(b.mint)} />
        ))}
      </div>

      {selected && (
        <div className="mt-4">
          <MoveToWallet balance={selected} onClose={() => setMoving(null)} />
        </div>
      )}
    </div>
  );
}

function BalanceChip({ balance, onMove }: { balance: PrivateBalance; onMove: () => void }) {
  const { token } = balance;
  const moving = balance.record.unshieldState !== 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg/60 p-3">
      <TokenIcon image={token?.image} symbol={token?.symbol} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{token?.symbol ?? shortAddress(balance.mint)}</p>
        <p className="truncate text-xs text-muted">{token?.name ?? "Unknown token"}</p>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm">{balance.pending ? <Spinner /> : formatAmount(balance.amount)}</div>
        {(balance.amount > 0n || moving) && (
          <button onClick={onMove} className={`text-xs hover:text-accent ${moving ? "text-private" : "text-muted"}`}>
            {moving ? "🔒 moving to wallet" : "Move to wallet ↗"}
          </button>
        )}
      </div>
    </div>
  );
}
