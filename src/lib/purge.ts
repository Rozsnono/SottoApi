/**
 * Időzített takarítás (idempotens, folytatható):
 *  1) 30 napnál régebben törlésre váró fiókok végleges törlése (saját üzenetek, média, receiptek, ismeretségek, eszközök...),
 *  2) hivatkozatlan, 24 óránál régebbi média eltávolítása a médiatárból.
 * Részleges hiba esetén a fiók nem lesz `purged`; a következő futás újrapróbálja.
 */
import { Conversation, Device, Friendship, Block, ContactPref, ConversationPref, MediaUpload, Message, MessageReceipt, RefreshToken, User } from "@/models";
import { ACCOUNT_PURGE_DAYS } from "@/protocol/constants";
import { getMediaAdapter } from "./media/settings";
import { logger } from "./logger";
import { audit } from "./audit";

export interface PurgeStats {
  purged: number;
  failed: number;
  mediaGc: number;
}

/**
 * Egy fiók végleges törlése (a purge cron és az admin „Törlés” közös magja). Idempotens, folytatható:
 * hiba esetén kivételt dob és a fiók nem lesz `purged`. Az utolsó lépés jelöli késznek.
 */
export async function purgeUser(userId: string): Promise<void> {
  // A felhasználó még hivatkozatlan (feltöltött, de el nem küldött) médiája is törlődik.
  const orphans = await MediaUpload.find({ ownerId: userId, referenced: false }, { ref: 1 }).lean();
  if (orphans.length) {
    const adapter = await getMediaAdapter();
    for (const o of orphans) await adapter.delete(o.ref);
    await MediaUpload.deleteMany({ _id: { $in: orphans.map((o) => o._id) } });
  }
  const mediaMsgs = await Message.find({ senderId: userId, mediaRef: { $exists: true } }, { mediaRef: 1 }).lean();
  if (mediaMsgs.length) {
    const adapter = await getMediaAdapter(); // hiba → a fiók ebben a körben kimarad
    for (const m of mediaMsgs) if (m.mediaRef) await adapter.delete(m.mediaRef);
    await MediaUpload.deleteMany({ ref: { $in: mediaMsgs.flatMap((m) => (m.mediaRef ? [m.mediaRef] : [])) } });
  }
  const own = await Message.find({ senderId: userId }, { _id: 1 }).lean();
  await MessageReceipt.deleteMany({ $or: [{ userId }, { messageId: { $in: own.map((m) => m._id) } }] });
  await Message.deleteMany({ senderId: userId });
  await Promise.all([
    Friendship.deleteMany({ $or: [{ requesterId: userId }, { addresseeId: userId }] }),
    Block.deleteMany({ $or: [{ blockerId: userId }, { blockedId: userId }] }),
    ContactPref.deleteMany({ $or: [{ userId }, { contactUserId: userId }] }),
    ConversationPref.deleteMany({ userId }),
    Device.deleteMany({ userId }),
    RefreshToken.deleteMany({ userId }),
  ]);
  // Beszélgetések: ha a másik fél is megszűnt/nincs, a beszélgetés és maradék üzenetei törölhetők; különben archivált marad.
  const convs = await Conversation.find({ participants: userId }).lean();
  for (const c of convs) {
    const otherId = c.participants.find((p) => String(p) !== userId);
    const other = otherId ? await User.findById(otherId, { status: 1 }).lean() : null;
    if (!other || other.status === "purged") {
      await Message.deleteMany({ conversationId: c._id });
      await Conversation.deleteOne({ _id: c._id });
    } else {
      await Conversation.updateOne({ _id: c._id }, { archived: true });
    }
  }
  // Utolsó lépés: a személyes adatok törlése (ez jelöli késznek a fiókot).
  await User.updateOne(
    { _id: userId },
    { status: "purged", username: `deleted-${userId}`, usernameNormalized: `deleted-${userId}`, passwordHash: "", identityPublicKey: "", identitySigningPublicKey: "", encryptedKeyBackup: "", backupNonce: "", recoveryVerifierHash: "", $unset: { suspendedReason: 1 } },
  );
}

export async function runPurge(now = Date.now()): Promise<PurgeStats> {
  const stats: PurgeStats = { purged: 0, failed: 0, mediaGc: 0 };
  const due = await User.find({ status: "deleted_pending", deletedAt: { $lte: new Date(now - ACCOUNT_PURGE_DAYS * 86_400_000) } }, { _id: 1 }).limit(50).lean();
  for (const u of due) {
    try {
      await purgeUser(String(u._id));
      stats.purged++;
      await audit({ actorType: "system", action: "purge.user", target: String(u._id) });
    } catch (e) {
      stats.failed++;
      logger.error("Fiók végleges törlése sikertelen, a következő futás újrapróbálja", e, { userId: String(u._id) });
    }
  }
  const stale = await MediaUpload.find({ referenced: false, createdAt: { $lte: new Date(now - 24 * 3600 * 1000) } }, { ref: 1 }).limit(200).lean();
  if (stale.length) {
    try {
      const adapter = await getMediaAdapter();
      for (const s of stale) {
        try {
          await adapter.delete(s.ref);
          await MediaUpload.deleteOne({ _id: s._id });
          stats.mediaGc++;
        } catch (e) {
          logger.warn("Hivatkozatlan média törlése sikertelen", { err: String(e) });
        }
      }
    } catch (e) {
      logger.warn("Média takarítás kihagyva (médiatár nem elérhető)", { err: String(e) });
    }
  }
  return stats;
}
