import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "@noble/hashes/utils.js";
import { randomUUID } from "node:crypto";
import { clearDb, jsonReq, json, makeClientKeys, registerBody, startDb, stopDb } from "./helpers";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { GET as getBackup } from "@/app/api/keys/backup/route";
import { GET as getMediaConfig } from "@/app/api/config/media/route";
import { POST as adminLogin } from "@/app/api/admin/login/route";
import { PUT as putMedia, GET as getMedia } from "@/app/api/admin/settings/media/route";
import { POST as suspend } from "@/app/api/admin/users/[id]/suspend/route";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { openSealed } from "@/lib/crypto/server";
import { RefreshToken, User, AuditLog, Device, AppSetting } from "@/models";
import { verifyAccessToken } from "@/lib/auth/jwt";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- teszt: a route ctx típusa itt nem lényeges
const ctx = { params: Promise.resolve({}) } as any;

async function reg(username = "anna") {
  const keys = makeClientKeys();
  const body = registerBody(username, keys);
  const r = await json(await register(jsonReq("/api/auth/register", "POST", body), ctx));
  return { keys, body, r };
}

async function adminCookie(): Promise<string> {
  const res = await adminLogin(jsonReq("/api/admin/login", "POST", { password: process.env.ADMIN_PASSWORD }, { origin: "http://localhost" }), ctx);
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("regisztráció és belépés", () => {
  it("regisztrál, nem ad vissza hash-t, és nem tárol nyers verifikátort", async () => {
    const { r, body } = await reg();
    expect(r.status).toBe(201);
    expect(r.body.data.user.username).toBe("anna");
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|recoveryVerifierHash|encryptedKeyBackup/);
    const u = await User.findOne({ usernameNormalized: "anna" }).lean();
    expect(u?.recoveryVerifierHash).not.toBe(body.recoveryVerifier);
    expect(u?.passwordHash.startsWith("$2")).toBe(true);
  });

  it("kisbetű/nagybetű ütközést (normalizált név) elutasít általános üzenettel", async () => {
    await reg("Anna");
    const r = (await reg("ANNA")).r;
    expect(r.status).toBe(409);
    expect(r.body.error?.message).toBe("Ez a név nem használható.");
  });

  it("érvénytelen felhasználónevet (szóköz) elutasít", async () => {
    const r = await json(await register(jsonReq("/api/auth/register", "POST", registerBody("an na")), ctx));
    expect(r.status).toBe(400);
  });

  it("login: jó jelszóval token, rosszal és ismeretlen névvel azonos általános hiba", async () => {
    const { body } = await reg();
    const ok = await json(await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: body.password, device: body.device }), ctx));
    expect(ok.status).toBe(200);
    expect(await verifyAccessToken(ok.body.data.tokens.accessToken)).not.toBeNull();
    const bad = await json(await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: "rossz-jelszo-123", device: body.device }), ctx));
    expect(bad.status).toBe(401);
    const unknown = await json(await login(jsonReq("/api/auth/login", "POST", { username: "nincs", password: "rossz-jelszo-123", device: body.device }), ctx));
    expect(unknown.body.error?.message).toBe(bad.body.error?.message);
  });

  it("login rate limit: 10 kísérlet után 429 és Retry-After", async () => {
    const { body } = await reg();
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) last = await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: "rossz-jelszo-123", device: body.device }), ctx);
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });
});

describe("refresh token forgatás és újrafelhasználás-észlelés", () => {
  it("forgat, majd a régi token újra-bemutatása a teljes családot visszavonja", async () => {
    const { r } = await reg();
    const t1 = r.body.data.tokens.refreshToken as string;
    const a = await json(await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: t1 }), ctx));
    expect(a.status).toBe(200);
    const t2 = a.body.data.tokens.refreshToken as string;
    expect(t2).not.toBe(t1);
    expect((await json(await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: t1 }), ctx))).status).toBe(401);
    expect((await json(await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: t2 }), ctx))).status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: { $exists: false } })).toBe(0);
    expect(await AuditLog.countDocuments({ action: "auth.refresh_reuse_detected" })).toBe(1);
  });

  it("logout visszavonja az eszköz munkameneteit", async () => {
    const { r } = await reg();
    const res = await logout(jsonReq("/api/auth/logout", "POST", {}, bearer(r.body.data.tokens.accessToken)), ctx);
    expect(res.status).toBe(200);
    expect((await json(await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: r.body.data.tokens.refreshToken }), ctx))).status).toBe(401);
  });
});

describe("jelszó-visszaállítás Recovery Code verifikátorral", () => {
  it("jó verifikátorral új jelszó, a régi nem működik, a munkamenetek visszavonva", async () => {
    const { keys, body, r } = await reg();
    const res = await json(await resetPassword(jsonReq("/api/auth/reset-password", "POST", { username: "anna", recoveryVerifier: keys.recoveryVerifier, newPassword: "uj-jelszo-1234567" }), ctx));
    expect(res.status).toBe(200);
    expect((await json(await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: body.password, device: body.device }), ctx))).status).toBe(401);
    expect((await json(await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: "uj-jelszo-1234567", device: body.device }), ctx))).status).toBe(200);
    expect((await json(await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: r.body.data.tokens.refreshToken }), ctx))).status).toBe(401);
  });
  it("rossz verifikátorral és ismeretlen névvel azonos hibát ad", async () => {
    await reg();
    const wrong = await json(await resetPassword(jsonReq("/api/auth/reset-password", "POST", { username: "anna", recoveryVerifier: makeClientKeys().recoveryVerifier, newPassword: "uj-jelszo-1234567" }), ctx));
    const none = await json(await resetPassword(jsonReq("/api/auth/reset-password", "POST", { username: "nincs", recoveryVerifier: makeClientKeys().recoveryVerifier, newPassword: "uj-jelszo-1234567" }), ctx));
    expect(wrong.status).toBe(401);
    expect(none.body.error?.message).toBe(wrong.body.error?.message);
  });
});

describe("kulcsmentés", () => {
  it("friss belépés után lekérhető", async () => {
    const { r } = await reg();
    const res = await json(await getBackup(jsonReq("/api/keys/backup", "GET", undefined, bearer(r.body.data.tokens.accessToken)), ctx));
    expect(res.status).toBe(200);
    expect(res.body.data.encryptedKeyBackup).toBeTruthy();
  });
});

describe("média API beállítások és kulcs-kiosztás", () => {
  const settings = { baseUrl: "https://media.example.test:9443", folder: "sotto/media", phoneKey: "PHONE-KEY-SECRET-1234", serverKey: "SERVER-KEY-SECRET-9999" };

  it("az admin menti, a kulcs sosem jön vissza, a telefon csak a saját privát kulcsával nyitja ki", async () => {
    const { keys, r } = await reg();
    const cookie = await adminCookie();
    const put = await json(await putMedia(jsonReq("/api/admin/settings/media", "PUT", settings, { cookie, origin: "http://localhost" }), ctx));
    expect(put.status).toBe(200);
    expect(JSON.stringify(put.body)).not.toContain("PHONE-KEY-SECRET");
    expect(put.body.data.phoneKeyMask).toBe("••••••••1234");
    expect(put.body.data.version).toBe(1);
    const get = await json(await getMedia(jsonReq("/api/admin/settings/media", "GET", undefined, { cookie }), ctx));
    expect(JSON.stringify(get.body)).not.toContain("SERVER-KEY-SECRET");

    const raw = await AppSetting.findOne({ key: "media" }).lean();
    expect(JSON.stringify(raw)).not.toContain("PHONE-KEY-SECRET");

    const cfg = await json(await getMediaConfig(jsonReq("/api/config/media", "GET", undefined, bearer(r.body.data.tokens.accessToken)), ctx));
    expect(cfg.status).toBe(200);
    expect(JSON.stringify(cfg.body)).not.toContain("PHONE-KEY-SECRET");
    const plain = JSON.parse(Buffer.from(openSealed(keys.devPriv, cfg.body.data.sealed)).toString());
    expect(plain.apiKey).toBe("PHONE-KEY-SECRET-1234");
    expect(plain.keyVersion).toBe(1);
    expect(() => openSealed(randomBytes(32), cfg.body.data.sealed)).toThrow();
    const after = await json(await getMedia(jsonReq("/api/admin/settings/media", "GET", undefined, { cookie }), ctx));
    expect(after.body.data.devicesReceived).toBe(1);
  });

  it("a kulcs módosítása verziót léptet; a hiányzó kulcs mező a régit tartja meg", async () => {
    const cookie = await adminCookie();
    const h = { cookie, origin: "http://localhost" };
    await putMedia(jsonReq("/api/admin/settings/media", "PUT", settings, h), ctx);
    const same = await json(await putMedia(jsonReq("/api/admin/settings/media", "PUT", { baseUrl: settings.baseUrl, folder: settings.folder }, h), ctx));
    expect(same.body.data.version).toBe(1);
    const rot = await json(await putMedia(jsonReq("/api/admin/settings/media", "PUT", { ...settings, phoneKey: "NEW-PHONE-KEY-5678" }, h), ctx));
    expect(rot.body.data.version).toBe(2);
    expect(rot.body.data.phoneKeyMask).toBe("••••••••5678");
  });

  it("visszavont eszköz nem kap kulcsot", async () => {
    const { r } = await reg();
    const cookie = await adminCookie();
    await putMedia(jsonReq("/api/admin/settings/media", "PUT", settings, { cookie, origin: "http://localhost" }), ctx);
    await Device.updateMany({}, { revokedAt: new Date() });
    const cfg = await json(await getMediaConfig(jsonReq("/api/config/media", "GET", undefined, bearer(r.body.data.tokens.accessToken)), ctx));
    expect(cfg.status).toBe(401);
  });

  it("beállítás nélkül MEDIA_NOT_CONFIGURED (503)", async () => {
    const { r } = await reg();
    const cfg = await json(await getMediaConfig(jsonReq("/api/config/media", "GET", undefined, bearer(r.body.data.tokens.accessToken)), ctx));
    expect(cfg.body.error?.code).toBe("MEDIA_NOT_CONFIGURED");
  });

  it("érvénytelen mappanevet ('..') elutasít", async () => {
    const cookie = await adminCookie();
    const res = await json(await putMedia(jsonReq("/api/admin/settings/media", "PUT", { ...settings, folder: "../etc" }, { cookie, origin: "http://localhost" }), ctx));
    expect(res.status).toBe(400);
  });
});

describe("admin hitelesítés", () => {
  it("jó jelszóval süti (HttpOnly, SameSite=Strict), rosszal 401 és 5 kísérlet után 429, auditálva", async () => {
    const ok = await adminLogin(jsonReq("/api/admin/login", "POST", { password: process.env.ADMIN_PASSWORD }, { origin: "http://localhost" }), ctx);
    const sc = ok.headers.get("set-cookie") ?? "";
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Strict/);
    await clearDb();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await adminLogin(jsonReq("/api/admin/login", "POST", { password: "rossz-jelszo" }, { origin: "http://localhost" }), ctx)).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
    expect(await AuditLog.countDocuments({ action: "admin.login_failed" })).toBe(5);
    expect(await AuditLog.countDocuments({ action: "admin.login_rate_limited" })).toBe(1);
  });

  it("süti nélkül védett végpont 401; idegen Origin-nel módosítás tiltott", async () => {
    expect((await adminStats(jsonReq("/api/admin/stats", "GET"), ctx)).status).toBe(401);
    const cookie = await adminCookie();
    const { r } = await reg();
    const id = r.body.data.user.id as string;
    const res = await suspend(jsonReq(`/api/admin/users/${id}/suspend`, "POST", { reason: "teszt" }, { cookie, origin: "http://evil.example" }), { params: Promise.resolve({ id }) } as never);
    expect(res.status).toBe(403);
  });

  it("felfüggesztés: munkamenetek visszavonva, a belépés tiltott, naplózva", async () => {
    const { body, r } = await reg();
    const id = r.body.data.user.id as string;
    const cookie = await adminCookie();
    const res = await suspend(jsonReq(`/api/admin/users/${id}/suspend`, "POST", { reason: "zaklatás" }, { cookie, origin: "http://localhost" }), { params: Promise.resolve({ id }) } as never);
    expect(res.status).toBe(200);
    const l = await json(await login(jsonReq("/api/auth/login", "POST", { username: "anna", password: body.password, device: { ...body.device, deviceId: randomUUID() } }), ctx));
    expect(l.body.error?.code).toBe("ACCOUNT_SUSPENDED");
    expect((await json(await refresh(jsonReq("/api/auth/refresh", "POST", { refreshToken: r.body.data.tokens.refreshToken }), ctx))).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: "admin.user_suspend" })).toBe(1);
  });
});

describe("egységes boríték", () => {
  it("hibás JSON-ra VALIDATION_ERROR, stack nélkül", async () => {
    const res = await register(new Request("http://localhost/api/auth/register", { method: "POST", body: "{nem json", headers: { "x-forwarded-for": "10.0.0.9" } }), ctx);
    const j = await json(res);
    expect(j.status).toBe(400);
    expect(j.body.ok).toBe(false);
    expect(JSON.stringify(j.body)).not.toMatch(/node_modules|\sat\s\w+/);
  });
});
