import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { MediaUpload, Message, Report } from "@/models";
import { requireConversation } from "@/lib/social/helpers";
import { nextSeq } from "@/lib/seq";
import { getMediaAdapter } from "@/lib/media/settings";
import { logger } from "@/lib/logger";

/**
 * Üzenet törlése mindkét oldalon – csak a FELADÓ teheti. A törlés tombstone-t hagy (tartalom és kulcsok nélkül),
 * hogy a szinkron a kliensekhez eljuttassa; a médiafájl a szerveres kulccsal törlődik. Nyitott jelentés alatt álló üzenet nem törölhető.
 * A címzett „elrejtése” csak kliensoldali (nincs szerveroldali hatás).
 */
export const DELETE = handle(async (req, ctx: RouteContext<"/api/messages/[id]">) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const msg = await Message.findById(id);
  if (!msg) throw new ApiError("NOT_FOUND", "Nem található.");
  await requireConversation(String(msg.conversationId), user._id);
  if (String(msg.senderId) !== String(user._id)) throw new ApiError("FORBIDDEN", "Csak a feladó törölheti az üzenetet mindenkinek.");
  if (msg.deletedAt) return ok({ deleted: true });
  if (await Report.exists({ targetMessageId: msg._id, status: "open" })) throw new ApiError("CONFLICT", "Ez az üzenet jelentés alatt áll, jelenleg nem törölhető.");

  const mediaRef = msg.mediaRef;
  msg.deletedAt = new Date();
  msg.deletedSeq = await nextSeq();
  msg.ciphertext = undefined;
  msg.nonce = undefined;
  msg.signature = undefined;
  msg.wrappedKeys = undefined;
  msg.mediaRef = undefined;
  await msg.save();

  if (mediaRef) {
    try {
      await (await getMediaAdapter()).delete(mediaRef);
      await MediaUpload.deleteOne({ ref: mediaRef });
    } catch (e) {
      // Nem blokkoljuk a törlést; a takarító cron újra megpróbálja (a MediaUpload rekord megmarad, referenced=false).
      await MediaUpload.updateOne({ ref: mediaRef }, { referenced: false });
      logger.warn("Médiafájl törlése sikertelen, a takarítás újrapróbálja", { err: String(e) });
    }
  }
  return ok({ deleted: true });
});
