import { connectDb } from "@/lib/db";
import { adminRoute, pageParams } from "@/lib/auth/adminRoute";
import { ok } from "@/lib/http";
import { Report, User } from "@/models";

/** Jelentések sora (csak metaadat). */
export const GET = adminRoute(async (req) => {
  await connectDb();
  const u = new URL(req.url);
  const { page, size } = pageParams(req);
  const status = u.searchParams.get("status");
  const filter: Record<string, unknown> = {};
  if (status && ["open", "reviewed", "dismissed", "actioned"].includes(status)) filter.status = status;
  const [rows, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).lean(),
    Report.countDocuments(filter),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => [String(r.reporterId), r.targetUserId ? String(r.targetUserId) : ""]).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } }, { username: 1 }).lean();
  const un = new Map(users.map((x) => [String(x._id), x.username]));
  const now = Date.now();
  return ok({
    page,
    size,
    total,
    items: rows.map((r) => {
      const exp = r.moderationGrant?.expiresAt?.getTime();
      return {
        id: String(r._id),
        reason: r.reason,
        status: r.status,
        createdAt: (r as unknown as { createdAt: Date }).createdAt,
        reporter: un.get(String(r.reporterId)) ?? null,
        target: r.targetUserId ? (un.get(String(r.targetUserId)) ?? null) : null,
        grant: !r.moderationGrant ? "none" : exp && exp > now ? "valid" : "expired",
        grantExpiresAt: r.moderationGrant?.expiresAt ?? null,
      };
    }),
  });
});
