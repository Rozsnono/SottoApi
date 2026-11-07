import { MongoMemoryServer } from "mongodb-memory-server";
import { x25519, ed25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { randomUUID } from "node:crypto";
import { connectDb, disconnectDb } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { setRateLimiter, InMemoryRateLimiter } from "@/lib/ratelimit";
import mongoose from "mongoose";

let mongod: MongoMemoryServer | null = null;

/** Memóriabeli MongoDB (Docker nélkül) a teszthez. */
export async function startDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  process.env.DATABASE_URL = mongod.getUri("sotto_test");
  resetEnvCache();
  await disconnectDb();
  await connectDb();
  setRateLimiter(new InMemoryRateLimiter());
}
export async function stopDb(): Promise<void> {
  await disconnectDb();
  await mongod?.stop();
}
export async function clearDb(): Promise<void> {
  const cols = await mongoose.connection.db!.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
  setRateLimiter(new InMemoryRateLimiter());
}

export const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

export function makeClientKeys() {
  const idPriv = randomBytes(32);
  const sigPriv = randomBytes(32);
  const devPriv = randomBytes(32);
  return {
    idPriv,
    sigPriv,
    devPriv,
    identityPublicKey: b64(x25519.getPublicKey(idPriv)),
    identitySigningPublicKey: b64(ed25519.getPublicKey(sigPriv)),
    devicePublicKey: b64(x25519.getPublicKey(devPriv)),
    recoveryVerifier: b64(randomBytes(32)),
  };
}

export function registerBody(username: string, keys = makeClientKeys(), deviceId = randomUUID()) {
  return {
    username,
    password: "correct-horse-battery",
    identityPublicKey: keys.identityPublicKey,
    identitySigningPublicKey: keys.identitySigningPublicKey,
    recoveryVerifier: keys.recoveryVerifier,
    backup: { encryptedKeyBackup: b64(randomBytes(80)), backupNonce: b64(randomBytes(24)), kdfParams: { kdf: "hkdf-sha256-v1" } },
    device: { deviceId, deviceName: "Teszt telefon", devicePublicKey: keys.devicePublicKey },
  };
}

export function jsonReq(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", host: "localhost", "x-forwarded-for": "10.0.0.1", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function json(res: Response): Promise<{ status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string } } }> { // eslint-disable-line @typescript-eslint/no-explicit-any -- teszt segéd
  return { status: res.status, body: await res.json() };
}


// ---- Magasabb szintű segédek a társas/üzenet tesztekhez ----
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { messageSignatureInput, sealForPublicKey, toB64, utf8, type WrappedKeyEntry } from "@/protocol/wrap";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { POST as requestRoute } from "@/app/api/friends/requests/route";
import { POST as actionRoute } from "@/app/api/friends/requests/[id]/[action]/route";
import { GET as devicesRoute } from "@/app/api/conversations/[id]/devices/route";
import { POST as sendRoute } from "@/app/api/messages/route";
import { GET as syncRoute } from "@/app/api/messages/sync/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- teszt: route ctx
export const anyCtx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) }) as any;

export interface TestUser {
  username: string;
  userId: string;
  token: string;
  refreshToken: string;
  deviceId: string;
  keys: ReturnType<typeof makeClientKeys>;
  password: string;
}

export const authH = (u: TestUser) => ({ authorization: `Bearer ${u.token}` });

export async function makeUser(username: string): Promise<TestUser> {
  const keys = makeClientKeys();
  const body = registerBody(username, keys);
  const r = await json(await registerRoute(jsonReq("/api/auth/register", "POST", body, { "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }), anyCtx()));
  if (r.status !== 201) throw new Error("regisztráció sikertelen: " + JSON.stringify(r.body));
  return { username, userId: r.body.data.user.id, token: r.body.data.tokens.accessToken, refreshToken: r.body.data.tokens.refreshToken, deviceId: body.device.deviceId, keys, password: body.password };
}

/** Barátság létrehozása (kérés + elfogadás); visszaadja a beszélgetés azonosítóját. */
export async function befriend(a: TestUser, b: TestUser): Promise<string> {
  await requestRoute(jsonReq("/api/friends/requests", "POST", { username: b.username }, authH(a)), anyCtx());
  const { Friendship } = await import("@/models");
  const f = await Friendship.findOne({ status: "pending" });
  const res = await json(await actionRoute(jsonReq(`/api/friends/requests/${f!._id}/accept`, "POST", {}, authH(b)), anyCtx({ id: String(f!._id), action: "accept" })));
  return res.body.data.conversationId as string;
}

/** Valódi (aláírt, borítékolt) üzenettörzs építése a beszélgetés aktuális eszközlistájára. */
export async function buildMessage(sender: TestUser, conversationId: string, opts: { type?: "text" | "image" | "video" | "audio" | "event"; mediaRef?: string | null; text?: string; clientMessageId?: string } = {}) {
  const dev = await json(await devicesRoute(jsonReq(`/api/conversations/${conversationId}/devices`, "GET", undefined, authH(sender)), anyCtx({ id: conversationId })));
  const contentKey = randomBytes(32);
  const nonce = randomBytes(24);
  const ciphertext = toB64(xchacha20poly1305(contentKey, nonce).encrypt(utf8(JSON.stringify({ text: opts.text ?? "szia" }))));
  const wrappedKeys: WrappedKeyEntry[] = [
    ...dev.body.data.devices.map((d: { deviceId: string; devicePublicKey: string }) => ({ deviceId: d.deviceId, ...sealForPublicKey(d.devicePublicKey, contentKey) })),
    ...dev.body.data.identities.map((i: { userId: string; identityPublicKey: string }) => ({ deviceId: `identity:${i.userId}`, ...sealForPublicKey(i.identityPublicKey, contentKey) })),
  ];
  const clientMessageId = opts.clientMessageId ?? randomUUID();
  const type = opts.type ?? "text";
  const signature = toB64(ed25519.sign(messageSignatureInput({ conversationId, clientMessageId, type, nonce: toB64(nonce), ciphertext, wrappedKeys }), sender.keys.sigPriv));
  return { conversationId, type, ciphertext, nonce: toB64(nonce), signature, wrappedKeys, mediaRef: opts.mediaRef ?? null, clientMessageId, contentKey };
}

export async function send(sender: TestUser, body: Record<string, unknown>) {
  const { contentKey: _ck, ...payload } = body as Record<string, unknown> & { contentKey?: unknown }; // eslint-disable-line @typescript-eslint/no-unused-vars -- a kulcs nem megy a hálóra
  return json(await sendRoute(jsonReq("/api/messages", "POST", payload, authH(sender)), anyCtx()));
}

export async function sync(u: TestUser, cursor = "0") {
  return json(await syncRoute(jsonReq(`/api/messages/sync?cursor=${cursor}`, "GET", undefined, authH(u)), anyCtx()));
}

/** Új aláírás a megadott (módosított) borítéklistára – a lista módosítása az aláírást érvénytelenné teszi, ezért újra kell írni. */
export function resign(sender: TestUser, m: Awaited<ReturnType<typeof buildMessage>>, wrappedKeys: WrappedKeyEntry[]) {
  const signature = toB64(ed25519.sign(messageSignatureInput({ conversationId: m.conversationId, clientMessageId: m.clientMessageId, type: m.type, nonce: m.nonce, ciphertext: m.ciphertext, wrappedKeys }), sender.keys.sigPriv));
  return { ...m, wrappedKeys, signature };
}
