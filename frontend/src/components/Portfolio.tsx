"use client";

import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useState } from "react";
import { type PrivateBalance, useBalances } from "@/hooks/useBalances";
import { useLpFees } from "@/hooks/useLpFees";
import { usePools } from "@/hooks/usePools";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { type WalletToken, useWalletTokens } from "@/hooks/useWalletTokens";
import { mintPrivate, shield } from "@/lib/actions";
import type { TokenMeta } from "@/lib/api";
import { FAUCET_AMOUNT } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatAmount, shortAddress } from "@/lib/format";
import type { Earned } from "@/lib/lp";
import type { PoolView } from "@/lib/pools";
import { pdas } from "@/lib/program";
import { AccountGate } from "./AccountGate";
import { MoveToPrivate } from "./MoveToPrivate";
import { MoveToWallet } from "./MoveToWallet";
import { Button, Notice, PrivateBadge, Spinner, TokenIcon } from "./ui";

/** Top of the user panel: your encrypted balances, the USDC faucet and your public wallet. */
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

type Notice = { tone: "success" | "error"; text: string };

function Balances() {
  const { program, provider, send } = usePrivateAccount();
  const { balances, tokens, loading, error, refresh } = useBalances();
  const { pools } = usePools();
  const lpFees = useLpFees();
  const wallet = useWalletTokens();
  const [minting, setMinting] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [movingIn, setMovingIn] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // LP tokens stay private (their fees are paid privately), so they never move to a wallet.
  const poolByLp = new Map(pools.map((p) => [p.lpMint, p]));
  const selected = balances.find((b) => b.mint === moving);
  const publicTokens = wallet.tokens.filter((t) => !poolByLp.has(t.mint));
  const selectedIn = publicTokens.find((t) => t.account === movingIn);
  const metaOf = (mint: string) => tokens.find((t) => t.mint === mint) ?? null;

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

  /** Re-sends Arcium's credit for tokens already in the vault (after a failed MPC job). */
  async function finishMoveIn(balance: PrivateBalance) {
    if (!program || !provider) return;
    setFinishing(balance.mint);
    setNotice(null);
    try {
      const owner = provider.wallet.publicKey;
      const mint = new PublicKey(balance.mint);
      const tokenProgram = (await provider.connection.getAccountInfo(mint))!.owner;
      const source = getAssociatedTokenAddressSync(mint, owner, false, tokenProgram);
      const { result } = await shield(program, send, owner, { mint, source, amount: 0n }, () => {});
      setNotice(
        result === "credited"
          ? { tone: "success", text: "Done: the tokens are in your private balance." }
          : { tone: "error", text: "Arcium couldn't finish yet. Try again in a minute." },
      );
    } catch (e) {
      setNotice({ tone: "error", text: explainError(e) });
    } finally {
      setFinishing(null);
      refresh();
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
        {balances.map((b) => {
          const pool = poolByLp.get(b.mint);
          const earned = pool ? lpFees?.find((f) => f.position.pool === pool.address)?.earned : undefined;
          return (
            <BalanceChip
              key={b.mint}
              balance={b}
              lpPool={pool}
              earned={earned}
              finishing={finishing === b.mint}
              onMove={() => setMoving(b.mint)}
              onFinish={() => finishMoveIn(b)}
            />
          );
        })}
      </div>

      {selected && (
        <div className="mt-4">
          <MoveToWallet balance={selected} onClose={() => setMoving(null)} />
        </div>
      )}

      {publicTokens.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">In your public wallet</h3>
            <p className="text-xs text-muted">Anyone can see these. Move them in to make them private.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {publicTokens.map((t) => (
              <WalletChip key={t.account} token={t} meta={metaOf(t.mint)} onMove={() => setMovingIn(t.account)} />
            ))}
          </div>
          {selectedIn && (
            <div className="mt-4">
              <MoveToPrivate token={selectedIn} meta={metaOf(selectedIn.mint)} onClose={() => setMovingIn(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceChip({
  balance,
  lpPool,
  earned,
  finishing,
  onMove,
  onFinish,
}: {
  balance: PrivateBalance;
  lpPool?: PoolView;
  earned?: Earned;
  finishing: boolean;
  onMove: () => void;
  onFinish: () => void;
}) {
  const { token } = balance;
  const decimals = token?.decimals ?? 6;
  const moving = balance.record.unshieldState !== 0;
  const owed = BigInt(balance.record.shieldOwed ?? "0") > 0n && !balance.pending;

  let action = null;
  if (lpPool) {
    action = (
      <Link href={`/pool/${lpPool.tokenMint}`} className="text-xs text-accent hover:underline">
        {earned && (earned.usdc > 0n || earned.token > 0n)
          ? `fees +${formatAmount(earned.usdc, 4)} USDC`
          : "earns swap fees"}
      </Link>
    );
  } else if (owed) {
    action = (
      <button onClick={onFinish} disabled={finishing} className="text-xs text-private hover:text-accent">
        {finishing ? "finishing…" : "finish moving in ↙"}
      </button>
    );
  } else if (balance.amount > 0n || moving) {
    action = (
      <button onClick={onMove} className={`text-xs hover:text-accent ${moving ? "text-private" : "text-muted"}`}>
        {moving ? "🔒 moving to wallet" : "Move to wallet ↗"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg/60 p-3">
      <TokenIcon image={token?.image} symbol={token?.symbol} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{token?.symbol ?? shortAddress(balance.mint)}</p>
        <p className="truncate text-xs text-muted">{token?.name ?? "Unknown token"}</p>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm">{balance.pending ? <Spinner /> : formatAmount(balance.amount, 2, decimals)}</div>
        {action}
      </div>
    </div>
  );
}

function WalletChip({ token, meta, onMove }: { token: WalletToken; meta: TokenMeta | null; onMove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3">
      <TokenIcon image={meta?.image} symbol={meta?.symbol} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{meta?.symbol ?? shortAddress(token.mint)}</p>
        <p className="truncate text-xs text-muted">{meta?.name ?? "Token from outside the exchange"}</p>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm">{formatAmount(token.amount, 2, token.decimals)}</div>
        <button onClick={onMove} className="text-xs text-muted hover:text-accent">
          Move to private ↙
        </button>
      </div>
    </div>
  );
}
