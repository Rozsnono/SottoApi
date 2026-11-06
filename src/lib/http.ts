/**
 * HTTP segédek: egységes boríték, hibatérkép, JSON olvasás méretkorláttal, kliens-IP.
 * A válaszok sosem tartalmaznak stack trace-t vagy belső részletet.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ErrorCode } from "@/protocol/constants";
import { logger } from "./logger";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
  BLOCKED: 403,
  CONVERSATION_ARCHIVED: 409,
  DEVICE_LIST_CHANGED: 409,
  GRANT_EXPIRED: 410,
  ACCOUNT_SUSPENDED: 403,
  MEDIA_NOT_CONFIGURED: 503,
};

/** Kliensnek szánt, biztonságos hibaüzenet + kód. */
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public extra?: { retryAfterSec?: number; details?: unknown },
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code: ErrorCode, message: string, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: STATUS[code], headers });
}

function isDbDown(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? "";
  return /MongoNetwork|MongoServerSelection|MongooseServerSelection|MongoNotConnected|MongoTimeout/.test(name);
}

/** Route handler csomagoló: hibák → egységes boríték; a részletek a logba kerülnek. */
export function handle<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        const headers = e.extra?.retryAfterSec ? { "Retry-After": String(e.extra.retryAfterSec) } : undefined;
        return fail(e.code, e.message, headers);
      }
      if (e instanceof ZodError) {
        return fail("VALIDATION_ERROR", "Hibás kérés.");
      }
      if (isDbDown(e)) {
        logger.error("Adatbázis nem elérhető", e);
        return fail("SERVICE_UNAVAILABLE", "A szolgáltatás átmenetileg nem elérhető.");
      }
      logger.error("Kezeletlen hiba a kérés feldolgozásakor", e, { url: new URL(req.url).pathname });
      return fail("INTERNAL", "Váratlan hiba történt.");
    }
  };
}

/** JSON törzs olvasása és validálása méretkorláttal. */
export async function readBody<T>(req: Request, schema: ZodType<T>, maxBytes = 1_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE", "A kérés túl nagy.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Hibás JSON.");
  }
  return schema.parse(json);
}

/** Kliens IP: a proxy által hozzáfűzött UTOLSÓ `x-forwarded-for` elem (nem hamisítható a kliens által beszúrt elemmel). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function userAgent(req: Request): string {
  return (req.headers.get("user-agent") ?? "").slice(0, 200);
}
