"use client";

import { useCallback, useEffect, useState } from "react";
import { type PoolView, fetchPool, fetchPools } from "@/lib/pools";

// Reads come from our backend's index, so polling is cheap (no RPC).
const REFRESH_MS = 8_000;

/** Every pool, refreshed in the background so other people's trades show up. */
export function usePools() {
  const [pools, setPools] = useState<PoolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPools(await fetchPools());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { pools, loading, error, refresh };
}

/** One pool by token mint. */
export function usePool(tokenMint: string | null) {
  const [pool, setPool] = useState<PoolView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenMint) return;
    setPool(await fetchPool(tokenMint));
    setLoading(false);
  }, [tokenMint]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { pool, loading, refresh };
}
