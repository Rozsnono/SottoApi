/** Admin API kliens: egységes boríték kezelése, hibák érthető üzenettel (technikai részlet nélkül). */
export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAfterSec?: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError("NETWORK", "Nem érem el a szervert.", 0);
  }
  let json: { ok: boolean; data?: T; error?: { code: string; message: string } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* nem JSON válasz */
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.endsWith("/login")) {
    // Teljes oldalbetöltés szándékos: a lejárt munkamenet állapotát a kliensből is el kell dobni.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin/login";
  }
  if (!json || !json.ok) {
    const ra = Number(res.headers.get("retry-after")) || undefined;
    throw new ApiClientError(json?.error?.code ?? "INTERNAL", json?.error?.message ?? "Váratlan hiba történt.", res.status, ra);
  }
  return json.data as T;
}
