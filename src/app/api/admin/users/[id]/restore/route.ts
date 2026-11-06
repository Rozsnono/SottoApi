import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok, readBody, clientIp, userAgent } from "@/lib/http";
import { ModerationLog, User } from "@/models";
import { audit } from "@/lib/audit";

const Body = z.object({ reason: z.string().min(3).max(300) });

/** Felfüggesztett fiók visszaállítása (a törlésre váró fiókot a felhasználó állítja vissza jelszóval + kóddal). */
export const POST = adminRoute(async (req, ctx: RouteContext<"/api/admin/users/[id]/restore">, admin) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  const { reason } = await readBody(req, Body, 4096);
  await connectDb();
  const user = await User.findById(id);
  if (!user || user.status !== "suspended") throw new ApiError("CONFLICT", "Csak felfüggesztett fiók állítható vissza.");
  user.status = "active";
  user.suspendedReason = undefined;
  await user.save();
  await ModerationLog.create({ userId: id, decision: "restore", reason, adminId: admin.adminId });
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.user_restore", target: id, ip: clientIp(req), userAgent: userAgent(req) });
  return ok({ status: user.status });
});
