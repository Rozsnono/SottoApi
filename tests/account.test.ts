import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { randomBytes } from "@noble/hashes/utils.js";
import { anyCtx, authH, befriend, buildMessage, b64, clearDb, json, jsonReq, makeUser, send, startDb, stopDb, type TestUser } from "./helpers";
import { DELETE as deleteAccount } from "@/app/api/account/route";
import { POST as restoreAccount } from "@/app/api/account/restore/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { GET as convRoute } from "@/app/api/conversations/route";
import { GET as searchRoute } from "@/app/api/users/search/route";
import { POST as cronPurge } from "@/app/api/cron/purge/route";
import { runPurge } from "@/lib/purge";
import { setMediaAdapterOverride } from "@/lib/media/settings";
import type { MediaStorageAdapter } from "@/lib/media/adapter";
import { Conversation, Device, MediaUpload, Message, User } from "@/models";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  setMediaAdapterOverride(null);
});

const delAcct = (u: TestUser, password = u.password) => deleteAccount(jsonReq("/api/account", "DELETE", { password }, authH(u)), anyCtx());
const restore = (u: TestUser, over: Record<string, unknown> = {}) =>
  restoreAccount(jsonReq("/api/account/restore", "POST", { username: u.username, password: u.password, recoveryVerifier: u.keys.recoveryVerifier, ...over }, { "x-forwarded-for": "10.9.9.9" }), anyCtx());

describe("fiók törlése (soft delete)", () => {
  it("hibás jelszóval nem törölhető; törlés után a munkamenetek és eszközök visszavonva, a felhasználó eltűnik", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    expect((await delAcct(a, "rossz-jelszo-123")).status).toBe(401);
    expect((await delAcct(a)).status).toBe(200);
    expect((await User.findById(a.userId))!.status).toBe("deleted_pending");
    expect((await Device.findOne({ deviceId: a.deviceId }))!.revokedAt).toBeTruthy();
    expect((await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: a.refreshToken }), anyCtx())).status).toBe(401);
    // Más felhasználó nem találja; a beszélgetésben „elérhetetlen”, küldeni nem lehet.
    const s = await json(await searchRoute(jsonReq("/api/users/search?q=ann", "GET", undefined, authH(b)), anyCtx()));
    expect(s.body.data.items).toEqual([]);
    const cl = await json(await convRoute(jsonReq("/api/conversations", "GET", undefined, authH(b)), anyCtx()));
    expect(cl.body.data.items[0].available).toBe(false);
    expect((await send(b, await buildMessage(b, conv))).body.error?.code).toBe("CONVERSATION_ARCHIVED");
  });

  it("visszaállítás: jelszó + Recovery Code kell, 30 napon belül; utána új eszközzel lehet belépni", async () => {
    const a = await makeUser("anna");
    await delAcct(a);
    expect((await restore(a, { recoveryVerifier: b64(randomBytes(32)) })).status).toBe(401);
    expect((await restore(a, { password: "rossz-jelszo-123" })).status).toBe(401);
    expect((await restore(a)).status).toBe(200);
    expect((await User.findById(a.userId))!.status).toBe("active");
    const newDev = { deviceId: randomUUID(), deviceName: "Új telefon", devicePublicKey: b64(randomBytes(32)) };
    const l = await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: a.password, device: newDev }), anyCtx());
    expect(l.status).toBe(200);
    // A régi (visszavont) eszközzel nem.
    const old = await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: a.password, device: { deviceId: a.deviceId, deviceName: "x", devicePublicKey: a.keys.devicePublicKey } }), anyCtx());
    expect(old.status).toBe(403);
  });

  it("a 30 napos ablak után nem állítható vissza", async () => {
    const a = await makeUser("anna");
    await delAcct(a);
    await User.updateOne({ _id: a.userId }, { deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    expect((await restore(a)).status).toBe(401);
  });
});

describe("végleges törlés (purge)", () => {
  function adapter(failOnce = false) {
    const deleted: string[] = [];
    let failed = !failOnce;
    const a: MediaStorageAdapter = {
      info: async () => ({ exists: true, sizeBytes: 10 }),
      delete: async (r) => {
        if (!failed) { failed = true; throw new Error("hálózati hiba"); }
        deleted.push(r);
      },
      health: async () => ({ ok: true, detail: "" }),
    };
    setMediaAdapterOverride(a);
    return deleted;
  }

  it("30 nap után töröl mindent a felhasználóról; a másik fél üzenetei megmaradnak, a beszélgetés archivált; idempotens", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    const deleted = adapter();
    await send(a, await buildMessage(a, conv, { type: "image", mediaRef: "d".repeat(32) }));
    await send(a, await buildMessage(a, conv, { text: "anna szöveg" }));
    await send(b, await buildMessage(b, conv, { text: "bence szöveg" }));
    await delAcct(a);
    // Még nincs lejárt a 30 nap → nem törlődik.
    expect((await runPurge()).purged).toBe(0);
    await User.updateOne({ _id: a.userId }, { deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    const stats = await runPurge();
    expect(stats.purged).toBe(1);
    expect(deleted).toEqual(["d".repeat(32)]);
    const u = await User.findById(a.userId).lean();
    expect(u!.status).toBe("purged");
    expect(u!.username).toBe(`deleted-${a.userId}`);
    expect(u!.passwordHash).toBe("");
    expect(u!.encryptedKeyBackup).toBe("");
    expect(await Message.countDocuments({ senderId: a.userId })).toBe(0);
    expect(await Message.countDocuments({ senderId: b.userId })).toBe(1);
    expect((await Conversation.findById(conv))!.archived).toBe(true);
    expect(await Device.countDocuments({ userId: a.userId })).toBe(0);
    // Második futás: nincs teendő.
    expect((await runPurge()).purged).toBe(0);
  });

  it("részleges hiba esetén a fiók nem lesz 'purged', a következő futás befejezi (folytatható)", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    adapter(true); // az első törlés hibázik
    await send(a, await buildMessage(a, conv, { type: "image", mediaRef: "e".repeat(32) }));
    await delAcct(a);
    await User.updateOne({ _id: a.userId }, { deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    const r1 = await runPurge();
    expect(r1).toMatchObject({ purged: 0, failed: 1 });
    expect((await User.findById(a.userId))!.status).toBe("deleted_pending");
    const r2 = await runPurge();
    expect(r2.purged).toBe(1);
    expect((await User.findById(a.userId))!.status).toBe("purged");
  });

  it("ha mindkét fél megszűnt, a beszélgetés és az üzenetei is törlődnek", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    await send(a, await buildMessage(a, conv));
    await delAcct(a);
    await delAcct(b);
    await User.updateMany({}, { deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    expect((await runPurge()).purged).toBe(2);
    expect(await Conversation.countDocuments()).toBe(0);
    expect(await Message.countDocuments()).toBe(0);
  });

  it("a hivatkozatlan, 24 óránál régebbi média takarítódik", async () => {
    const deleted = adapter();
    const u = await makeUser("anna");
    await MediaUpload.create({ ref: "f".repeat(32), ownerId: u.userId, referenced: false });
    await MediaUpload.create({ ref: "9".repeat(32), ownerId: u.userId, referenced: false });
    // A createdAt a Mongoose-ban immutable, ezért nyers frissítés kell az „öreg” rekord előállításához.
    await MediaUpload.collection.updateOne({ ref: "f".repeat(32) }, { $set: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    const s = await runPurge();
    expect(s.mediaGc).toBe(1);
    expect(deleted).toEqual(["f".repeat(32)]);
    expect(await MediaUpload.countDocuments()).toBe(1);
  });

  it("a cron végpont titkot kér", async () => {
    expect((await cronPurge(jsonReq("/api/cron/purge", "POST", {}), anyCtx())).status).toBe(401);
    expect((await cronPurge(jsonReq("/api/cron/purge", "POST", {}, { "x-cron-secret": "rossz" }), anyCtx())).status).toBe(401);
    const ok = await cronPurge(jsonReq("/api/cron/purge", "POST", {}, { "x-cron-secret": process.env.CRON_SECRET! }), anyCtx());
    expect(ok.status).toBe(200);
  });
});
