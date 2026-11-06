import { ed25519 } from "@noble/curves/ed25519.js";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok, readBody } from "@/lib/http";
import { enforce } from "@/lib/ratelimit";
import { requireUser } from "@/lib/auth/sessions";
import { SendMessageBodySchema } from "@/protocol/schemas";
import { MAX_IMAGE_CIPHERTEXT_BYTES, MAX_VIDEO_CIPHERTEXT_BYTES, MESSAGE_RATE, identityRecipientId } from "@/protocol/constants";
import { fromB64, messageSignatureInput } from "@/protocol/wrap";
import { Device, MediaUpload, Message, User } from "@/models";
import { areFriends, isBlockedEitherWay, requireConversation } from "@/lib/social/helpers";
import { nextSeq } from "@/lib/seq";
import { getMediaAdapter } from "@/lib/media/settings";
import { notifyNewMessage } from "@/lib/push";
import { logger } from "@/lib/logger";
import { isDuplicateKeyError } from "@/lib/auth/users";

/**
 * Üzenet küldése (csak ciphertext + borítékok). Ellenőrzések: tagság, tiltás (általános BLOCKED), archivált/elérhetetlen
 * beszélgetés, ismeretség, sebességkorlát (10/perc + 5/5 mp), az Ed25519 aláírás, a borítékok teljessége (409 DEVICE_LIST_CHANGED),
 * médiaméret/-létezés. Idempotens a (küldő, clientMessageId) párra.
 */
export const POST = handle(async (req) => {
  const { user } = await requireUser(req);
  const body = await readBody(req, SendMessageBodySchema, 400_000);
  await enforce(`msg:min:${user._id}`, { limit: MESSAGE_RATE.perMinute, windowSec: 60 });
  await enforce(`msg:burst:${user._id}`, { limit: MESSAGE_RATE.burst, windowSec: MESSAGE_RATE.burstWindowSec });
  await connectDb();

  const { conv, otherId } = await requireConversation(body.conversationId, user._id);
  const me = String(user._id);
  if (await isBlockedEitherWay(me, otherId)) throw new ApiError("BLOCKED", "Nem küldhető üzenet.");
  if (conv.archived) throw new ApiError("CONVERSATION_ARCHIVED", "A beszélgetés le van zárva.");
  const other = await User.findById(otherId, { status: 1, username: 1 }).lean();
  if (!other || other.status !== "active") throw new ApiError("CONVERSATION_ARCHIVED", "Elérhetetlen felhasználó.");
  if (!(await areFriends(me, otherId))) throw new ApiError("CONVERSATION_ARCHIVED", "A beszélgetés le van zárva.");

  // Idempotencia: ugyanaz a clientMessageId → a már létező üzenetet adjuk vissza.
  const dup = await Message.findOne({ senderId: user._id, clientMessageId: body.clientMessageId }, { seq: 1, createdAt: 1 }).lean();
  if (dup) return ok({ id: String(dup._id), seq: dup.seq, createdAt: (dup as unknown as { createdAt: Date }).createdAt, duplicate: true });

  // Aláírás: a szerver ellenőrizni tudja (minden bemenet nyilvános), így nem hamisítható az üzenet.
  const sigOk = (() => {
    try {
      return ed25519.verify(
        fromB64(body.signature),
        messageSignatureInput({ conversationId: body.conversationId, clientMessageId: body.clientMessageId, type: body.type, nonce: body.nonce, ciphertext: body.ciphertext, wrappedKeys: body.wrappedKeys }),
        fromB64(user.identitySigningPublicKey),
      );
    } catch {
      return false;
    }
  })();
  if (!sigOk) throw new ApiError("VALIDATION_ERROR", "Érvénytelen aláírás.");

  // Borítékok: pontosan az aktuális eszközlista + identitás-példányok.
  const devices = await Device.find({ userId: { $in: conv.participants }, revokedAt: { $exists: false } }, { deviceId: 1 }).lean();
  const expected = new Set<string>([...devices.map((d) => d.deviceId), ...conv.participants.map((p) => identityRecipientId(String(p)))]);
  const got = body.wrappedKeys.map((w) => w.deviceId);
  if (new Set(got).size !== got.length || got.length !== expected.size || !got.every((g) => expected.has(g))) {
    throw new ApiError("DEVICE_LIST_CHANGED", "Az eszközlista megváltozott. Kérd le újra és csomagolj újra.");
  }

  // Média: létezés + méret ellenőrzése a szerveres kulccsal.
  let mediaSize: number | undefined;
  if (body.mediaRef) {
    const adapter = await getMediaAdapter();
    let info;
    try {
      info = await adapter.info(body.mediaRef);
    } catch (e) {
      logger.error("Média ellenőrzés sikertelen", e);
      throw new ApiError("SERVICE_UNAVAILABLE", "A médiatár átmenetileg nem elérhető.");
    }
    if (!info.exists) throw new ApiError("VALIDATION_ERROR", "A média nem található.");
    const max = body.type === "video" ? MAX_VIDEO_CIPHERTEXT_BYTES : MAX_IMAGE_CIPHERTEXT_BYTES;
    if (info.sizeBytes !== undefined && info.sizeBytes > max) {
      await adapter.delete(body.mediaRef).catch((e) => logger.warn("Túlméretes média törlése sikertelen", { err: String(e) }));
      throw new ApiError("PAYLOAD_TOO_LARGE", "A fájl túl nagy.");
    }
    mediaSize = info.sizeBytes ?? body.mediaSizeBytes;
    const up = await MediaUpload.findOneAndUpdate({ ref: body.mediaRef }, { $setOnInsert: { ref: body.mediaRef, ownerId: user._id } }, { upsert: true, returnDocument: "after" });
    if (up.referenced) throw new ApiError("CONFLICT", "A média már használatban van.");
    if (String(up.ownerId) !== me) throw new ApiError("FORBIDDEN", "Nem engedélyezett.");
    up.referenced = true;
    up.size = mediaSize;
    await up.save();
  }

  let msg;
  try {
    msg = await Message.create({
      conversationId: conv._id,
      senderId: user._id,
      seq: await nextSeq(),
      type: body.type,
      ciphertext: body.ciphertext,
      nonce: body.nonce,
      signature: body.signature,
      wrappedKeys: body.wrappedKeys,
      mediaRef: body.mediaRef ?? undefined,
      mediaSizeBytes: mediaSize,
      clientMessageId: body.clientMessageId,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      const d = await Message.findOne({ senderId: user._id, clientMessageId: body.clientMessageId }, { seq: 1, createdAt: 1 }).lean();
      if (d) return ok({ id: String(d._id), seq: d.seq, createdAt: (d as unknown as { createdAt: Date }).createdAt, duplicate: true });
    }
    throw e;
  }
  // Push: nem blokkolja a választ; a hibát a notifyNewMessage naplózza.
  // Rendszer-eseményre (reakció, téma) nincs push: a tartalom titkosított, a jelzés felesleges zaj.
  if (body.type !== "event") void notifyNewMessage({ recipientId: String(otherId), senderUsername: user.username, conversationId: String(conv._id) });
  return ok({ id: String(msg._id), seq: msg.seq, createdAt: (msg as unknown as { createdAt: Date }).createdAt }, { status: 201 });
});
