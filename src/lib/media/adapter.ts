/**
 * Média tároló adapter. A telefonok közvetlenül a médiaszolgáltatásra töltenek fel (titkosított tartalom);
 * a szerver ezen az adapteren keresztül ellenőrzi (méret), takarít és töröl a SZERVERES kulccsal.
 */
export interface MediaInfo {
  exists: boolean;
  sizeBytes?: number;
}
export interface MediaHealth {
  ok: boolean;
  detail: string;
  keyFolder?: string | null;
  keyExpiresAt?: string | null;
  keyEnabled?: boolean;
}
export interface MediaStorageAdapter {
  info(ref: string): Promise<MediaInfo>;
  delete(ref: string): Promise<void>;
  health(): Promise<MediaHealth>;
}

/** A `mediaRef` 128 bites véletlen azonosító (hex) – más forma nem elfogadott (path traversal ellen). */
export const MEDIA_REF_RE = /^[a-f0-9]{32}$/;
export function assertMediaRef(ref: string): void {
  if (!MEDIA_REF_RE.test(ref)) throw new Error("Érvénytelen mediaRef");
}
