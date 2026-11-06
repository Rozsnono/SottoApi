"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError } from "./api";

interface Result<T> {
  key: string;
  data: T | null;
  error: ApiClientError | null;
}

/**
 * Egyszerű adatbetöltő hook: betöltés / hiba / újratöltés. A betöltés állapota származtatott
 * (nincs szinkron setState az effektben): `loading`, amíg az aktuális kulcshoz nincs eredmény.
 */
export function useApi<T>(path: string | null) {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = `${path}|${tick}`;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => { if (!cancelled) setResult({ key, data, error: null }); })
      .catch((e) => {
        if (!cancelled) setResult({ key, data: null, error: e instanceof ApiClientError ? e : new ApiClientError("INTERNAL", "Váratlan hiba történt.", 0) });
      });
    return () => { cancelled = true; };
  }, [path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = result && result.key === key ? result : null;
  return { data: current ? current.data : (result?.data ?? null), error: current?.error ?? null, loading: !!path && !current, reload };
}
