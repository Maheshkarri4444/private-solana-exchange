"use client";

import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useCallback, useEffect, useState } from "react";
import { BALANCES_CHANGED } from "./useBalances";
import { usePrivateAccount } from "./usePrivateAccount";

const REFRESH_MS = 30_000;

/** A public SPL token account in the connected wallet. */
export interface WalletToken {
  account: string;
  mint: string;
  amount: bigint;
  decimals: number;
  tokenProgram: string;
}

/** Public SPL tokens in the wallet (classic SPL Token and Token-2022), non-empty only. */
export function useWalletTokens() {
  const { provider } = usePrivateAccount();
  const [tokens, setTokens] = useState<WalletToken[]>([]);

  const load = useCallback(async () => {
    if (!provider) {
      setTokens([]);
      return;
    }
    const owner = provider.wallet.publicKey;
    const programs = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
    const results = await Promise.all(
      programs.map((programId) => provider.connection.getParsedTokenAccountsByOwner(owner, { programId })),
    );
    setTokens(
      results
        .flatMap((result, i) =>
          result.value.map(({ pubkey, account }) => {
            const info = account.data.parsed.info;
            return {
              account: pubkey.toBase58(),
              mint: info.mint as string,
              amount: BigInt(info.tokenAmount.amount),
              decimals: info.tokenAmount.decimals as number,
              tokenProgram: programs[i].toBase58(),
            };
          }),
        )
        .filter((t) => t.amount > 0n),
    );
  }, [provider]);

  useEffect(() => {
    const run = () => load().catch(() => {});
    run();
    const id = setInterval(run, REFRESH_MS);
    window.addEventListener(BALANCES_CHANGED, run);
    return () => {
      clearInterval(id);
      window.removeEventListener(BALANCES_CHANGED, run);
    };
  }, [load]);

  return { tokens, refresh: load };
}
