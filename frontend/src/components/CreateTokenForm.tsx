"use client";

import { type FormEvent, useState } from "react";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { type CreateStep, createToken } from "@/lib/actions";
import { explorerUrl } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatAmount, parseAmount } from "@/lib/format";
import { Button, Card, Field, Input, Notice, Spinner } from "./ui";

const STEPS: { key: CreateStep; label: string }[] = [
  { key: "upload", label: "Upload image + metadata to IPFS" },
  { key: "create", label: "Create the SPL mint (supply 0)" },
  { key: "mint", label: "Mint full supply into your encrypted balance" },
];

export function CreateTokenForm({ onCreated }: { onCreated: () => void }) {
  const { program, provider, send } = usePrivateAccount();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [supply, setSupply] = useState("1000000");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState<CreateStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ mint: string; ok: boolean } | null>(null);

  const parsedSupply = parseAmount(supply);
  const busy = step !== null && step !== "done";
  // The program limits bytes, not characters (emoji take several bytes).
  const bytes = (s: string) => new TextEncoder().encode(s.trim()).length;
  const valid =
    bytes(name) > 0 &&
    bytes(name) <= 32 &&
    bytes(symbol) > 0 &&
    bytes(symbol) <= 10 &&
    !!image &&
    !!parsedSupply &&
    parsedSupply > 0n;

  function pickImage(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be 2MB or smaller");
      return;
    }
    setError(null);
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!program || !provider || !valid || !image || !parsedSupply) return;
    setError(null);
    setCreated(null);
    try {
      const { mint, result } = await createToken(
        program,
        send,
        provider.wallet.publicKey,
        {
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          description: description.trim(),
          image,
          supply: parsedSupply,
        },
        setStep,
      );
      setCreated({ mint: mint.toBase58(), ok: result === "credited" });
      onCreated();
    } catch (err) {
      setError(explainError(err));
      setStep(null);
    }
  }

  const stepIndex = step ? STEPS.findIndex((s) => s.key === step) : -1;

  return (
    <Card
      title="Create your token"
      subtitle="A real SPL mint with supply 0. The whole supply lives privately in your encrypted balance."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line text-xs text-muted hover:border-accent">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="token" className="h-full w-full object-cover" />
            ) : (
              "Image"
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              disabled={busy}
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
          </label>
          <div className="grid flex-1 grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Name">
                <Input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Moon Coin" disabled={busy} />
              </Field>
            </div>
            <Field label="Symbol">
              <Input
                value={symbol}
                maxLength={10}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="MOON"
                disabled={busy}
              />
            </Field>
          </div>
        </div>

        <Field label="Description">
          <Input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="What is this token?" disabled={busy} />
        </Field>

        <Field label="Total supply" hint={parsedSupply ? `${formatAmount(parsedSupply)} tokens, 6 decimals` : "Enter a number"}>
          <Input value={supply} onChange={(e) => setSupply(e.target.value)} inputMode="decimal" disabled={busy} />
        </Field>

        <Button type="submit" className="w-full" loading={busy} disabled={!valid}>
          Create token
        </Button>

        {step && (
          <ol className="space-y-2 rounded-xl border border-line p-4 text-sm">
            {STEPS.map((s, i) => {
              const done = step === "done" || i < stepIndex;
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

        {created && (
          <Notice tone={created.ok ? "success" : "error"}>
            {created.ok ? "Token created and minted privately. " : "Token created, but the private mint did not finish yet. "}
            <a className="underline" href={explorerUrl(created.mint)} target="_blank" rel="noreferrer">
              View mint
            </a>
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Card>
  );
}
