import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Message, MessageReceipt } from "@/models";
import { isBlockedEitherWay, requireConversation } from "@/lib/social/helpers";
import { nextSeq } from "@/lib/seq";
import { isDuplicateKeyError } from "@/lib/auth/users";

/**
 * Olvasás-visszaigazolás (csak a címzett, csak a küldő látja). Törölt üzenetre elutasítva (a törlés nyer).
 * Tiltás esetén csendben nem jön létre receipt (mindkét irányban tiltott).
 */
export const POST = handle(async (req, ctx: RouteContext<"/api/messages/[id]/read">) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const msg = await Message.findById(id, { conversationId: 1, senderId: 1, deletedAt: 1 }).lean();
  if (!msg) throw new ApiError("NOT_FOUND", "Nem található.");
  const { otherId } = await requireConversation(String(msg.conversationId), user._id);
  if (String(msg.senderId) === String(user._id)) throw new ApiError("FORBIDDEN", "A saját üzenet nem olvasható vissza.");
  if (msg.deletedAt) throw new ApiError("NOT_FOUND", "Az üzenet már nem elérhető.");
  if (await isBlockedEitherWay(user._id, otherId)) return ok({ read: true });
  try {
    await MessageReceipt.create({ messageId: msg._id, userId: user._id, seq: await nextSeq() });
  } catch (e) {
    if (!isDuplicateKeyError(e)) throw e;
  }
  return ok({ read: true });
});
