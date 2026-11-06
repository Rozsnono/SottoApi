import { connectDb } from "@/lib/db";
import { adminRoute, escapeRegex, pageParams } from "@/lib/auth/adminRoute";
import { ok } from "@/lib/http";
import { Device, Report, User } from "@/models";
import { ACCOUNT_PURGE_DAYS } from "@/protocol/constants";

/** Felhasználólista (csak metaadat). Szűrők: q (név-előtag), status. */
export const GET = adminRoute(async (req) => {
  await connectDb();
  const u = new URL(req.url);
  const { page, size } = pageParams(req);
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 40);
  const status = u.searchParams.get("status");
  const filter: Record<string, unknown> = {};
  if (q) filter.usernameNormalized = { $regex: "^" + escapeRegex(q) };
  if (status && ["active", "suspended", "deleted_pending", "purged"].includes(status)) filter.status = status;
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).lean(),
    User.countDocuments(filter),
  ]);
  const ids = rows.map((r) => r._id);
  const [devs, reps] = await Promise.all([
    Device.aggregate<{ _id: unknown; n: number }>([{ $match: { userId: { $in: ids }, revokedAt: { $exists: false } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]),
    Report.aggregate<{ _id: unknown; n: number }>([{ $match: { targetUserId: { $in: ids } } }, { $group: { _id: "$targetUserId", n: { $sum: 1 } } }]),
  ]);
  const dm = new Map(devs.map((d) => [String(d._id), d.n]));
  const rm = new Map(reps.map((d) => [String(d._id), d.n]));
  return ok({
    page,
    size,
    total,
    items: rows.map((r) => ({
      id: String(r._id),
      username: r.username,
      status: r.status,
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
      lastSeenAt: r.lastSeenAt ?? null,
      deletedAt: r.deletedAt ?? null,
      purgeAt: r.deletedAt ? new Date(r.deletedAt.getTime() + ACCOUNT_PURGE_DAYS * 86400_000) : null,
      daysLeft: r.deletedAt ? Math.max(0, Math.ceil((r.deletedAt.getTime() + ACCOUNT_PURGE_DAYS * 86400_000 - Date.now()) / 86400_000)) : null,
      devices: dm.get(String(r._id)) ?? 0,
      reports: rm.get(String(r._id)) ?? 0,
    })),
  });
});
