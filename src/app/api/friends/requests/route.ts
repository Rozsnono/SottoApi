import { connectDb } from "@/lib/db";
import { handle, ok, readBody } from "@/lib/http";
import { enforce } from "@/lib/ratelimit";
import { requireUser } from "@/lib/auth/sessions";
import { FriendRequestBodySchema, normalizeUsername } from "@/protocol/schemas";
import { Friendship, User } from "@/models";
import { ensureConversation, getFriendship, isBlockedEitherWay, pairKey } from "@/lib/social/helpers";

/**
 * Ismerősnek jelölés felhasználónévvel. Nem árul el semmit: tiltás, rejtett fiók, korlátozó beállítás vagy ismeretlen név
 * esetén is általános „sent” választ adunk. Idempotens; ha a másik fél már jelölt minket, a kérés elfogadódik.
 * Korlát: 10/perc és 50/nap.
 */
export const POST = handle(async (req) => {
  const { user } = await requireUser(req);
  await enforce(`friendreq:min:${user._id}`, { limit: 10, windowSec: 60 });
  await enforce(`friendreq:day:${user._id}`, { limit: 50, windowSec: 86_400 });
  const { username } = await readBody(req, FriendRequestBodySchema);
  await connectDb();
  const silent = () => ok({ status: "sent" });

  const target = await User.findOne({ usernameNormalized: normalizeUsername(username), status: "active" });
  if (!target || String(target._id) === String(user._id)) return silent();
  if (await isBlockedEitherWay(user._id, target._id)) return silent();
  if (target.discoverability === "hidden" || target.friendRequestPolicy === "friends_only") return silent();

  const f = await getFriendship(user._id, target._id);
  if (!f) {
    await Friendship.create({ requesterId: user._id, addresseeId: target._id, pairKey: pairKey(user._id, target._id), status: "pending" });
    return silent();
  }
  if (f.status === "accepted") return ok({ status: "already_friends" });
  if (f.status === "pending") {
    if (String(f.requesterId) === String(user._id)) return silent();
    // A másik fél már jelölt minket: kölcsönös szándék → elfogadás.
    f.status = "accepted";
    f.respondedAt = new Date();
    await f.save();
    const conv = await ensureConversation(user._id, target._id);
    return ok({ status: "accepted", conversationId: String(conv._id) });
  }
  // declined / cancelled / archived → újra-jelölés
  f.requesterId = user._id;
  f.addresseeId = target._id;
  f.status = "pending";
  f.respondedAt = undefined;
  f.archivedAt = undefined;
  await f.save();
  return silent();
});
