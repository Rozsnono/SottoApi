import { connectDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Conversation, ConversationPref, User } from "@/models";

/**
 * Beszélgetések listája. A másik fél törlésre váró/törölt/felfüggesztett fiókja „elérhetetlen”
 * (a név nem kerül ki), a beszélgetés pedig csak olvasható.
 */
export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  await connectDb();
  const convs = await Conversation.find({ participants: user._id }).sort({ updatedAt: -1 }).lean();
  const otherIds = convs.map((c) => c.participants.find((p) => String(p) !== String(user._id))!);
  const [users, prefs] = await Promise.all([
    User.find({ _id: { $in: otherIds } }, { username: 1, status: 1, identityPublicKey: 1, identitySigningPublicKey: 1 }).lean(),
    ConversationPref.find({ userId: user._id, conversationId: { $in: convs.map((c) => c._id) } }).lean(),
  ]);
  const um = new Map(users.map((u) => [String(u._id), u]));
  const pm = new Map(prefs.map((p) => [String(p.conversationId), p.mutedUntil ?? null]));
  return ok({
    items: convs.map((c, i) => {
      const o = um.get(String(otherIds[i]));
      const available = !!o && o.status === "active";
      return {
        id: String(c._id),
        archived: c.archived || !available,
        other: available ? { id: String(o!._id), username: o!.username, identityPublicKey: o!.identityPublicKey, identitySigningPublicKey: o!.identitySigningPublicKey } : { id: String(otherIds[i]), username: null },
        available,
        mutedUntil: pm.get(String(c._id)) ?? null,
      };
    }),
  });
});
