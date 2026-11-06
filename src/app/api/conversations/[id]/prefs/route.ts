import { connectDb } from "@/lib/db";
import { handle, ok, readBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { ConversationPrefBodySchema } from "@/protocol/schemas";
import { ConversationPref } from "@/models";
import { requireConversation } from "@/lib/social/helpers";

/** Beszélgetés némítása (a szerver némított chatre nem küld pusht). `mutedUntil: null` = feloldás. */
export const PUT = handle(async (req, ctx: RouteContext<"/api/conversations/[id]/prefs">) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  await requireConversation(id, user._id);
  const { mutedUntil } = await readBody(req, ConversationPrefBodySchema);
  await connectDb();
  await ConversationPref.findOneAndUpdate({ userId: user._id, conversationId: id }, mutedUntil ? { mutedUntil: new Date(mutedUntil) } : { $unset: { mutedUntil: 1 } }, { upsert: true });
  return ok({ mutedUntil });
});
