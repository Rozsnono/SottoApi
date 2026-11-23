import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { requireConversation } from "@/lib/social/helpers";
import { MAX_EVENTS_PER_PAGE, RECENT_PAGE_SIZE } from "@/protocol/constants";
import { Message, MessageReceipt } from "@/models";
import { toWire } from "@/lib/messageWire";

/**
 * Lapozott előzmény egy beszélgetéshez (0.8.0): a `before` sorszámnál régebbi, legfeljebb `limit` (alap RECENT_PAGE_SIZE)
 * nem-esemény üzenet visszafelé, plusz az oldal tartományába eső rendszer-események (szerkesztés, reakció, téma, TTL),
 * és a saját üzenetek olvasás-visszaigazolásai. `hasMore`: van-e még régebbi üzenet. Csak a beszélgetés résztvevője éri el.
 */
export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  await connectDb();
  const q = new URL(req.url).searchParams;
  const conversationId = q.get("conversationId") ?? "";
  if (!Types.ObjectId.isValid(conversationId)) throw new ApiError("NOT_FOUND", "Nem található.");
  await requireConversation(conversationId, user._id);
  const before = Number.parseInt(q.get("before") ?? "", 10);
  if (!Number.isFinite(before) || before < 1) throw new ApiError("VALIDATION_ERROR", "Hibás kérés.");
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.get("limit") ?? "", 10) || RECENT_PAGE_SIZE));

  const page = await Message.find({ conversationId, type: { $ne: "event" }, seq: { $lt: before }, deletedAt: { $exists: false } }).sort({ seq: -1 }).limit(limit + 1).lean();
  const hasMore = page.length > limit;
  const msgs = page.slice(0, limit);
  const minSeq = hasMore ? msgs[msgs.length - 1].seq : 0; // a legrégebbi oldalnál a korábbi események is kellenek
  const events = await Message.find({ conversationId, type: "event", seq: { $gte: minSeq, $lt: before }, deletedAt: { $exists: false } }).sort({ seq: -1 }).limit(MAX_EVENTS_PER_PAGE).lean();
  const docs = [...msgs, ...events].sort((a, b) => a.seq - b.seq);
  const mineIds = docs.filter((d) => String(d.senderId) === String(user._id)).map((d) => d._id);
  const recs = mineIds.length ? await MessageReceipt.find({ messageId: { $in: mineIds } }).lean() : [];
  return ok({ messages: docs.map(toWire), receipts: recs.map((d) => ({ messageId: String(d.messageId), readAt: d.readAt })), hasMore });
});
