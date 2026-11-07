import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "@noble/hashes/utils.js";
import { randomUUID } from "node:crypto";
import { anyCtx, authH, befriend, buildMessage, clearDb, json, jsonReq, makeUser, resign, send, startDb, stopDb, sync, b64 } from "./helpers";
import { POST as readRoute } from "@/app/api/messages/[id]/read/route";
import { DELETE as deleteRoute } from "@/app/api/messages/[id]/route";
import { POST as blockRoute } from "@/app/api/blocks/route";
import { DELETE as unfriendRoute } from "@/app/api/friends/[userId]/route";
import { DELETE as revokeDevice } from "@/app/api/devices/[deviceId]/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as reportRoute } from "@/app/api/reports/route";
import { PUT as pushRoute } from "@/app/api/devices/push/route";
import { PUT as muteRoute } from "@/app/api/conversations/[id]/prefs/route";
import { setMediaAdapterOverride } from "@/lib/media/settings";
import { notifyNewMessage, setPushFetch } from "@/lib/push";
import { setFcmFetch } from "@/lib/fcm";
import { generateKeyPairSync } from "node:crypto";
import { Device, Message, MessageReceipt, Report } from "@/models";
import type { MediaStorageAdapter } from "@/lib/media/adapter";
import { ed25519 } from "@noble/curves/ed25519.js";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  setMediaAdapterOverride(null);
  setPushFetch(null);
});

async function pair() {
  const a = await makeUser("anna");
  const b = await makeUser("bence");
  const conv = await befriend(a, b);
  return { a, b, conv };
}

const del = (u: Awaited<ReturnType<typeof makeUser>>, id: string) => deleteRoute(jsonReq(`/api/messages/${id}`, "DELETE", undefined, authH(u)), anyCtx({ id }));
const read = (u: Awaited<ReturnType<typeof makeUser>>, id: string) => readRoute(jsonReq(`/api/messages/${id}/read`, "POST", {}, authH(u)), anyCtx({ id }));

describe("üzenetküldés és szinkron", () => {
  it("elküldi, a címzett szinkronnal megkapja, az olvasás visszajut a küldőhöz, a törlés mindkét félhez", async () => {
    const { a, b, conv } = await pair();
    const sent = await send(a, await buildMessage(a, conv));
    expect(sent.status).toBe(201);
    const id = sent.body.data.id as string;

    const sb = await sync(b);
    expect(sb.body.data.messages).toHaveLength(1);
    expect(sb.body.data.messages[0].ciphertext).toBeTruthy();
    expect(sb.body.data.messages[0].wrappedKeys.length).toBe(4); // 2 eszköz + 2 identitás

    expect((await read(b, id)).status).toBe(200);
    expect((await read(b, id)).status).toBe(200); // idempotens
    const sa = await sync(a);
    expect(sa.body.data.receipts).toHaveLength(1);
    expect(await MessageReceipt.countDocuments()).toBe(1);

    // A küldő törli → tombstone, a címzett törlés-eseményt kap, tartalom nélkül.
    expect((await del(a, id)).status).toBe(200);
    const stored = await Message.findById(id).lean();
    expect(stored!.ciphertext).toBeUndefined();
    expect(stored!.wrappedKeys).toBeUndefined();
    const sb2 = await sync(b, sb.body.data.cursor);
    expect(sb2.body.data.deletions.map((d: { messageId: string }) => d.messageId)).toEqual([id]);
    // A törlés nyer: olvasás törölt üzenetre elutasítva.
    expect((await read(b, id)).status).toBe(404);
    // Friss eszköz kezdeti szinkronja már nem tartalmazza a törölt üzenetet.
    expect((await sync(b, "0")).body.data.messages).toHaveLength(0);
  });

  it("csak a feladó törölhet; a küldő nem olvashatja vissza a sajátját", async () => {
    const { a, b, conv } = await pair();
    const id = (await send(a, await buildMessage(a, conv))).body.data.id as string;
    expect((await del(b, id)).status).toBe(403);
    expect((await read(a, id)).status).toBe(403);
  });

  it("idempotens a clientMessageId-re", async () => {
    const { a, conv } = await pair();
    const m = await buildMessage(a, conv);
    const r1 = await send(a, m);
    const r2 = await send(a, m);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r2.body.data.duplicate).toBe(true);
    expect(r2.body.data.id).toBe(r1.body.data.id);
    expect(await Message.countDocuments()).toBe(1);
  });

  it("hibás aláírást elutasít; módosított tartalom nem megy át", async () => {
    const { a, conv } = await pair();
    const m = await buildMessage(a, conv);
    const bad = await send(a, { ...m, signature: b64(randomBytes(64)) });
    expect(bad.status).toBe(400);
    const tampered = await send(a, { ...m, nonce: b64(randomBytes(24)) });
    expect(tampered.status).toBe(400);
    expect(await Message.countDocuments()).toBe(0);
  });

  it("hiányos vagy elavult borítéklistára 409 DEVICE_LIST_CHANGED; visszavont eszköz kikerül az elvárt listából", async () => {
    const { a, b, conv } = await pair();
    const m = await buildMessage(a, conv);
    // A borítéklista utólagos módosítása érvényteleníti az aláírást (a lista aláírt)...
    expect((await send(a, { ...m, wrappedKeys: m.wrappedKeys.slice(1) })).body.error?.code).toBe("VALIDATION_ERROR");
    // ...újra aláírt, de hiányos lista viszont DEVICE_LIST_CHANGED.
    const missing = await send(a, resign(a, m, m.wrappedKeys.slice(1)));
    expect(missing.body.error?.code).toBe("DEVICE_LIST_CHANGED");

    // Új eszköz a címzettnél → a régi lista elavul.
    const extra = { deviceId: randomUUID(), deviceName: "Tablet", devicePublicKey: b64(randomBytes(32)) };
    await login(jsonReq("/api/auth/login", "POST", { username: "bence", password: b.password, device: extra }), anyCtx());
    const stale = await send(a, m);
    expect(stale.body.error?.code).toBe("DEVICE_LIST_CHANGED");
    const fresh = await send(a, await buildMessage(a, conv));
    expect(fresh.status).toBe(201);

    // Az új eszköz visszavonása után ismét a kisebb lista az érvényes.
    await revokeDevice(jsonReq(`/api/devices/${extra.deviceId}`, "DELETE", undefined, authH(b)), anyCtx({ deviceId: extra.deviceId }));
    const again = await send(a, await buildMessage(a, conv));
    expect(again.status).toBe(201);
    expect((await Device.findOne({ deviceId: extra.deviceId }))!.revokedAt).toBeTruthy();
  });

  it("tiltott/archivált beszélgetésbe nem küldhető (BLOCKED / CONVERSATION_ARCHIVED), a tiltó kiléte nem derül ki", async () => {
    const { a, b, conv } = await pair();
    const m = await buildMessage(a, conv);
    await unfriendRoute(jsonReq(`/api/friends/${b.userId}`, "DELETE", undefined, authH(a)), anyCtx({ userId: b.userId }));
    expect((await send(a, m)).body.error?.code).toBe("CONVERSATION_ARCHIVED");
    expect((await send(b, await buildMessage(b, conv))).body.error?.code).toBe("CONVERSATION_ARCHIVED");
    await blockRoute(jsonReq("/api/blocks", "POST", { userId: a.userId }, authH(b)), anyCtx());
    const fromA = await send(a, m);
    const fromB = await send(b, await buildMessage(b, conv));
    expect(fromA.body.error?.code).toBe("BLOCKED");
    expect(fromB.body.error?.code).toBe("BLOCKED");
    expect(fromA.body.error?.message).toBe(fromB.body.error?.message);
  });

  it("idegen beszélgetésbe nem küldhet (404)", async () => {
    const { conv } = await pair();
    const c = await makeUser("cili");
    const res = await send(c, { conversationId: conv, type: "text", ciphertext: b64(randomBytes(30)), nonce: b64(randomBytes(24)), signature: b64(randomBytes(64)), wrappedKeys: [], mediaRef: null, clientMessageId: randomUUID() });
    expect([400, 404]).toContain(res.status);
  });

  it("sebességkorlát: 5 üzenet / 5 mp után 429", async () => {
    const { a, conv } = await pair();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await send(a, await buildMessage(a, conv, { text: `m${i}` }))).status);
    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("szinkron oldalazás: 105 elem két oldalon, monoton kurzorral, veszteség nélkül", async () => {
    const { a, b, conv } = await pair();
    const { Counter } = await import("@/models");
    const { Types } = await import("mongoose");
    const docs = Array.from({ length: 105 }, (_, i) => ({ conversationId: new Types.ObjectId(conv), senderId: new Types.ObjectId(a.userId), seq: i + 1, type: "text" as const, ciphertext: "x", nonce: "x", signature: "x", wrappedKeys: [], clientMessageId: randomUUID() }));
    await Message.insertMany(docs);
    await Counter.updateOne({ _id: "sync" }, { value: 105 }, { upsert: true });
    const p1 = await sync(b, "0");
    expect(p1.body.data.messages).toHaveLength(100);
    expect(p1.body.data.hasMore).toBe(true);
    const p2 = await sync(b, p1.body.data.cursor);
    expect(p2.body.data.messages).toHaveLength(5);
    expect(p2.body.data.hasMore).toBe(false);
    expect(Number(p2.body.data.cursor)).toBe(105);
    const ids = new Set([...p1.body.data.messages, ...p2.body.data.messages].map((m: { id: string }) => m.id));
    expect(ids.size).toBe(105);
  });
});

describe("média", () => {
  const mk = (info: { exists: boolean; sizeBytes?: number }) => {
    const deleted: string[] = [];
    const adapter: MediaStorageAdapter = { info: async () => info, delete: async (r) => void deleted.push(r), health: async () => ({ ok: true, detail: "" }) };
    setMediaAdapterOverride(adapter);
    return deleted;
  };
  const ref = "a".repeat(32);

  it("hangüzenet (audio): médiával elfogadva, média nélkül elutasítva", async () => {
    const { a, conv } = await pair();
    mk({ exists: true, sizeBytes: 500_000 });
    expect((await send(a, await buildMessage(a, conv, { type: "audio" as never, mediaRef: ref }))).status).toBe(201);
    expect((await send(a, await buildMessage(a, conv, { type: "audio" as never }))).status).toBe(400);
  });

  it("képüzenet: létező média elfogadva, törléskor a médiafájl is törlődik", async () => {
    const { a, conv } = await pair();
    const deleted = mk({ exists: true, sizeBytes: 1_000_000 });
    const sent = await send(a, await buildMessage(a, conv, { type: "image", mediaRef: ref }));
    expect(sent.status).toBe(201);
    expect((await del(a, sent.body.data.id)).status).toBe(200);
    expect(deleted).toEqual([ref]);
  });
  it("túlméretes média 413 és törlődik; hiányzó média 400; ugyanaz a média nem használható újra", async () => {
    const { a, conv } = await pair();
    let deleted = mk({ exists: true, sizeBytes: 16 * 1024 * 1024 });
    expect((await send(a, await buildMessage(a, conv, { type: "image", mediaRef: ref }))).status).toBe(413);
    expect(deleted).toEqual([ref]);
    mk({ exists: false });
    expect((await send(a, await buildMessage(a, conv, { type: "image", mediaRef: ref }))).status).toBe(400);
    deleted = mk({ exists: true, sizeBytes: 1000 });
    const ok1 = await send(a, await buildMessage(a, conv, { type: "image", mediaRef: "b".repeat(32) }));
    expect(ok1.status).toBe(201);
    expect((await send(a, await buildMessage(a, conv, { type: "image", mediaRef: "b".repeat(32) }))).body.error?.code).toBe("CONFLICT");
    expect(deleted).toEqual([]);
  });
  it("videó 100 MB felett 413; 100 MB alatt rendben", async () => {
    const { a, conv } = await pair();
    mk({ exists: true, sizeBytes: 101 * 1024 * 1024 });
    expect((await send(a, await buildMessage(a, conv, { type: "video", mediaRef: ref }))).status).toBe(413);
    mk({ exists: true, sizeBytes: 90 * 1024 * 1024 });
    expect((await send(a, await buildMessage(a, conv, { type: "video", mediaRef: "c".repeat(32) }))).status).toBe(201);
  });
  it("szöveges üzenet média nélkül; médiaüzenet mediaRef nélkül elutasítva", async () => {
    const { a, conv } = await pair();
    expect((await send(a, await buildMessage(a, conv, { type: "image", mediaRef: null }))).status).toBe(400);
    expect((await send(a, await buildMessage(a, conv, { type: "text", mediaRef: ref }))).status).toBe(400);
  });
});

describe("jelentés", () => {
  const grant = () => ({ wrappedKey: b64(randomBytes(48)), ephemeralPublicKey: b64(randomBytes(32)), wrapNonce: b64(randomBytes(24)) });
  const report = (u: Awaited<ReturnType<typeof makeUser>>, body: unknown) => reportRoute(jsonReq("/api/reports", "POST", body, authH(u)), anyCtx());

  it("a jelentő grantet mellékelhet (24 óra); duplikált jelentés idempotens; a nyitott jelentés alatt álló üzenet nem törölhető", async () => {
    const { a, b, conv } = await pair();
    const id = (await send(a, await buildMessage(a, conv))).body.data.id as string;
    const r1 = await json(await report(b, { messageId: id, reason: "harassment", grant: grant() }));
    expect(r1.status).toBe(201);
    expect(r1.body.data.grantAccepted).toBe(true);
    const rep = await Report.findById(r1.body.data.id).lean();
    const ttl = rep!.moderationGrant!.expiresAt!.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23.9 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
    const r2 = await json(await report(b, { messageId: id, reason: "harassment" }));
    expect(r2.body.data.duplicate).toBe(true);
    expect(await Report.countDocuments()).toBe(1);
    expect((await del(a, id)).status).toBe(409);
    await Report.updateOne({}, { status: "dismissed" });
    expect((await del(a, id)).status).toBe(200);
  });
  it("saját üzenet nem jelenthető; idegen nem jelenthet", async () => {
    const { a, conv } = await pair();
    const c = await makeUser("cili");
    const id = (await send(a, await buildMessage(a, conv))).body.data.id as string;
    expect((await report(a, { messageId: id, reason: "spam" })).status).toBe(403);
    expect((await report(c, { messageId: id, reason: "spam" })).status).toBe(404);
  });
});

describe("push értesítés", () => {
  const token = "ExponentPushToken[abc123_XYZ]";
  function mockExpo(status = "ok", error?: string) {
    const calls: { body: unknown }[] = [];
    setPushFetch((async (_u: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init!.body!);
      calls.push({ body });
      return new Response(JSON.stringify({ data: body.map(() => (status === "ok" ? { status: "ok" } : { status: "error", details: { error } })) }), { status: 200 });
    }) as unknown as typeof fetch);
    return calls;
  }

  it("`event` üzenet (reakció/téma): elfogadva, média nélkül, push NEM megy ki; médiával elutasítva", async () => {
    const { a, b, conv } = await pair();
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token }, authH(b)), anyCtx());
    const calls = mockExpo();
    const ev = await buildMessage(a, conv, { type: "event" as never, text: "reakció" });
    expect((await send(a, ev)).status).toBe(201);
    const bad = await buildMessage(a, conv, { type: "event" as never, mediaRef: "a".repeat(32) });
    expect((await send(a, bad)).status).toBe(400);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.length).toBe(0);
    expect((await sync(b)).body.data.messages.some((m: { type: string }) => m.type === "event")).toBe(true);
  });

  it("notificationDetail=hidden: a push címe „Sotto”, a feladó neve nem megy ki", async () => {
    const { b, conv } = await pair();
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token, notificationDetail: "hidden" }, authH(b)), anyCtx());
    const calls = mockExpo();
    await notifyNewMessage({ recipientId: b.userId, senderUsername: "anna", conversationId: conv });
    const sent = (calls[0].body as { title: string }[])[0];
    expect(sent.title).toBe("Sotto");
  });

  it("csak a feladó neve és általános szöveg megy ki, tartalom/ciphertext soha", async () => {
    const { a, b, conv } = await pair();
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token }, authH(b)), anyCtx());
    const calls = mockExpo();
    const m = await buildMessage(a, conv, { text: "TITKOS-SZOVEG" });
    expect((await send(a, m)).status).toBe(201);
    await vi.waitFor(() => expect(calls.length).toBe(1));
    const payload = JSON.stringify(calls[0].body);
    expect(payload).toContain("anna");
    expect(payload).toContain("New message");
    expect(payload).not.toContain("TITKOS-SZOVEG");
    expect(payload).not.toContain(m.ciphertext);
    expect(payload).toContain(conv);
  });
  it("némított chatre és kikapcsolt eszközre nem küld", async () => {
    const { a, b, conv } = await pair();
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token }, authH(b)), anyCtx());
    const calls = mockExpo();
    await muteRoute(jsonReq(`/api/conversations/${conv}/prefs`, "PUT", { mutedUntil: new Date(Date.now() + 3600_000).toISOString() }, authH(b)), anyCtx({ id: conv }));
    expect((await notifyNewMessage({ recipientId: b.userId, senderUsername: "anna", conversationId: conv })).sent).toBe(0);
    await muteRoute(jsonReq(`/api/conversations/${conv}/prefs`, "PUT", { mutedUntil: null }, authH(b)), anyCtx({ id: conv }));
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token, notificationsEnabled: false }, authH(b)), anyCtx());
    expect((await notifyNewMessage({ recipientId: b.userId, senderUsername: "anna", conversationId: conv })).sent).toBe(0);
    expect(calls.length).toBe(0);
    void a;
  });
  it("DeviceNotRegistered esetén a token törlődik", async () => {
    const { b, conv } = await pair();
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token }, authH(b)), anyCtx());
    mockExpo("error", "DeviceNotRegistered");
    await notifyNewMessage({ recipientId: b.userId, senderUsername: "anna", conversationId: conv });
    expect((await Device.findOne({ deviceId: b.deviceId }))!.pushToken).toBeUndefined();
  });
  it("érvénytelen token formátumot elutasít", async () => {
    const { b } = await pair();
    expect((await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: "nem-token" }, authH(b)), anyCtx())).status).toBe(400);
  });
});
void ed25519;

describe("push beállítás részleges módosítása", () => {
  it("token nélküli kérés (csak notificationDetail) nem törli a tokent; null törli", async () => {
    const { b } = await pair();
    const token = "ExponentPushToken[keep_1]";
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: token }, authH(b)), anyCtx());
    await pushRoute(jsonReq("/api/devices/push", "PUT", { notificationDetail: "hidden" }, authH(b)), anyCtx());
    let d = await Device.findOne({ userId: b.userId }).lean();
    expect([d?.pushToken, d?.notificationDetail]).toEqual([token, "hidden"]);
    await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: null }, authH(b)), anyCtx());
    d = await Device.findOne({ userId: b.userId }).lean();
    expect(d?.pushToken).toBeUndefined();
  });
});

describe("FCM (natív Firebase token)", () => {
  it("fcm tokenes eszköznek közvetlenül küld (OAuth JWT + v1 küldés), a név elrejthető; UNREGISTERED törli a tokent", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const acc = { client_email: "svc@proj.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), project_id: "proj" };
    process.env.FCM_SERVICE_ACCOUNT_B64 = Buffer.from(JSON.stringify(acc)).toString("base64");
    const calls: { url: string; body: string }[] = [];
    let result: "ok" | "gone" = "ok";
    setFcmFetch((async (u: string, init?: { body?: unknown }) => {
      calls.push({ url: String(u), body: String(init?.body) });
      if (String(u).includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      return result === "ok" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    }) as unknown as typeof fetch);
    try {
      const { b, conv } = await pair();
      const fcmToken = "f".repeat(40) + ":APA91bExample";
      expect((await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: fcmToken, pushProvider: "fcm", notificationDetail: "hidden" }, authH(b)), anyCtx())).status).toBe(200);
      expect((await notifyNewMessage({ recipientId: b.userId, senderUsername: "anna", conversationId: conv })).sent).toBe(1);
      const send = calls.find((c) => c.url.includes("fcm.googleapis.com/v1/projects/proj/messages:send"))!;
      const msg = JSON.parse(send.body).message;
      expect(msg.token).toBe(fcmToken);
      expect(msg.notification).toEqual({ title: "Sotto", body: "New message" });
      expect(msg.data.conversationId).toBe(conv);
      result = "gone";
      expect((await notifyNewMessage({ recipientId: b.userId, senderUsername: "anna", conversationId: conv })).sent).toBe(0);
      expect((await Device.findOne({ userId: b.userId }).lean())?.pushToken).toBeUndefined();
      // érvénytelen FCM token alakja elutasítva
      expect((await pushRoute(jsonReq("/api/devices/push", "PUT", { pushToken: "rövid token!", pushProvider: "fcm" }, authH(b)), anyCtx())).status).toBe(400);
    } finally {
      delete process.env.FCM_SERVICE_ACCOUNT_B64;
      setFcmFetch(null);
    }
  });
});
