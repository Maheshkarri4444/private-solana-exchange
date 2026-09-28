"use client";

import { useCallback, useEffect, useState } from "react";
import { type BookRecord, getBook, listBooks } from "@/lib/api";

// Reads come from our backend's index, so polling is cheap (no RPC).
const REFRESH_MS = 8_000;

/** Every order book, refreshed in the background. */
export function useBooks() {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBooks(await listBooks());
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

  return { books, loading, error, refresh };
}

/** One book by token mint. */
export function useBook(tokenMint: string | null) {
  const [book, setBook] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenMint) return;
    setBook(await getBook(tokenMint));
    setLoading(false);
  }, [tokenMint]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { book, loading, refresh };
}
