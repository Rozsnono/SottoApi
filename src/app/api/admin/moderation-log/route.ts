import { connectDb } from "@/lib/db";
import { adminRoute, pageParams } from "@/lib/auth/adminRoute";
import { ok } from "@/lib/http";
import { ModerationLog } from "@/models";

/** Tartós moderációs napló (nincs IP, nincs tartalom). */
export const GET = adminRoute(async (req) => {
  await connectDb();
  const { page, size } = pageParams(req, 50);
  const [rows, total] = await Promise.all([
    ModerationLog.find({}).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).lean(),
    ModerationLog.countDocuments({}),
  ]);
  return ok({
    page,
    size,
    total,
    items: rows.map((r) => ({ id: String(r._id), at: r.createdAt, decision: r.decision, reason: r.reason, adminId: r.adminId, reportId: r.reportId ? String(r.reportId) : null, userId: r.userId ? String(r.userId) : null })),
  });
});
