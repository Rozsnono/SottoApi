import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok, readBody, clientIp, userAgent } from "@/lib/http";
import { ModerationLog, User } from "@/models";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";

const Body = z.object({ reason: z.string().min(3).max(300) });

/** Felfüggesztés indoklással: munkamenetek visszavonva; auditálva és a tartós moderációs naplóba írva. */
export const POST = adminRoute(async (req, ctx: RouteContext<"/api/admin/users/[id]/suspend">, admin) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  const { reason } = await readBody(req, Body, 4096);
  await connectDb();
  const user = await User.findById(id);
  if (!user || user.status === "purged") throw new ApiError("NOT_FOUND", "Nem található.");
  user.status = "suspended";
  user.suspendedReason = reason;
  await user.save();
  await revokeAllSessions(id);
  await ModerationLog.create({ userId: id, decision: "suspend", reason, adminId: admin.adminId });
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.user_suspend", target: id, ip: clientIp(req), userAgent: userAgent(req) });
  return ok({ status: user.status });
});
