import type { Types } from "mongoose";

/** Egy tárolt üzenet (lean) → a szinkron/előzmény válaszban küldött „wire” alak (titkosított, nyílt tartalom nélkül). */
export function toWire(d: {
  _id: Types.ObjectId; conversationId: Types.ObjectId; senderId: Types.ObjectId; seq: number; type: string; ciphertext?: string | null; nonce?: string | null;
  signature?: string | null; wrappedKeys?: unknown[] | null; mediaRef?: string | null; mediaSizeBytes?: number | null; clientMessageId: string;
}) {
  return {
    id: String(d._id), conversationId: String(d.conversationId), senderId: String(d.senderId), seq: d.seq, type: d.type,
    ciphertext: d.ciphertext, nonce: d.nonce, signature: d.signature, wrappedKeys: d.wrappedKeys ?? [], mediaRef: d.mediaRef ?? null,
    mediaSizeBytes: d.mediaSizeBytes ?? null, clientMessageId: d.clientMessageId, createdAt: (d as unknown as { createdAt: Date }).createdAt,
  };
}
