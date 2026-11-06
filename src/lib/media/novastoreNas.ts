/**
 * A NovaStore NAS fájlszolgáltatás adaptere (`x-api-key` fejléc; a kulcs SOHA nem megy URL-be/lekérdezésbe).
 * Végpontok: GET /health, GET /health/key, GET /download/info?path=, DELETE /files?path=.
 * Útvonal: `<folder>/<ref>` (a kulcs mappájához képest relatív).
 */
import { assertMediaRef, type MediaHealth, type MediaInfo, type MediaStorageAdapter } from "./adapter";

export interface NovastoreConfig {
  baseUrl: string;
  folder: string;
  serverKey: string;
  timeoutMs?: number;
}

export class NovastoreNasAdapter implements MediaStorageAdapter {
  constructor(private cfg: NovastoreConfig, private fetchImpl: typeof fetch = fetch) {}

  private url(path: string, q?: Record<string, string>): string {
    const u = new URL(path, this.cfg.baseUrl.endsWith("/") ? this.cfg.baseUrl : this.cfg.baseUrl + "/");
    for (const [k, v] of Object.entries(q ?? {})) u.searchParams.set(k, v);
    return u.toString();
  }

  private async req(path: string, init: RequestInit, q?: Record<string, string>): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 8000);
    try {
      return await this.fetchImpl(this.url(path, q), {
        ...init,
        headers: { ...(init.headers ?? {}), "x-api-key": this.cfg.serverKey },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }

  private pathFor(ref: string): string {
    assertMediaRef(ref);
    return `${this.cfg.folder.replace(/^\/+|\/+$/g, "")}/${ref}`;
  }

  async info(ref: string): Promise<MediaInfo> {
    const res = await this.req("download/info", { method: "GET" }, { path: this.pathFor(ref) });
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw new Error(`Média info hiba: HTTP ${res.status}`);
    const j = (await res.json()) as { size?: number; fileSize?: number };
    return { exists: true, sizeBytes: j.size ?? j.fileSize };
  }

  async delete(ref: string): Promise<void> {
    const res = await this.req("files", { method: "DELETE" }, { path: this.pathFor(ref) });
    if (!res.ok && res.status !== 404) throw new Error(`Média törlés hiba: HTTP ${res.status}`);
  }

  async health(): Promise<MediaHealth> {
    try {
      const h = await this.req("health", { method: "GET" });
      if (!h.ok) return { ok: false, detail: `A szolgáltatás nem egészséges (HTTP ${h.status}).` };
      const k = await this.req("health/key", { method: "GET" });
      if (k.status === 401 || k.status === 403) return { ok: false, detail: "A kulcsot a szolgáltatás elutasította." };
      if (!k.ok) return { ok: false, detail: `Kulcs-ellenőrzés hiba (HTTP ${k.status}).` };
      const j = (await k.json()) as { folder?: string | null; expiresAt?: string | null; enabled?: boolean };
      return { ok: j.enabled !== false, detail: "Kapcsolat rendben.", keyFolder: j.folder ?? null, keyExpiresAt: j.expiresAt ?? null, keyEnabled: j.enabled };
    } catch {
      return { ok: false, detail: "A szolgáltatás nem érhető el." };
    }
  }
}
