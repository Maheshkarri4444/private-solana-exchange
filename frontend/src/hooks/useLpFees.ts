"use client";

import { useCallback, useEffect, useState } from "react";
import { type LpPositionRecord, listLpPositions } from "@/lib/api";
import { type Earned, decryptEarned } from "@/lib/lp";
import { BALANCES_CHANGED } from "./useBalances";
import { usePrivateAccount } from "./usePrivateAccount";

const REFRESH_MS = 8_000;

export interface LpFees {
  position: LpPositionRecord;
  /** Lifetime fees paid to you, decrypted here. */
  earned: Earned;
}

/**
 * Your share of pool swap fees, one entry per pool you provide liquidity to.
 * The backend only has ciphertexts; the totals are decrypted in this browser.
 */
export function useLpFees() {
  const { keys, mxePublicKey, provider } = usePrivateAccount();
  const owner = provider?.wallet.publicKey.toBase58();
  // null until the first load, so watchers can tell "none yet" from "not loaded".
  const [fees, setFees] = useState<LpFees[] | null>(null);

  const load = useCallback(async () => {
    if (!keys || !mxePublicKey || !owner) {
      setFees(null);
      return;
    }
    const positions = await listLpPositions(owner);
    setFees(positions.map((position) => ({ position, earned: decryptEarned(position, keys, mxePublicKey) })));
  }, [keys, mxePublicKey, owner]);

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

  return fees;
}
