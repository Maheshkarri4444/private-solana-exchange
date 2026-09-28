"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { type ReactNode, useState } from "react";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { SIGN_MESSAGE } from "@/lib/keys";
import { Button, Card, Notice, Spinner } from "./ui";

/** Renders children only once the wallet is connected, unlocked and registered. */
export function AccountGate({ children }: { children: ReactNode }) {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { keys, registered, keyMismatch, unlock, register } = usePrivateAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!connected) {
    return (
      <GateCard title="Connect your wallet" text="Use any Solana wallet set to devnet.">
        <Button onClick={() => setVisible(true)}>Connect wallet</Button>
      </GateCard>
    );
  }

  if (registered === null) {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner /> Loading your account…
      </div>
    );
  }

  if (!keys) {
    return (
      <GateCard
        title="Unlock your private account"
        text={
          <>
            Your wallet signs <code className="text-fg">&quot;{SIGN_MESSAGE}&quot;</code>. Your browser
            turns that signature into your encryption key. Nothing is sent anywhere, and it costs no
            gas.
          </>
        }
        error={error}
      >
        <Button loading={busy} onClick={run(unlock)}>
          Sign to unlock
        </Button>
      </GateCard>
    );
  }

  if (!registered) {
    return (
      <GateCard
        title="Create your private account"
        text="One transaction stores your encryption public key on-chain, so Arcium can encrypt balances for you."
        error={error}
      >
        <dl className="mb-5 space-y-2 font-mono text-xs break-all text-muted">
          <div>
            <dt className="text-fg">Wallet</dt>
            <dd data-testid="wallet-address">{publicKey?.toBase58()}</dd>
          </div>
          <div>
            <dt className="text-fg">x25519 public key</dt>
            <dd>{Buffer.from(keys.publicKey).toString("hex")}</dd>
          </div>
        </dl>
        <Button loading={busy} onClick={run(register)}>
          Create account
        </Button>
      </GateCard>
    );
  }

  if (keyMismatch) {
    return (
      <Notice tone="error">
        This wallet registered a different encryption key. Balances cannot be decrypted with the key
        derived here.
      </Notice>
    );
  }

  return <>{children}</>;
}

function GateCard({
  title,
  text,
  error,
  children,
}: {
  title: string;
  text: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-muted">{text}</p>
      {children}
      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </Card>
  );
}
