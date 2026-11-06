import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok } from "@/lib/http";
import { Message, Report, User } from "@/models";

/** Jelentés metaadata. Üzenettartalom itt nincs; azt csak a /content végpont adhatja érvényes grant esetén. */
export const GET = adminRoute(async (_req, ctx: RouteContext<"/api/admin/reports/[id]">) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const r = await Report.findById(id).lean();
  if (!r) throw new ApiError("NOT_FOUND", "Nem található.");
  const [reporter, target, msg] = await Promise.all([
    User.findById(r.reporterId, { username: 1 }).lean(),
    r.targetUserId ? User.findById(r.targetUserId, { username: 1 }).lean() : null,
    r.targetMessageId ? Message.findById(r.targetMessageId, { type: 1, createdAt: 1, mediaSizeBytes: 1, senderId: 1 }).lean() : null,
  ]);
  const exp = r.moderationGrant?.expiresAt?.getTime();
  return ok({
    id: String(r._id),
    reason: r.reason,
    note: r.note ?? null,
    status: r.status,
    createdAt: (r as unknown as { createdAt: Date }).createdAt,
    resolvedAt: r.resolvedAt ?? null,
    reporter: reporter?.username ?? null,
    target: target?.username ?? null,
    message: msg ? { type: msg.type, sentAt: (msg as unknown as { createdAt: Date }).createdAt, sizeBytes: msg.mediaSizeBytes ?? null } : null,
    grant: !r.moderationGrant ? "none" : exp && exp > Date.now() ? "valid" : "expired",
    grantExpiresAt: r.moderationGrant?.expiresAt ?? null,
  });
});
