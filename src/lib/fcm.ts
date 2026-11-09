/**
 * Firebase Cloud Messaging (HTTP v1) közvetlen küldő – Expo-fiók nélkül. A szolgáltatásfiók JSON-ja base64-ben jön a
 * `FCM_SERVICE_ACCOUNT_B64` környezeti változóból (titok, soha nem kerül gitbe). Az OAuth2 hozzáférési tokent RS256
 * JWT-vel kérjük (node:crypto, külső függőség nélkül) és lejáratig gyorsítótárazzuk. A push tartalma sosem üzenet-tartalom.
 */
import { createSign } from "node:crypto";
import { logger } from "./logger";

interface Account {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tesztekhez: fetch cseréje. */
export function setFcmFetch(f: typeof fetch | null): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
  tokenCache = null;
}

let parsed: { raw: string; acc: Account | null } | null = null;
function account(): Account | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_B64;
  if (!raw) return null;
  if (parsed?.raw === raw) return parsed.acc;
  let acc: Account | null = null;
  try {
    // Megengedő olvasás: idézőjelek/szóközök/sortörések (.env, panel-beillesztés), base64 vagy base64url, vagy közvetlenül JSON.
    const v = raw.trim().replace(/^['"]|['"]$/g, "");
    const text = v.startsWith("{") ? v : Buffer.from(v.replace(/\s+/g, ""), "base64").toString("utf8");
    const j = JSON.parse(text) as Partial<Account>;
    // Ha a privát kulcs sortörései szó szerinti „\n”-ként érkeztek, visszaalakítjuk.
    const key = j.private_key && !j.private_key.includes("\n") ? j.private_key.replace(/\\n/g, "\n") : j.private_key;
    if (j.client_email && key && j.project_id) acc = { client_email: j.client_email, private_key: key, project_id: j.project_id, token_uri: j.token_uri };
    else logger.error("FCM szolgáltatásfiók hiányos (client_email/private_key/project_id)");
  } catch {
    logger.error("FCM_SERVICE_ACCOUNT_B64 nem érvényes base64 JSON");
  }
  parsed = { raw, acc };
  return acc;
}

/** Be van-e állítva az FCM (különben az FCM-tokenes eszközöknek nem küldünk, és ezt naplózzuk). */
export const fcmEnabled = (): boolean => account() !== null;

/** Az FCM-beállítás állapota a hibakereséshez: `missing` (nincs env), `invalid` (nem értelmezhető), `ok`. */
export function fcmStatus(): "missing" | "invalid" | "ok" {
  if (!process.env.FCM_SERVICE_ACCOUNT_B64) return "missing";
  return account() ? "ok" : "invalid";
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(acc: Account): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  const uri = acc.token_uri ?? "https://oauth2.googleapis.com/token";
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: acc.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: uri, iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(acc.private_key);
  const res = await fetchImpl(uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }) });
  if (!res.ok) throw new Error(`FCM OAuth hiba (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

export type FcmResult = "ok" | "unregistered" | "error";

/** Egy FCM-eszköztoken értesítése. `unregistered`: a token érvénytelen (törölni kell). */
export async function sendFcm(token: string, m: { title: string; body: string; data: Record<string, string> }): Promise<FcmResult> {
  const acc = account();
  if (!acc) return "error";
  try {
    const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken(acc)}` },
      body: JSON.stringify({ message: { token, notification: { title: m.title, body: m.body }, data: m.data, android: { priority: "HIGH", notification: { channel_id: "messages", sound: "default" } } } }),
    });
    if (res.ok) return "ok";
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    if (res.status === 404 || err.error?.status === "NOT_FOUND" || err.error?.details?.some((d) => d.errorCode === "UNREGISTERED")) return "unregistered";
    logger.warn("FCM küldés hiba", { status: res.status, code: err.error?.status });
    return "error";
  } catch (e) {
    logger.error("FCM küldés sikertelen", e);
    return "error";
  }
}
