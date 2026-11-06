import { connectDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Conversation, Friendship, User } from "@/models";
import { pairKey } from "@/lib/social/helpers";

/** Ismerősök, bejövő és kimenő kérések (a kliens ebből építi a névjegyzéket; a kulcsok az üzenetküldéshez kellenek). */
export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  await connectDb();
  const me = user._id;
  const frs = await Friendship.find({ status: { $in: ["accepted", "pending"] }, $or: [{ requesterId: me }, { addresseeId: me }] }).lean();
  const otherIds = frs.map((f) => (String(f.requesterId) === String(me) ? f.addresseeId : f.requesterId));
  const [users, convs] = await Promise.all([
    User.find({ _id: { $in: otherIds }, status: "active" }, { username: 1, identityPublicKey: 1, identitySigningPublicKey: 1 }).lean(),
    Conversation.find({ participantsKey: { $in: otherIds.map((o) => pairKey(me, o)) } }, { participantsKey: 1 }).lean(),
  ]);
  const um = new Map(users.map((u) => [String(u._id), u]));
  const cm = new Map(convs.map((c) => [c.participantsKey, String(c._id)]));
  const friends: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];
  for (const f of frs) {
    const oid = String(f.requesterId) === String(me) ? f.addresseeId : f.requesterId;
    const o = um.get(String(oid));
    if (!o) continue;
    const entry = { friendshipId: String(f._id), user: { id: String(o._id), username: o.username, identityPublicKey: o.identityPublicKey, identitySigningPublicKey: o.identitySigningPublicKey }, conversationId: cm.get(pairKey(me, oid)) ?? null };
    if (f.status === "accepted") friends.push(entry);
    else if (String(f.requesterId) === String(me)) outgoing.push(entry);
    else incoming.push(entry);
  }
  return ok({ friends, incoming, outgoing });
});
