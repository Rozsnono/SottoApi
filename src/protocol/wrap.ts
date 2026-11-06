/**
 * Sotto protokoll – kulcscsomagolás (sealed box) és üzenet-aláírás bemenet. Böngészőben és Node-ban is fut
 * (csak @noble, nincs node:crypto/Buffer). FORRÁS: sotto-api/src/protocol (a sotto-app másolja).
 *
 * Konstrukció: ephemeral X25519 ECDH → HKDF-SHA256(salt = ephPub‖recipientPub, info = "sotto-wrap-v1")
 * → XChaCha20-Poly1305. Csak a címzett privát kulcsa nyitja.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes, bytesToHex } from "@noble/hashes/utils.js";

export interface SealedEnvelope {
  ephemeralPublicKey: string;
  wrapNonce: string;
  wrappedKey: string;
}

export function toB64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

const WRAP_INFO = utf8("sotto-wrap-v1");

function wrapKeyFor(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): Uint8Array {
  const salt = new Uint8Array(ephPub.length + recipientPub.length);
  salt.set(ephPub, 0);
  salt.set(recipientPub, ephPub.length);
  return hkdf(sha256, shared, salt, WRAP_INFO, 32);
}

/** Adat zárása a címzett X25519 PUBLIKUS kulcsára. */
export function sealForPublicKey(recipientPublicKeyB64: string, plaintext: Uint8Array): SealedEnvelope {
  const recipientPub = fromB64(recipientPublicKeyB64);
  if (recipientPub.length !== 32) throw new Error("Érvénytelen X25519 publikus kulcs");
  const ephPriv = randomBytes(32);
  const ephPub = x25519.getPublicKey(ephPriv);
  const key = wrapKeyFor(x25519.getSharedSecret(ephPriv, recipientPub), ephPub, recipientPub);
  const nonce = randomBytes(24);
  return { ephemeralPublicKey: toB64(ephPub), wrapNonce: toB64(nonce), wrappedKey: toB64(xchacha20poly1305(key, nonce).encrypt(plaintext)) };
}

/** A címzett privát kulcsával kinyitja a borítékot. Hibás kulcsnál/sérült adatnál kivételt dob. */
export function openSealed(recipientPrivateKey: Uint8Array, env: SealedEnvelope): Uint8Array {
  const ephPub = fromB64(env.ephemeralPublicKey);
  const recipientPub = x25519.getPublicKey(recipientPrivateKey);
  const key = wrapKeyFor(x25519.getSharedSecret(recipientPrivateKey, ephPub), ephPub, recipientPub);
  return xchacha20poly1305(key, fromB64(env.wrapNonce)).decrypt(fromB64(env.wrappedKey));
}

export interface WrappedKeyEntry {
  deviceId: string;
  ephemeralPublicKey: string;
  wrapNonce: string;
  wrappedKey: string;
}

/** Az üzenet aláírásának bemenete (Ed25519): a mezők rögzített sorrendben, a ciphertext és a borítékok hash-ével. */
export function messageSignatureInput(m: {
  conversationId: string;
  clientMessageId: string;
  type: string;
  nonce: string;
  ciphertext: string;
  wrappedKeys: WrappedKeyEntry[];
}): Uint8Array {
  const wk = [...m.wrappedKeys]
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId))
    .map((w) => `${w.deviceId}:${w.ephemeralPublicKey}:${w.wrapNonce}:${w.wrappedKey}`)
    .join("|");
  const parts = [
    "sotto-msg-v1",
    m.conversationId,
    m.clientMessageId,
    m.type,
    m.nonce,
    bytesToHex(sha256(fromB64(m.ciphertext))),
    bytesToHex(sha256(utf8(wk))),
  ];
  return utf8(parts.join("\n"));
}

/** Üzenet-tartalom visszafejtése a kinyitott üzenetkulccsal. */
export function decryptMessageBody(contentKey: Uint8Array, nonceB64: string, ciphertextB64: string): Uint8Array {
  return xchacha20poly1305(contentKey, fromB64(nonceB64)).decrypt(fromB64(ciphertextB64));
}
