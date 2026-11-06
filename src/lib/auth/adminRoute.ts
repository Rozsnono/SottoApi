/** Védett admin végpont csomagoló: hiba-kezelés + érvényes admin munkamenet. */
import { handle } from "../http";
import { requireAdmin } from "./admin";

export function adminRoute<C>(fn: (req: Request, ctx: C, admin: { adminId: string }) => Promise<Response>) {
  return handle<C>(async (req, ctx) => fn(req, ctx, await requireAdmin(req)));
}

/** Oldalszámozás-paraméterek biztonságos kinyerése. */
export function pageParams(req: Request, defaultSize = 25): { page: number; size: number } {
  const u = new URL(req.url);
  const page = Math.max(1, Math.min(10_000, parseInt(u.searchParams.get("page") ?? "1", 10) || 1));
  const size = Math.max(1, Math.min(100, parseInt(u.searchParams.get("size") ?? String(defaultSize), 10) || defaultSize));
  return { page, size };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
