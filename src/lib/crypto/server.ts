/**
 * Szerveroldali kriptó segédek (@noble). A szerver SOHA nem lát privát felhasználói kulcsot;
 * itt csak (1) a nyugalmi beállítás-titkosítás, (2) publikus kulcsra zárás (sealed box), (3) hash-ek és TOTP vannak.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { timingSafeEqual, createHash } from "node:crypto";
import { getEnv } from "../env";

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const utf8 = (s: string) => new TextEncoder().encode(s);

// A csomagolás a böngészőben is használt, közös protokoll-modulban él.
export { sealForPublicKey, openSealed, type SealedEnvelope } from "@/protocol/wrap";

function settingsKey(): Uint8Array {
  return unb64(getEnv().CONFIG_ENCRYPTION_KEY);
}

/** Beállítás-érték titkosítása nyugalmi tároláshoz. A `aad` (pl. a kulcs neve) hozzákötődik. */
export function encryptSetting(plaintext: string, aad: string): { valueEncrypted: string; nonce: string } {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(settingsKey(), nonce, utf8(aad)).encrypt(utf8(plaintext));
  return { valueEncrypted: b64(ct), nonce: b64(nonce) };
}

export function decryptSetting(valueEncrypted: string, nonce: string, aad: string): string {
  const pt = xchacha20poly1305(settingsKey(), unb64(nonce), utf8(aad)).decrypt(unb64(valueEncrypted));
  return new TextDecoder().decode(pt);
}

/** SHA-256 hex (token- és verifikátor-hash-ekhez, magas entrópiájú bemenetre). */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Időállandó összehasonlítás hash-eken keresztül (hosszfüggetlen). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomToken(bytes = 32): string {
  return Buffer.from(randomBytes(bytes)).toString("base64url");
}

// ---- TOTP (RFC 6238, SHA-1, 30 mp, 6 számjegy) az opcionális admin 2. faktorhoz ----
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Érvénytelen base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function totpAt(secretB32: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 1000 / 30);
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(counter));
  const h = hmac(sha1, base32Decode(secretB32), buf);
  const o = h[h.length - 1] & 0x0f;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** ±1 lépés (30 mp) tűréssel, időállandó összehasonlítással. */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  let ok = false;
  for (const step of [-1, 0, 1]) {
    if (safeEqual(totpAt(secretB32, nowMs + step * 30_000), code)) ok = true;
  }
  return ok;
}
