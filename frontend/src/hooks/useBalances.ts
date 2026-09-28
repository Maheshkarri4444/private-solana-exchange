"use client";

import { getTokenMetadata } from "@solana/spl-token";
import { type Connection, PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { type TokenMeta, listTokens } from "@/lib/api";
import { decryptBalance } from "@/lib/arcium";
import { ETA_OWNER_OFFSET } from "@/lib/program";
import { usePrivateAccount } from "./usePrivateAccount";

export interface PrivateBalance {
  mint: string;
  amount: bigint;
  /** An MPC job is still running on this account. */
  pending: boolean;
  token: TokenMeta | null;
}

/** Fallback when a token is missing from the backend list: read its on-chain metadata. */
async function onChainMeta(connection: Connection, mint: PublicKey): Promise<TokenMeta | null> {
  const meta = await getTokenMetadata(connection, mint, "confirmed").catch(() => null);
  if (!meta) return null;
  return {
    mint: mint.toBase58(),
    creator: "",
    name: meta.name,
    symbol: meta.symbol,
    uri: meta.uri,
    image: null,
    description: null,
    maxSupply: "0",
    isUsdc: meta.symbol === "USDC",
    createdAt: "",
  };
}

/** Loads every ETA the user owns and decrypts it locally. */
export function useBalances() {
  const { program, keys, mxePublicKey, provider } = usePrivateAccount();
  const [balances, setBalances] = useState<PrivateBalance[]>([]);
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owner = provider?.wallet.publicKey;

  const refresh = useCallback(async () => {
    if (!program || !keys || !mxePublicKey || !owner) return;
    setLoading(true);
    setError(null);
    try {
      const [etas, tokenList] = await Promise.all([
        program.account.encryptedTokenAccount.all([
          { memcmp: { offset: ETA_OWNER_OFFSET, bytes: owner.toBase58() } },
        ]),
        listTokens().catch(() => [] as TokenMeta[]),
      ]);
      const byMint = new Map(tokenList.map((t) => [t.mint, t]));

      const next = await Promise.all(
        etas.map(async ({ account }) => ({
          mint: account.mint.toBase58(),
          amount: account.isInitialized
            ? decryptBalance(keys.privateKey, mxePublicKey, account.balanceCt, account.nonce)
            : 0n,
          pending: !account.pendingComputation.equals(PublicKey.default),
          token:
            byMint.get(account.mint.toBase58()) ??
            (await onChainMeta(program.provider.connection, account.mint)),
        })),
      );
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
  }, [program, keys, mxePublicKey, owner]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balances, tokens, loading, error, refresh };
}
