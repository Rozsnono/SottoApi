import { connectDb } from "@/lib/db";
import { adminRoute, escapeRegex, pageParams } from "@/lib/auth/adminRoute";
import { ok } from "@/lib/http";
import { AuditLog } from "@/models";

/** Audit napló (max. 30 nap a TTL miatt). Szűrők: actorType, action (előtag). */
export const GET = adminRoute(async (req) => {
  await connectDb();
  const u = new URL(req.url);
  const { page, size } = pageParams(req, 50);
  const filter: Record<string, unknown> = {};
  const at = u.searchParams.get("actorType");
  if (at && ["admin", "user", "system"].includes(at)) filter.actorType = at;
  const action = (u.searchParams.get("action") ?? "").trim().slice(0, 60);
  if (action) filter.action = { $regex: "^" + escapeRegex(action) };
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return ok({
    page,
    size,
    total,
    items: rows.map((r) => ({ id: String(r._id), at: r.createdAt, actorType: r.actorType, actorId: r.actorId ?? null, action: r.action, target: r.target ?? null, ip: r.ip ?? null, userAgent: r.userAgent ?? null })),
  });
});
