"use client";

import { useState } from "react";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { mintPrivate } from "@/lib/actions";
import { explorerTxUrl } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatAmount, parseAmount } from "@/lib/format";
import { pdas } from "@/lib/program";
import { Button, Card, Field, Input, Notice } from "./ui";

const PRESETS = ["100", "1000", "10000"];

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "mpc" }
  | { kind: "done"; text: string; signature: string }
  | { kind: "error"; text: string };

export function UsdcMinter({ onMinted }: { onMinted: () => void }) {
  const { program, provider, send } = usePrivateAccount();
  const [amount, setAmount] = useState("1000");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const parsed = parseAmount(amount);
  const busy = status.kind === "sending" || status.kind === "mpc";

  async function mint() {
    if (!program || !provider || !parsed) return;
    setStatus({ kind: "sending" });
    try {
      const pending = mintPrivate(program, send, provider.wallet.publicKey, pdas.usdcMint(), parsed);
      // The tx confirms quickly; most of the wait is the MPC round trip.
      setTimeout(() => setStatus((s) => (s.kind === "sending" ? { kind: "mpc" } : s)), 4000);
      const { signature, result } = await pending;
      if (result === "credited") {
        setStatus({ kind: "done", text: `Minted ${formatAmount(parsed)} USDC privately.`, signature });
      } else if (result === "failed") {
        setStatus({ kind: "error", text: "Arcium could not complete the computation. Try again." });
      } else {
        setStatus({ kind: "error", text: "Still processing in Arcium. Refresh your balance in a minute." });
      }
      onMinted();
    } catch (e) {
      setStatus({ kind: "error", text: explainError(e) });
    }
  }

  return (
    <Card title="Mint test USDC" subtitle="Free devnet USDC, straight into your encrypted balance.">
      <div className="space-y-4">
        <Field label="Amount">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1000"
            disabled={busy}
          />
        </Field>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1 text-xs text-muted hover:text-fg"
            >
              {Number(p).toLocaleString("en-US")}
            </button>
          ))}
        </div>

        <Button className="w-full" onClick={mint} loading={busy} disabled={!parsed || parsed === 0n}>
          {status.kind === "mpc" ? "Encrypting in Arcium…" : "Mint USDC"}
        </Button>

        <p className="text-xs text-muted">
          The amount is public (it changes the public supply). Your resulting balance is not.
        </p>

        {status.kind === "mpc" && (
          <Notice tone="info">Arcium is adding this to your encrypted balance. Usually 10–60s.</Notice>
        )}
        {status.kind === "done" && (
          <Notice tone="success">
            {status.text}{" "}
            <a className="underline" href={explorerTxUrl(status.signature)} target="_blank" rel="noreferrer">
              View tx
            </a>
          </Notice>
        )}
        {status.kind === "error" && <Notice tone="error">{status.text}</Notice>}
      </div>
    </Card>
  );
}
