"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { notifyBalancesChanged } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import type { WalletToken } from "@/hooks/useWalletTokens";
import { type ShieldStep, shield } from "@/lib/actions";
import type { TokenMeta } from "@/lib/api";
import { explorerTxUrl } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatAmount, parseAmount, shortAddress } from "@/lib/format";
import { Button, Card, Field, Input, Notice, Spinner } from "./ui";

const STEPS: { key: ShieldStep; label: string }[] = [
  { key: "setup", label: "First time for this token: open its vault and your private account" },
  { key: "deposit", label: "Your tokens move into the exchange's vault" },
  { key: "credit", label: "Arcium adds them to your private balance" },
];

type Result = { tone: "success" | "error"; text: string; signature?: string };

/**
 * Moves public SPL tokens into the private balance. They are not burned: they
 * wait in the exchange's vault and pay for later moves back to a wallet.
 */
export function MoveToPrivate({
  token,
  meta,
  onClose,
}: {
  token: WalletToken;
  meta: TokenMeta | null;
  onClose: () => void;
}) {
  const { program, provider, send } = usePrivateAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<ShieldStep | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const symbol = meta?.symbol ?? shortAddress(token.mint);
  const parsed = parseAmount(amount, token.decimals);
  const tooMuch = !!parsed && parsed > token.amount;

  async function move() {
    if (!program || !provider || !parsed) return;
    setBusy(true);
    setResult(null);
    setNeedsSetup(false);
    try {
      const r = await shield(
        program,
        send,
        provider.wallet.publicKey,
        { mint: new PublicKey(token.mint), source: new PublicKey(token.account), amount: parsed },
        (s) => {
          if (s === "setup") setNeedsSetup(true);
          setStep(s);
        },
      );
      setAmount("");
      const shown = `${formatAmount(parsed, 6, token.decimals)} ${symbol}`;
      setResult(
        r.result === "credited"
          ? { tone: "success", text: `${shown} are now in your private balance.`, signature: r.signature }
          : {
              tone: "error",
              text: `${shown} are in the exchange's vault, but Arcium hasn't added them to your private balance yet. Use "finish" on the balance to retry.`,
              signature: r.signature,
            },
      );
    } catch (e) {
      setResult({ tone: "error", text: explainError(e) });
    } finally {
      setBusy(false);
      setStep(null);
      notifyBalancesChanged();
    }
  }

  const steps = STEPS.filter((s) => s.key !== "setup" || needsSetup);
  const stepIndex = step ? steps.findIndex((s) => s.key === step) : -1;

  return (
    <Card
      title={`Move ${symbol} to your private balance`}
      subtitle="The amount you move in is public (it leaves your wallet). From then on your balance is encrypted: only you can read it."
      action={
        <button onClick={onClose} disabled={busy} className="text-muted hover:text-fg" aria-label="Close">
          ✕
        </button>
      }
    >
      <div className="space-y-4">
        <Field
          label="Amount"
          hint={
            <button
              type="button"
              onClick={() => setAmount(formatAmount(token.amount, token.decimals, token.decimals).replace(/,/g, ""))}
              className="hover:text-accent"
            >
              In your wallet {formatAmount(token.amount, 6, token.decimals)} {symbol} · Max
            </button>
          }
        >
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" disabled={busy} />
        </Field>
        <Button onClick={move} loading={busy} disabled={!parsed || parsed === 0n || tooMuch} className="w-full">
          {tooMuch ? `Not enough ${symbol}` : "Move to private"}
        </Button>
        {(!meta || meta.isExternal) && (
          <p className="text-xs text-muted">
            A token from outside the exchange can move in and back out. Trading on the exchange is for tokens made
            here.
          </p>
        )}
      </div>

      {step && (
        <ol className="mt-4 space-y-2 rounded-xl border border-line p-4 text-sm">
          {steps.map((s, i) => {
            const done = i < stepIndex || step === "done";
            const active = i === stepIndex;
            return (
              <li key={s.key} className={`flex items-center gap-2 ${done || active ? "text-fg" : "text-muted"}`}>
                <span className="flex w-4 justify-center">{done ? "✓" : active ? <Spinner /> : "·"}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}

      {result && (
        <div className="mt-4">
          <Notice tone={result.tone}>
            {result.text}{" "}
            {result.signature && (
              <a className="underline" href={explorerTxUrl(result.signature)} target="_blank" rel="noreferrer">
                View tx
              </a>
            )}
          </Notice>
        </div>
      )}
    </Card>
  );
}
