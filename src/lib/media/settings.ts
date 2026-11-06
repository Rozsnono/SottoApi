/**
 * Média API beállítások (admin által kezelt). Nyugalmi állapotban titkosítva az `AppSetting`-ben.
 * A kulcsok csak írhatók: az admin felületre soha nem kerülnek vissza (csak maszkolt utolsó 4 karakter).
 * A telefonos kulcsot az eszköz publikus kulcsára zárva adjuk ki (`sealMediaConfigForDevice`).
 */
import { connectDb } from "../db";
import { AppSetting, Device } from "@/models";
import { decryptSetting, encryptSetting, sealForPublicKey, type SealedEnvelope } from "../crypto/server";
import { ApiError } from "../http";
import { NovastoreNasAdapter } from "./novastoreNas";
import type { MediaStorageAdapter } from "./adapter";

const KEY = "media";

interface StoredMedia {
  baseUrl: string;
  folder: string;
  phoneKey: string;
  serverKey: string;
  phoneKeyExpiresAt: string | null;
}

export interface MediaSettingsInput {
  baseUrl: string;
  folder: string;
  phoneKey?: string;
  serverKey?: string;
  phoneKeyExpiresAt?: string | null;
}

/** Az admin UI-nak adható, titokmentes nézet. */
export interface MediaSettingsPublic {
  configured: boolean;
  baseUrl: string | null;
  folder: string | null;
  phoneKeyMask: string | null;
  serverKeyMask: string | null;
  phoneKeyExpiresAt: string | null;
  version: number;
  devicesReceived: number;
  devicesTotal: number;
  updatedAt: string | null;
}

const mask = (k: string) => (k ? `••••••••${k.slice(-4)}` : null);

async function load(): Promise<{ value: StoredMedia; version: number; updatedAt: Date } | null> {
  await connectDb();
  const doc = await AppSetting.findOne({ key: KEY }).lean();
  if (!doc) return null;
  const value = JSON.parse(decryptSetting(doc.valueEncrypted, doc.nonce, KEY)) as StoredMedia;
  return { value, version: doc.version ?? 1, updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt };
}

export async function getMediaSettingsPublic(): Promise<MediaSettingsPublic> {
  const s = await load();
  const devicesTotal = await Device.countDocuments({ revokedAt: { $exists: false } });
  if (!s) {
    return { configured: false, baseUrl: null, folder: null, phoneKeyMask: null, serverKeyMask: null, phoneKeyExpiresAt: null, version: 0, devicesReceived: 0, devicesTotal, updatedAt: null };
  }
  const devicesReceived = await Device.countDocuments({ revokedAt: { $exists: false }, mediaKeyVersionSeen: { $gte: s.version } });
  return {
    configured: true,
    baseUrl: s.value.baseUrl,
    folder: s.value.folder,
    phoneKeyMask: mask(s.value.phoneKey),
    serverKeyMask: mask(s.value.serverKey),
    phoneKeyExpiresAt: s.value.phoneKeyExpiresAt,
    version: s.version,
    devicesReceived,
    devicesTotal,
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Mentés. A hiányzó kulcs mező a meglévő értéket tartja meg; a telefonos kulcs változása verziót növel. */
export async function saveMediaSettings(input: MediaSettingsInput, adminId: string): Promise<{ version: number; phoneKeyChanged: boolean }> {
  const prev = await load();
  const phoneKey = input.phoneKey ?? prev?.value.phoneKey;
  const serverKey = input.serverKey ?? prev?.value.serverKey;
  if (!phoneKey || !serverKey) throw new ApiError("VALIDATION_ERROR", "A telefonos és a szerveres kulcs megadása kötelező az első mentéskor.");
  const value: StoredMedia = {
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    folder: input.folder.replace(/^\/+|\/+$/g, ""),
    phoneKey,
    serverKey,
    phoneKeyExpiresAt: input.phoneKeyExpiresAt ?? prev?.value.phoneKeyExpiresAt ?? null,
  };
  const phoneKeyChanged = !prev || prev.value.phoneKey !== phoneKey || prev.value.baseUrl !== value.baseUrl || prev.value.folder !== value.folder;
  const version = (prev?.version ?? 0) + (phoneKeyChanged ? 1 : 0) || 1;
  const { valueEncrypted, nonce } = encryptSetting(JSON.stringify(value), KEY);
  await AppSetting.findOneAndUpdate({ key: KEY }, { valueEncrypted, nonce, version, updatedBy: adminId }, { upsert: true });
  return { version, phoneKeyChanged };
}

let adapterOverride: MediaStorageAdapter | null = null;
/** Tesztekhez: adapter felülbírálása (null = a mentett beállításból épített valódi adapter). */
export function setMediaAdapterOverride(a: MediaStorageAdapter | null): void {
  adapterOverride = a;
}

/** Szerveres adapter a mentett beállításokból (törlés/ellenőrzés a SZERVERES kulccsal). */
export async function getMediaAdapter(): Promise<MediaStorageAdapter> {
  if (adapterOverride) return adapterOverride;
  const s = await load();
  if (!s) throw new ApiError("MEDIA_NOT_CONFIGURED", "A médiatár még nincs beállítva.");
  return new NovastoreNasAdapter({ baseUrl: s.value.baseUrl, folder: s.value.folder, serverKey: s.value.serverKey });
}

/** Teszt: ideiglenes (mentetlen) értékekkel is ellenőrizhető a kapcsolat. */
export function adapterFor(cfg: { baseUrl: string; folder: string; serverKey: string }): MediaStorageAdapter {
  return new NovastoreNasAdapter(cfg);
}

export async function getStoredServerKeyConfig(): Promise<{ baseUrl: string; folder: string; serverKey: string } | null> {
  const s = await load();
  return s ? { baseUrl: s.value.baseUrl, folder: s.value.folder, serverKey: s.value.serverKey } : null;
}

export interface DeviceMediaConfig {
  keyVersion: number;
  sealed: SealedEnvelope;
}

/**
 * A telefonos kulcs + elérés az ESZKÖZ PUBLIKUS kulcsára zárva (sealed box). Csak az eszköz privát kulcsa nyitja.
 * A nyílt tartalom: JSON `{ baseUrl, folder, apiKey, keyVersion, expiresAt }`.
 */
export async function sealMediaConfigForDevice(devicePublicKeyB64: string): Promise<DeviceMediaConfig> {
  const s = await load();
  if (!s) throw new ApiError("MEDIA_NOT_CONFIGURED", "A médiatár még nincs beállítva.");
  const payload = JSON.stringify({
    baseUrl: s.value.baseUrl,
    folder: s.value.folder,
    apiKey: s.value.phoneKey,
    keyVersion: s.version,
    expiresAt: s.value.phoneKeyExpiresAt,
  });
  return { keyVersion: s.version, sealed: sealForPublicKey(devicePublicKeyB64, new TextEncoder().encode(payload)) };
}
