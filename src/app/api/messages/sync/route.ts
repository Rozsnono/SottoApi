import { connectDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { SYNC_PAGE_SIZE } from "@/protocol/constants";
import { AppSetting, Conversation, Device, Message, MessageReceipt, User } from "@/models";

/**
 * Szinkron: új üzenetek, törlések és olvasás-visszaigazolások egyetlen monoton sorszám (cursor) szerint.
 * A három folyam közös sorrendbe fésülve, oldalanként max. 100 elem; `hasMore` jelzi a folytatást.
 * A válasz tartalmazza az aktuális médiakulcs-verziót (forgatás-jelzés).
 */
export const GET = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  await connectDb();
  const cursor = Math.max(0, parseInt(new URL(req.url).searchParams.get("cursor") ?? "0", 10) || 0);
  const N = SYNC_PAGE_SIZE;
  const convs = await Conversation.find({ participants: user._id }, { _id: 1 }).lean();
  const convIds = convs.map((c) => c._id);

  const [newMsgs, deletions, receipts] = await Promise.all([
    Message.find({ conversationId: { $in: convIds }, seq: { $gt: cursor }, deletedAt: { $exists: false } }).sort({ seq: 1 }).limit(N + 1).lean(),
    Message.find({ conversationId: { $in: convIds }, deletedSeq: { $gt: cursor } }, { deletedSeq: 1, deletedAt: 1 }).sort({ deletedSeq: 1 }).limit(N + 1).lean(),
    (async () => {
      const mine = await Message.find({ senderId: user._id, conversationId: { $in: convIds } }, { _id: 1 }).lean();
      return MessageReceipt.find({ messageId: { $in: mine.map((m) => m._id) }, seq: { $gt: cursor } }).sort({ seq: 1 }).limit(N + 1).lean();
    })(),
  ]);

  type Item = { seq: number; kind: "m" | "d" | "r"; doc: unknown };
  const all: Item[] = [
    ...newMsgs.map((d) => ({ seq: d.seq, kind: "m" as const, doc: d })),
    ...deletions.map((d) => ({ seq: d.deletedSeq as number, kind: "d" as const, doc: d })),
    ...receipts.map((d) => ({ seq: d.seq, kind: "r" as const, doc: d })),
  ].sort((a, b) => a.seq - b.seq);
  const page = all.slice(0, N);
  const hasMore = all.length > N;
  const newCursor = page.length ? page[page.length - 1].seq : cursor;

  const messages = page.filter((i) => i.kind === "m").map((i) => {
    const d = i.doc as (typeof newMsgs)[number];
    return {
      id: String(d._id), conversationId: String(d.conversationId), senderId: String(d.senderId), seq: d.seq, type: d.type,
      ciphertext: d.ciphertext, nonce: d.nonce, signature: d.signature, wrappedKeys: d.wrappedKeys ?? [], mediaRef: d.mediaRef ?? null,
      mediaSizeBytes: d.mediaSizeBytes ?? null, clientMessageId: d.clientMessageId, createdAt: (d as unknown as { createdAt: Date }).createdAt,
    };
  });
  const dels = page.filter((i) => i.kind === "d").map((i) => {
    const d = i.doc as (typeof deletions)[number];
    return { messageId: String(d._id), deletedAt: d.deletedAt };
  });
  const recs = page.filter((i) => i.kind === "r").map((i) => {
    const d = i.doc as (typeof receipts)[number];
    return { messageId: String(d.messageId), readAt: d.readAt };
  });

  const setting = await AppSetting.findOne({ key: "media" }, { version: 1 }).lean();
  // Aktivitás („fent van” jelzéshez): legfeljebb 20 mp-enként frissítjük.
  const now = Date.now();
  if (!user.lastSeenAt || now - user.lastSeenAt.getTime() > 20_000) {
    await Promise.all([User.updateOne({ _id: user._id }, { lastSeenAt: new Date(now) }), Device.updateOne({ userId: user._id, deviceId }, { lastSeenAt: new Date(now) })]);
  }
  return ok({ messages, deletions: dels, receipts: recs, cursor: String(newCursor), hasMore, mediaKeyVersion: setting?.version ?? 0 });
});
