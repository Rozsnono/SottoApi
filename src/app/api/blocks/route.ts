import { connectDb } from "@/lib/db";
import { ApiError, handle, ok, readBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { BlockBodySchema } from "@/protocol/schemas";
import { Block, Friendship, User } from "@/models";
import { archiveConversation, pairKey } from "@/lib/social/helpers";

export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  await connectDb();
  const bl = await Block.find({ blockerId: user._id }).lean();
  const us = await User.find({ _id: { $in: bl.map((b) => b.blockedId) } }, { username: 1 }).lean();
  const um = new Map(us.map((u) => [String(u._id), u.username]));
  return ok({ items: bl.map((b) => ({ userId: String(b.blockedId), username: um.get(String(b.blockedId)) ?? null })) });
});

/**
 * Letiltás: idempotens; megszünteti az ismeretséget (elfogadott → archivált, függő → visszavont) és archiválja a beszélgetést.
 * A tiltott fél nem kap jelzést.
 */
export const POST = handle(async (req) => {
  const { user } = await requireUser(req);
  const { userId } = await readBody(req, BlockBodySchema);
  if (userId === String(user._id)) throw new ApiError("VALIDATION_ERROR", "Önmagad nem tilthatod le.");
  await connectDb();
  if (!(await User.exists({ _id: userId }))) throw new ApiError("NOT_FOUND", "Nem található.");
  await Block.updateOne({ blockerId: user._id, blockedId: userId }, { $setOnInsert: { blockerId: user._id, blockedId: userId } }, { upsert: true });
  const f = await Friendship.findOne({ pairKey: pairKey(user._id, userId) });
  if (f && (f.status === "accepted" || f.status === "pending")) {
    if (f.status === "accepted") { f.status = "archived"; f.archivedAt = new Date(); } else f.status = "cancelled";
    await f.save();
  }
  await archiveConversation(user._id, userId);
  return ok({ blocked: true });
});
