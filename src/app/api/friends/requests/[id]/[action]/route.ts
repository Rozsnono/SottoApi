import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Friendship } from "@/models";
import { ensureConversation, isBlockedEitherWay } from "@/lib/social/helpers";

/** Kérés kezelése: accept / decline (címzett), cancel (kérelmező). Csak függő kérés módosítható. */
export const POST = handle(async (req, ctx: RouteContext<"/api/friends/requests/[id]/[action]">) => {
  const { user } = await requireUser(req);
  const { id, action } = await ctx.params;
  if (!Types.ObjectId.isValid(id) || !["accept", "decline", "cancel"].includes(action)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const f = await Friendship.findById(id);
  const me = String(user._id);
  if (!f || (String(f.requesterId) !== me && String(f.addresseeId) !== me)) throw new ApiError("NOT_FOUND", "Nem található.");
  const other = String(f.requesterId) === me ? f.addresseeId : f.requesterId;
  if (await isBlockedEitherWay(me, other)) throw new ApiError("NOT_FOUND", "Nem található.");
  if (f.status !== "pending") throw new ApiError("CONFLICT", "A kérés már le van zárva.");
  const isAddressee = String(f.addresseeId) === me;

  if (action === "cancel") {
    if (isAddressee) throw new ApiError("FORBIDDEN", "Nem engedélyezett.");
    f.status = "cancelled";
  } else {
    if (!isAddressee) throw new ApiError("FORBIDDEN", "Nem engedélyezett.");
    f.status = action === "accept" ? "accepted" : "declined";
  }
  f.respondedAt = new Date();
  await f.save();
  if (f.status === "accepted") {
    const conv = await ensureConversation(f.requesterId, f.addresseeId);
    return ok({ status: f.status, conversationId: String(conv._id) });
  }
  return ok({ status: f.status });
});
