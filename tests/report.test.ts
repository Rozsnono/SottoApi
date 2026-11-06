import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { Types } from "mongoose";
import { clearDb, jsonReq, json, startDb, stopDb } from "./helpers";
import { messageSignatureInput, sealForPublicKey, toB64, utf8, type WrappedKeyEntry } from "@/protocol/wrap";
import { decryptReported, type ReportedContent } from "@/lib/admin/decrypt";
import { AuditLog, Message, Report, User } from "@/models";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { GET as getContent } from "@/app/api/admin/reports/[id]/content/route";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- teszt: route ctx
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

function buildReported(text: string) {
  const modPriv = randomBytes(32);
  const modPub = toB64(x25519.getPublicKey(modPriv));
  const sigPriv = randomBytes(32);
  const contentKey = randomBytes(32);
  const nonce = randomBytes(24);
  const ciphertext = toB64(xchacha20poly1305(contentKey, nonce).encrypt(utf8(JSON.stringify({ text }))));
  const wrappedKeys: WrappedKeyEntry[] = [{ deviceId: "d1", ...sealForPublicKey(toB64(x25519.getPublicKey(randomBytes(32))), randomBytes(32)) }];
  const base = { conversationId: "conv1", clientMessageId: "cmid1", type: "text", nonce: toB64(nonce), ciphertext, wrappedKeys };
  const signature = toB64(ed25519.sign(messageSignatureInput(base), sigPriv));
  const grant = { ...sealForPublicKey(modPub, contentKey), expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  const content: ReportedContent = {
    message: { type: "text", ciphertext, nonce: base.nonce, signature, conversationId: "conv1", clientMessageId: "cmid1", wrappedKeysHashInput: wrappedKeys },
    senderSigningPublicKey: toB64(ed25519.getPublicKey(sigPriv)),
    grant,
  };
  return { content, modPriv, sigPriv, modPub };
}

describe("jelentett üzenet visszafejtése (böngésző oldali segéd)", () => {
  it("a moderációs privát kulccsal visszafejti és ellenőrzi az aláírást", () => {
    const { content, modPriv } = buildReported("titkos üzenet");
    const r = decryptReported(content, toB64(modPriv));
    expect(r.text).toBe("titkos üzenet");
    expect(r.signatureValid).toBe(true);
  });
  it("módosított ciphertext/aláírás esetén az aláírás érvénytelen vagy a visszafejtés hibázik", () => {
    const { content, modPriv } = buildReported("x");
    const forged = { ...content, message: { ...content.message, clientMessageId: "masik" } };
    expect(decryptReported(forged, toB64(modPriv)).signatureValid).toBe(false);
  });
  it("idegen kulccsal nem fejthető vissza", () => {
    const { content } = buildReported("x");
    expect(() => decryptReported(content, toB64(randomBytes(32)))).toThrow();
  });
});

describe("jelentés tartalom végpont (grant)", () => {
  async function adminCookie() {
    const res = await adminLogin(jsonReq("/api/admin/login", "POST", { password: process.env.ADMIN_PASSWORD }, { origin: "http://localhost" }), ctx(""));
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }
  async function seed(grant?: { expiresAt: Date }) {
    const { content } = buildReported("tartalom");
    const u = new Types.ObjectId();
    await User.create({ _id: u, username: "kuldo", usernameNormalized: "kuldo", passwordHash: "x", identityPublicKey: "a", identitySigningPublicKey: content.senderSigningPublicKey!, encryptedKeyBackup: "a", backupNonce: "a", kdfParams: { kdf: "hkdf-sha256-v1" }, recoveryVerifierHash: "a" });
    const msg = await Message.create({ conversationId: new Types.ObjectId(), senderId: u, seq: 1, type: "text", ciphertext: content.message.ciphertext, nonce: content.message.nonce, signature: content.message.signature, wrappedKeys: content.message.wrappedKeysHashInput, clientMessageId: "cmid1" });
    const rep = await Report.create({ reporterId: new Types.ObjectId(), targetMessageId: msg._id, targetUserId: u, reason: "teszt", ...(grant ? { moderationGrant: { ...content.grant, expiresAt: grant.expiresAt } } : {}) });
    return String(rep._id);
  }

  it("érvényes grantnél kiadja a titkosított tartalmat és auditál", async () => {
    const cookie = await adminCookie();
    const id = await seed({ expiresAt: new Date(Date.now() + 3600_000) });
    const res = await json(await getContent(jsonReq(`/api/admin/reports/${id}/content`, "GET", undefined, { cookie }), ctx(id)));
    expect(res.status).toBe(200);
    expect(res.body.data.grant.wrappedKey).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain("tartalom"); // nyílt szöveg nincs
    expect(await AuditLog.countDocuments({ action: "admin.report_content_view" })).toBe(1);
  });
  it("lejárt grantnél 410 GRANT_EXPIRED, és auditál", async () => {
    const cookie = await adminCookie();
    const id = await seed({ expiresAt: new Date(Date.now() - 1000) });
    const res = await json(await getContent(jsonReq(`/api/admin/reports/${id}/content`, "GET", undefined, { cookie }), ctx(id)));
    expect(res.status).toBe(410);
    expect(res.body.error?.code).toBe("GRANT_EXPIRED");
    expect(await AuditLog.countDocuments({ action: "admin.report_content_denied_expired" })).toBe(1);
  });
  it("grant nélkül 404, süti nélkül 401", async () => {
    const cookie = await adminCookie();
    const id = await seed();
    expect((await getContent(jsonReq(`/api/admin/reports/${id}/content`, "GET", undefined, { cookie }), ctx(id))).status).toBe(404);
    expect((await getContent(jsonReq(`/api/admin/reports/${id}/content`, "GET"), ctx(id))).status).toBe(401);
  });
});
