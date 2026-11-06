import { z } from "zod";
import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok, readBody, clientIp, userAgent } from "@/lib/http";
import { ModerationLog, User } from "@/models";
import { purgeUser } from "@/lib/purge";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const Body = z.object({ reason: z.string().min(3).max(300) });

/**
 * Felhasználó azonnali, végleges törlése (a 30 napos várakozás kihagyásával). Visszavonhatatlan.
 * Ugyanazt a purgeUser-t használja, mint a cron; hiba esetén a fiók nem lesz `purged`, a cron később újrapróbálja.
 */
export const POST = adminRoute(async (req, ctx: RouteContext<"/api/admin/users/[id]/delete">, admin) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  const { reason } = await readBody(req, Body, 4096);
  await connectDb();
  const user = await User.findById(id, { status: 1 });
  if (!user || user.status === "purged") throw new ApiError("NOT_FOUND", "Nem található.");
  // Először kizárjuk: ha a törlés félúton elakad, a fiók akkor sem használható.
  if (user.status !== "deleted_pending") {
    await User.updateOne({ _id: id }, { status: "deleted_pending", deletedAt: new Date(0) });
    await revokeAllSessions(id);
  }
  try {
    await purgeUser(id);
  } catch (e) {
    logger.error("Admin fióktörlés sikertelen", e, { userId: id });
    throw new ApiError("INTERNAL", "A törlés nem fejeződött be (pl. a médiatár nem érhető el). A rendszer később újrapróbálja.");
  }
  await ModerationLog.create({ userId: id, decision: "delete", reason, adminId: admin.adminId });
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.user_delete", target: id, ip: clientIp(req), userAgent: userAgent(req) });
  return ok({ status: "purged" });
});
