/**
 * Admin hitelesítés: közös jelszó (időállandó összehasonlítás) + opcionális TOTP; HttpOnly, SameSite=Strict
 * munkamenet-süti (aláírt JWT, rövid lejárat). A süti neve `sotto_admin`.
 */
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "../env";
import { safeEqual, verifyTotp } from "../crypto/server";
import { ApiError } from "../http";

export const ADMIN_COOKIE = "sotto_admin";
export const ADMIN_SESSION_SEC = 2 * 60 * 60;

const key = () => new TextEncoder().encode(getEnv().ADMIN_SESSION_SECRET);

/** Jelszó (és ha be van állítva, TOTP) ellenőrzése. Nem árulja el, melyik rész hibás. */
export function checkAdminCredentials(password: string, totp?: string): boolean {
  const env = getEnv();
  const pwOk = safeEqual(password, env.ADMIN_PASSWORD);
  const totpOk = env.ADMIN_TOTP_SECRET ? verifyTotp(env.ADMIN_TOTP_SECRET, totp ?? "") : true;
  return pwOk && totpOk;
}

export async function createAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(getEnv().ADMIN_ID)
    .setIssuer("sotto-admin")
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_SEC}s`)
    .sign(key());
}

export async function verifyAdminToken(token: string | undefined | null): Promise<{ adminId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], issuer: "sotto-admin", clockTolerance: 30 });
    if (payload.role !== "admin" || !payload.sub) return null;
    return { adminId: payload.sub };
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Védett admin API: érvényes süti kell; módosító kéréseknél azonos eredetű Origin (CSRF elleni védelem a SameSite mellett). */
export async function requireAdmin(req: Request): Promise<{ adminId: string }> {
  const session = await verifyAdminToken(readCookie(req, ADMIN_COOKIE));
  if (!session) throw new ApiError("UNAUTHORIZED", "Admin belépés szükséges.");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
  return session;
}

export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // nem böngészős kliens (pl. curl) – a süti nélkül úgyis elutasítva
  const host = req.headers.get("host");
  let oh: string;
  try {
    oh = new URL(origin).host;
  } catch {
    throw new ApiError("FORBIDDEN", "Érvénytelen eredet.");
  }
  if (!host || oh !== host) throw new ApiError("FORBIDDEN", "Érvénytelen eredet.");
}

export function adminCookieAttributes(): string {
  const secure = getEnv().NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_SEC}${secure}`;
}
