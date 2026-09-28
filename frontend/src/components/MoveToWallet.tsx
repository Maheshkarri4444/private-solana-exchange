"use client";

import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { type PrivateBalance, notifyBalancesChanged } from "@/hooks/useBalances";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { UNSHIELD, type UnshieldStep, cancelUnshield, finishUnshield, unshield } from "@/lib/actions";
import { explorerTxUrl } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatAmount, parseAmount } from "@/lib/format";
import { Button, Card, Field, Input, Notice, Spinner } from "./ui";

const STEPS: { key: UnshieldStep; label: string }[] = [
  { key: "fingerprint", label: "Arcium fingerprints your encrypted balance" },
  { key: "prove", label: "Your browser proves you have enough (zero-knowledge)" },
  { key: "mint", label: "Solana checks the proof and mints to your wallet" },
  { key: "debit", label: "Arcium subtracts it from your private balance" },
];

type Result = { tone: "success" | "error"; text: string; signature?: string };

/** Moves part of an encrypted balance to the public wallet as real SPL tokens. */
export function MoveToWallet({ balance, onClose }: { balance: PrivateBalance; onClose: () => void }) {
  const { program, provider, keys, mxePublicKey, send } = usePrivateAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<UnshieldStep | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const symbol = balance.token?.symbol ?? "tokens";
  const mint = new PublicKey(balance.mint);
  const state = balance.record.unshieldState;
  const parsed = parseAmount(amount);
  const tooMuch = !!parsed && parsed > balance.amount;

  async function run(action: () => Promise<Result | null>) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await action());
    } catch (e) {
      setResult({ tone: "error", text: explainError(e) });
    } finally {
      setBusy(false);
      setStep(null);
      notifyBalancesChanged();
    }
  }

  const move = () =>
    run(async () => {
      if (!program || !provider || !keys || !mxePublicKey || !parsed) return null;
      const r = await unshield(
        program,
        send,
        provider.wallet.publicKey,
        keys,
        mxePublicKey,
        mint,
        parsed,
        setStep,
        setDownload,
      );
      setAmount("");
      return r.debited
        ? { tone: "success", text: `${formatAmount(parsed)} ${symbol} are now in your wallet.`, signature: r.signature }
        : {
            tone: "error",
            text: `${formatAmount(parsed)} ${symbol} reached your wallet, but Arcium hasn't updated your private balance yet. Press "Finish" to retry.`,
            signature: r.signature,
          };
    });

  const finish = () =>
    run(async () => {
      if (!program || !provider) return null;
      const ok = await finishUnshield(program, send, provider.wallet.publicKey, mint);
      return ok
        ? { tone: "success", text: "Done. Your private balance is up to date." }
        : { tone: "error", text: "Arcium couldn't finish yet. Try again in a minute." };
    });

  const cancel = () =>
    run(async () => {
      if (!program || !provider) return null;
      await cancelUnshield(program, send, provider.wallet.publicKey, mint);
      return { tone: "success", text: "Cancelled. Your balance is unlocked." };
    });

  const stepIndex = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <Card
      title={`Move ${symbol} to your wallet`}
      subtitle="You prove you have enough with a zero-knowledge proof made in your browser, so your balance stays secret. The amount you move becomes public, as real SPL tokens."
      action={
        <button onClick={onClose} disabled={busy} className="text-muted hover:text-fg" aria-label="Close">
          ✕
        </button>
      }
    >
      {state === UNSHIELD.DEBITING && !busy ? (
        <div className="space-y-3">
          <Notice tone="info">
            {formatAmount(BigInt(balance.record.unshieldAmount))} {symbol} were minted to your wallet, but your
            private balance hasn&apos;t been reduced yet. It stays locked until this finishes.
          </Notice>
          <Button onClick={finish} className="w-full">
            Finish
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field
            label="Amount"
            hint={
              <button
                type="button"
                onClick={() => setAmount(formatAmount(balance.amount, 6).replace(/,/g, ""))}
                className="hover:text-accent"
              >
                Private balance {formatAmount(balance.amount, 6)} {symbol} · Max
              </button>
            }
          >
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" disabled={busy} />
          </Field>

          <Button onClick={move} loading={busy} disabled={!parsed || parsed === 0n || tooMuch} className="w-full">
            {tooMuch ? `Not enough ${symbol}` : "Move to wallet"}
          </Button>

          {(state === UNSHIELD.READY || state === UNSHIELD.COMMITTING) && !busy && (
            <p className="text-xs text-muted">
              A move to wallet was started earlier and your balance is locked. Continue above, or{" "}
              <button onClick={cancel} className="underline hover:text-fg">
                cancel it
              </button>
              .
            </p>
          )}
        </div>
      )}

      {step && (
        <ol className="mt-4 space-y-2 rounded-xl border border-line p-4 text-sm">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || step === "done";
            const active = i === stepIndex;
            return (
              <li key={s.key} className={`flex items-center gap-2 ${done || active ? "text-fg" : "text-muted"}`}>
                <span className="flex w-4 justify-center">{done ? "✓" : active ? <Spinner /> : "·"}</span>
                {s.label}
              </li>
            );
          })}
          {step === "prove" && download !== null && download < 1 && (
            <li className="pl-6 text-xs text-muted">
              Downloading the proving key (82 MB, once per visit)… {Math.floor(download * 100)}%
            </li>
          )}
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
