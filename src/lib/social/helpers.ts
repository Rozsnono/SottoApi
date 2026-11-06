/**
 * Közös társas segédek: ismeretség-állapotgép, tiltás-ellenőrzés, beszélgetés-hozzáférés.
 * Állapotok: none → pending → accepted → archived → (újra) pending/accepted; tiltás bármely állapotból archiválja.
 */
import { Types } from "mongoose";
import { Block, Conversation, Friendship, User } from "@/models";
import { ApiError } from "../http";

export const pairKey = (a: string | Types.ObjectId, b: string | Types.ObjectId): string => [String(a), String(b)].sort().join(":");

/** Bármelyik irányú tiltás? (A kliensnek sosem derül ki, melyik fél tiltott.) */
export async function isBlockedEitherWay(a: string | Types.ObjectId, b: string | Types.ObjectId): Promise<boolean> {
  return !!(await Block.exists({ $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }));
}

export async function getFriendship(a: string | Types.ObjectId, b: string | Types.ObjectId) {
  return Friendship.findOne({ pairKey: pairKey(a, b) });
}

export async function areFriends(a: string | Types.ObjectId, b: string | Types.ObjectId): Promise<boolean> {
  return !!(await Friendship.exists({ pairKey: pairKey(a, b), status: "accepted" }));
}

/** Létrehozza vagy újraaktiválja a beszélgetést (újra-barátság esetén ugyanaz a beszélgetés él tovább). */
export async function ensureConversation(a: string | Types.ObjectId, b: string | Types.ObjectId) {
  const key = pairKey(a, b);
  const participants = [String(a), String(b)].sort().map((x) => new Types.ObjectId(x));
  return Conversation.findOneAndUpdate({ participantsKey: key }, { $set: { archived: false }, $setOnInsert: { participants, participantsKey: key } }, { upsert: true, returnDocument: "after" });
}

export async function archiveConversation(a: string | Types.ObjectId, b: string | Types.ObjectId): Promise<void> {
  await Conversation.updateOne({ participantsKey: pairKey(a, b) }, { archived: true });
}

/** Beszélgetés betöltése + tagság ellenőrzése (nem tag: 404, hogy ne derüljön ki a létezése). */
export async function requireConversation(conversationId: string, userId: string | Types.ObjectId) {
  if (!Types.ObjectId.isValid(conversationId)) throw new ApiError("NOT_FOUND", "Nem található.");
  const conv = await Conversation.findById(conversationId);
  if (!conv || !conv.participants.some((p) => String(p) === String(userId))) throw new ApiError("NOT_FOUND", "Nem található.");
  const otherId = conv.participants.find((p) => String(p) !== String(userId))!;
  return { conv, otherId };
}

/** A másik fél elérhetősége: törlésre váró/törölt/felfüggesztett fiók „Elérhetetlen felhasználó”. */
export async function otherUserAvailable(otherId: string | Types.ObjectId): Promise<boolean> {
  const u = await User.findById(otherId, { status: 1 }).lean();
  return !!u && u.status === "active";
}
