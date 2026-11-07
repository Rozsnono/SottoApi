import { connectDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Friendship, User } from "@/models";

/**
 * Ismerősök aktivitása („fent van”): elfogadott ismerősök utolsó aktivitása. Kölcsönös: ha a kérő kikapcsolta az
 * aktivitás-megosztást, üres listát kap; akinél kikapcsolt, az nem szerepel. Más adat nem szivárog.
 */
export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  if (user.showActivity === false) return ok({ items: [] });
  await connectDb();
  const me = user._id;
  const frs = await Friendship.find({ status: "accepted", $or: [{ requesterId: me }, { addresseeId: me }] }, { requesterId: 1, addresseeId: 1 }).lean();
  const ids = frs.map((f) => (String(f.requesterId) === String(me) ? f.addresseeId : f.requesterId));
  const users = await User.find({ _id: { $in: ids }, status: "active", showActivity: { $ne: false } }, { lastSeenAt: 1 }).lean();
  return ok({ items: users.filter((u) => u.lastSeenAt).map((u) => ({ userId: String(u._id), lastSeenAt: u.lastSeenAt!.toISOString() })) });
});
