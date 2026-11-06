import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { archiveConversation, getFriendship } from "@/lib/social/helpers";

/** Ismerős törlése: az ismeretség archiválódik, a beszélgetés csak olvashatóvá válik (az előzmények megmaradnak). */
export const DELETE = handle(async (req, ctx: RouteContext<"/api/friends/[userId]">) => {
  const { user } = await requireUser(req);
  const { userId } = await ctx.params;
  if (!Types.ObjectId.isValid(userId)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const f = await getFriendship(user._id, userId);
  if (!f || !["accepted", "pending"].includes(f.status)) throw new ApiError("NOT_FOUND", "Nem található.");
  if (f.status === "accepted") {
    f.status = "archived";
    f.archivedAt = new Date();
  } else f.status = "cancelled";
  await f.save();
  await archiveConversation(user._id, userId);
  return ok({ status: f.status });
});
