import { describe, expect, it } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { decryptSetting, encryptSetting, openSealed, safeEqual, sealForPublicKey, totpAt, verifyTotp } from "@/lib/crypto/server";

describe("sealed box (eszköz publikus kulcsára zárás)", () => {
  it("a címzett privát kulcsa visszafejti", () => {
    const priv = randomBytes(32);
    const pub = Buffer.from(x25519.getPublicKey(priv)).toString("base64");
    const secret = new TextEncoder().encode("titkos-api-kulcs");
    const env = sealForPublicKey(pub, secret);
    expect(Buffer.from(openSealed(priv, env)).toString()).toBe("titkos-api-kulcs");
  });
  it("idegen privát kulccsal nem nyitható", () => {
    const pub = Buffer.from(x25519.getPublicKey(randomBytes(32))).toString("base64");
    const env = sealForPublicKey(pub, new TextEncoder().encode("x"));
    expect(() => openSealed(randomBytes(32), env)).toThrow();
  });
  it("elutasítja a hibás hosszú publikus kulcsot", () => {
    expect(() => sealForPublicKey(Buffer.alloc(5).toString("base64"), new Uint8Array([1]))).toThrow();
  });
});

describe("beállítás-titkosítás", () => {
  it("oda-vissza működik, az AAD hozzákötött", () => {
    const { valueEncrypted, nonce } = encryptSetting("érték", "media");
    expect(decryptSetting(valueEncrypted, nonce, "media")).toBe("érték");
    expect(() => decryptSetting(valueEncrypted, nonce, "mas")).toThrow();
  });
});

describe("TOTP (RFC 6238)", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // ASCII "12345678901234567890"
  it("a RFC 6238 vektora (t=59 → ...287082)", () => {
    expect(totpAt(secret, 59_000)).toBe("287082");
  });
  it("±1 lépés tűrés, rossz kód elutasítva", () => {
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "287082", 59_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, "287082", 59_000 + 120_000)).toBe(false);
    expect(verifyTotp(secret, "abcdef", 59_000)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("egyenlő és nem egyenlő, eltérő hossznál is", () => {
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "b")).toBe(false);
    expect(safeEqual("a", "aa")).toBe(false);
  });
});
