import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { randomBytes } from "@noble/hashes/utils.js";
import { anyCtx, authH, b64, buildMessage, befriend, clearDb, json, jsonReq, makeUser, send, startDb, stopDb, type TestUser } from "./helpers";
import { GET as getSettings, PUT as putSettings } from "@/app/api/account/settings/route";
import { POST as changePassword } from "@/app/api/account/password/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { POST as adminDelete } from "@/app/api/admin/users/[id]/delete/route";
import { runPurge } from "@/lib/purge";
import { setMediaAdapterOverride } from "@/lib/media/settings";
import type { MediaStorageAdapter } from "@/lib/media/adapter";
import { AuditLog, MediaUpload, Message, ModerationLog, User } from "@/models";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  setMediaAdapterOverride(null);
});

const NEW_PW = "another-long-password-1";
const putS = (u: TestUser, body: unknown) => putSettings(jsonReq("/api/account/settings", "PUT", body, authH(u)), anyCtx());
const chPw = (u: TestUser, body: unknown) => changePassword(jsonReq("/api/account/password", "POST", body, authH(u)), anyCtx());
const doRefresh = (t: string) => refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: t }), anyCtx());

describe("fiókbeállítások", () => {
  it("GET az alapértékeket adja, PUT részlegesen módosít és auditál, üres törzs elutasítva", async () => {
    const a = await makeUser("anna");
    const g = await json(await getSettings(jsonReq("/api/account/settings", "GET", undefined, authH(a)), anyCtx()));
    expect(g.body.data).toEqual({ username: "anna", discoverability: "everyone", friendRequestPolicy: "everyone", showActivity: true });
    const p = await json(await putS(a, { discoverability: "hidden" }));
    expect(p.status).toBe(200);
    expect(p.body.data).toEqual({ username: "anna", discoverability: "hidden", friendRequestPolicy: "everyone", showActivity: true });
    await putS(a, { friendRequestPolicy: "friends_only" });
    const u = await User.findById(a.userId).lean();
    expect([u!.discoverability, u!.friendRequestPolicy]).toEqual(["hidden", "friends_only"]);
    expect(await AuditLog.countDocuments({ action: "account.settings_update" })).toBe(2);
    expect((await putS(a, {})).status).toBe(400);
    expect((await putS(a, { discoverability: "nobody" })).status).toBe(400);
  });

  it("hitelesítés nélkül 401", async () => {
    expect((await getSettings(jsonReq("/api/account/settings", "GET"), anyCtx())).status).toBe(401);
    expect((await putSettings(jsonReq("/api/account/settings", "PUT", { discoverability: "hidden" }), anyCtx())).status).toBe(401);
  });
});

describe("jelszócsere", () => {
  async function secondDevice(a: TestUser) {
    const device = { deviceId: randomUUID(), deviceName: "Tablet", devicePublicKey: b64(randomBytes(32)) };
    const r = await json(await login(jsonReq("/api/auth/login", "POST", { username: a.username, password: a.password, device }), anyCtx()));
    expect(r.status).toBe(200);
    return { refreshToken: r.body.data.tokens.refreshToken as string, device };
  }

  it("hibás jelenlegi jelszóval 401, azonos új jelszóval 400", async () => {
    const a = await makeUser("anna");
    expect((await chPw(a, { currentPassword: "rossz-jelszo-12345", newPassword: NEW_PW })).status).toBe(401);
    expect((await chPw(a, { currentPassword: a.password, newPassword: a.password })).status).toBe(400);
    expect((await chPw(a, { currentPassword: a.password, newPassword: "x" })).status).toBe(400);
  });

  it("sikeres csere: új jelszóval lehet belépni, a másik eszköz tokenje érvénytelen, az aktuálisé működik", async () => {
    const a = await makeUser("anna");
    const second = await secondDevice(a);
    expect((await chPw(a, { currentPassword: a.password, newPassword: NEW_PW })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: "account.password_change" })).toBe(1);
    expect((await doRefresh(second.refreshToken)).status).toBe(401);
    expect((await doRefresh(a.refreshToken)).status).toBe(200);
    const bad = await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: a.password, device: { deviceId: a.deviceId, deviceName: "x", devicePublicKey: a.keys.devicePublicKey } }), anyCtx());
    expect(bad.status).toBe(401);
    const good = await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: NEW_PW, device: { deviceId: a.deviceId, deviceName: "x", devicePublicKey: a.keys.devicePublicKey } }), anyCtx());
    expect(good.status).toBe(200);
  });

  it("sebességkorlát: 5 próbálkozás után 429", async () => {
    const a = await makeUser("anna");
    for (let i = 0; i < 5; i++) await chPw(a, { currentPassword: "rossz-jelszo-12345", newPassword: NEW_PW });
    expect((await chPw(a, { currentPassword: "rossz-jelszo-12345", newPassword: NEW_PW })).status).toBe(429);
  });
});

describe("admin: felhasználó végleges törlése", () => {
  async function cookie(): Promise<string> {
    const res = await adminLogin(jsonReq("/api/admin/login", "POST", { password: process.env.ADMIN_PASSWORD }, { origin: "http://localhost" }), anyCtx());
    return (res.headers.get("set-cookie") ?? "").split(";")[0];
  }
  const del = (c: string, id: string, body: unknown = { reason: "kérésre" }, extra: Record<string, string> = {}) =>
    adminDelete(jsonReq(`/api/admin/users/${id}/delete`, "POST", body, { cookie: c, origin: "http://localhost", ...extra }), anyCtx({ id }));

  it("aktív fiók azonnal purged: adatok, üzenetek, hivatkozatlan média eltűnik; napló készül", async () => {
    const removed: string[] = [];
    setMediaAdapterOverride({ delete: async (r: string) => void removed.push(r) } as unknown as MediaStorageAdapter);
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    const conv = await befriend(a, b);
    await send(a, await buildMessage(a, conv));
    await MediaUpload.create({ ref: "e".repeat(32), ownerId: a.userId, referenced: false });
    const c = await cookie();
    const r = await json(await del(c, a.userId));
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ status: "purged" });
    const u = await User.findById(a.userId).lean();
    expect(u!.status).toBe("purged");
    expect(u!.passwordHash).toBe("");
    expect(u!.username).toBe(`deleted-${a.userId}`);
    expect(await Message.countDocuments({ senderId: a.userId })).toBe(0);
    expect(await MediaUpload.countDocuments({ ownerId: a.userId })).toBe(0);
    expect(removed).toEqual(["e".repeat(32)]);
    expect((await doRefresh(a.refreshToken)).status).toBe(401);
    expect(await ModerationLog.countDocuments({ userId: a.userId, decision: "delete" })).toBe(1);
    expect(await AuditLog.countDocuments({ action: "admin.user_delete" })).toBe(1);
  });

  it("törlésre váró fiók is törölhető; purged/nemlétező/érvénytelen id 404; indoklás és admin süti kell; idegen origin tiltva", async () => {
    const a = await makeUser("anna");
    await User.updateOne({ _id: a.userId }, { status: "deleted_pending", deletedAt: new Date() });
    const c = await cookie();
    expect((await del("", a.userId)).status).toBe(401);
    expect((await del(c, a.userId, {})).status).toBe(400);
    expect((await del(c, a.userId, { reason: "kérésre" }, { origin: "http://evil.example" })).status).toBe(403);
    expect((await del(c, a.userId)).status).toBe(200);
    expect((await del(c, a.userId)).status).toBe(404);
    expect((await del(c, "6".repeat(24))).status).toBe(404);
    expect((await del(c, "nem-id")).status).toBe(404);
  });

  it("a runPurge változatlanul működik a közös purgeUser-rel", async () => {
    const a = await makeUser("anna");
    const b = await makeUser("bence");
    await User.updateOne({ _id: a.userId }, { status: "deleted_pending", deletedAt: new Date(Date.now() - 31 * 86_400_000) });
    await User.updateOne({ _id: b.userId }, { status: "deleted_pending", deletedAt: new Date() });
    const s = await runPurge();
    expect(s.purged).toBe(1);
    expect((await User.findById(a.userId))!.status).toBe("purged");
    expect((await User.findById(b.userId))!.status).toBe("deleted_pending");
  });
});

import { GET as versionRoute } from "@/app/api/version/route";
import pkg from "../package.json";
describe("verzió végpont", () => {
  it("nyilvános, a package.json verzióját adja", async () => {
    const r = await json(await versionRoute(jsonReq("/api/version", "GET"), anyCtx()));
    expect(r.status).toBe(200);
    expect(r.body.data.version).toBe(pkg.version);
  });
});

describe("aktivitás (presence)", () => {
  it("csak ismerősöké, kölcsönös, és a kikapcsolt felhasználó nem látszik", async () => {
    const { GET: getPresence } = await import("@/app/api/presence/route");
    const a = await makeUser("anna");
    const b = await makeUser("bela");
    const c = await makeUser("cili");
    await befriend(a, b);
    await User.updateMany({}, { lastSeenAt: new Date() });
    const get = async (u: TestUser) => (await json(await getPresence(jsonReq("/api/presence", "GET", undefined, authH(u)), anyCtx()))).body.data.items.map((i: { userId: string }) => i.userId);
    expect(await get(a)).toEqual([b.userId]);
    expect(await get(c)).toEqual([]);
    await putS(b, { showActivity: false });
    expect(await get(a)).toEqual([]);
    expect(await get(b)).toEqual([]);
  });
});
