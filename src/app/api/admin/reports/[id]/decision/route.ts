import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok, readBody, clientIp, userAgent } from "@/lib/http";
import { ModerationLog, Report, User } from "@/models";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";

const Body = z.object({
  decision: z.enum(["reviewed", "dismissed", "actioned"]),
  reason: z.string().min(3).max(300),
  /** `actioned` esetén a jelentett fiók felfüggesztése. */
  suspendTarget: z.boolean().optional(),
});

/** Döntés a jelentésről; indoklás kötelező; auditálva és a tartós moderációs naplóba írva. */
export const POST = adminRoute(async (req, ctx: RouteContext<"/api/admin/reports/[id]/decision">, admin) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  const body = await readBody(req, Body, 4096);
  await connectDb();
  const r = await Report.findById(id);
  if (!r) throw new ApiError("NOT_FOUND", "Nem található.");
  r.status = body.decision;
  r.resolvedAt = new Date();
  await r.save();
  if (body.decision === "actioned" && body.suspendTarget && r.targetUserId) {
    await User.updateOne({ _id: r.targetUserId, status: "active" }, { status: "suspended", suspendedReason: body.reason });
    await revokeAllSessions(String(r.targetUserId));
  }
  await ModerationLog.create({ reportId: r._id, userId: r.targetUserId, decision: body.decision, reason: body.reason, adminId: admin.adminId });
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.report_decision", target: id, ip: clientIp(req), userAgent: userAgent(req), meta: { decision: body.decision } });
  return ok({ status: r.status });
});
