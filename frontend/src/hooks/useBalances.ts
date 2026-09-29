"use client";

import { BN } from "@anchor-lang/core";
import { useCallback, useEffect, useState } from "react";
import { type EtaRecord, type TokenMeta, listEtas, listTokens } from "@/lib/api";
import { decryptBalance } from "@/lib/arcium";
import { usePrivateAccount } from "./usePrivateAccount";

/** Fired after anything that changes the user's balances (a mint, a swap, a payout…). */
export const BALANCES_CHANGED = "private-balances-changed";

/** Tells every balances view on the page to reload (after a mint, swap, …). */
export function notifyBalancesChanged() {
  window.dispatchEvent(new Event(BALANCES_CHANGED));
}

export interface PrivateBalance {
  mint: string;
  amount: bigint;
  /** An MPC job is still running on this account. */
  pending: boolean;
  token: TokenMeta | null;
  /** The raw on-chain record (unshield state etc.). */
  record: EtaRecord;
}

/**
 * Loads the user's encrypted token accounts from the backend index and
 * decrypts them here. The backend only ever sees ciphertexts.
 */
export function useBalances() {
  const { keys, mxePublicKey, provider } = usePrivateAccount();
  const [balances, setBalances] = useState<PrivateBalance[]>([]);
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owner = provider?.wallet.publicKey.toBase58();

  const load = useCallback(async () => {
    if (!keys || !mxePublicKey || !owner) return;
    setLoading(true);
    setError(null);
    try {
      const [etas, tokenList] = await Promise.all([listEtas(owner), listTokens()]);
      const next = etas.map((record) => ({
        mint: record.mint,
        amount: record.isInitialized
          ? decryptBalance(
              keys.privateKey,
              mxePublicKey,
              Array.from(Buffer.from(record.balanceCt, "base64")),
              new BN(record.nonce),
            )
          : 0n,
        pending: record.pending,
        token: record.token,
        record,
      }));
      // USDC first, then by symbol.
      next.sort(
        (a, b) =>
          Number(b.token?.isUsdc ?? false) - Number(a.token?.isUsdc ?? false) ||
          (a.token?.symbol ?? "").localeCompare(b.token?.symbol ?? ""),
      );
      setBalances(next);
      setTokens(tokenList);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [keys, mxePublicKey, owner]);

  useEffect(() => {
    load();
    window.addEventListener(BALANCES_CHANGED, load);
    return () => window.removeEventListener(BALANCES_CHANGED, load);
  }, [load]);

  return { balances, tokens, loading, error, refresh: notifyBalancesChanged };
}
