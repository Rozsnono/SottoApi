/**
 * Proxy (Next 16; a korábbi middleware): az /admin oldalakat védi – érvényes admin süti nélkül a belépéshez irányít.
 * Gyors, optimista ellenőrzés; az API végpontok maguk is ellenőrzik a sütit (requireAdmin).
 */
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "sotto_admin";

async function isValid(token: string | undefined): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"], issuer: "sotto-admin" });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const valid = await isValid(req.cookies.get(COOKIE)?.value);
  if (pathname === "/admin/login") {
    return valid ? NextResponse.redirect(new URL("/admin", req.url)) : NextResponse.next();
  }
  if (!valid) return NextResponse.redirect(new URL("/admin/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
