import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok, clientIp, userAgent } from "@/lib/http";
import { Message, Report, User } from "@/models";
import { audit } from "@/lib/audit";

/**
 * Jelentett tartalom TITKOSÍTOTT formában + a grant boríték. A visszafejtés a böngészőben történik az admin által
 * megadott moderációs privát kulccsal (az sosem jut el a szerverre). Csak érvényes (nem lejárt) grant esetén adható ki;
 * minden megtekintés auditálódik. A grant sosem hosszabbodik meg csendben.
 */
export const GET = adminRoute(async (req, ctx: RouteContext<"/api/admin/reports/[id]/content">, admin) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const r = await Report.findById(id).lean();
  if (!r) throw new ApiError("NOT_FOUND", "Nem található.");
  if (!r.moderationGrant || !r.targetMessageId) throw new ApiError("NOT_FOUND", "A jelentő nem osztott meg tartalmat.");
  if (!r.moderationGrant.expiresAt || r.moderationGrant.expiresAt.getTime() <= Date.now()) {
    await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.report_content_denied_expired", target: id, ip: clientIp(req), userAgent: userAgent(req) });
    throw new ApiError("GRANT_EXPIRED", "A hozzáférés lejárt.");
  }
  const msg = await Message.findById(r.targetMessageId).lean();
  if (!msg || msg.deletedAt || !msg.ciphertext) throw new ApiError("NOT_FOUND", "Az üzenet már nem elérhető.");
  const sender = await User.findById(msg.senderId, { identitySigningPublicKey: 1, username: 1 }).lean();
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.report_content_view", target: id, ip: clientIp(req), userAgent: userAgent(req) });
  return ok({
    message: {
      type: msg.type,
      ciphertext: msg.ciphertext,
      nonce: msg.nonce,
      signature: msg.signature,
      mediaRef: msg.mediaRef ?? null,
      conversationId: String(msg.conversationId),
      clientMessageId: msg.clientMessageId,
      wrappedKeysHashInput: msg.wrappedKeys ?? [],
    },
    senderSigningPublicKey: sender?.identitySigningPublicKey ?? null,
    grant: {
      wrappedKey: r.moderationGrant.wrappedKey,
      ephemeralPublicKey: r.moderationGrant.ephemeralPublicKey,
      wrapNonce: r.moderationGrant.wrapNonce,
      expiresAt: r.moderationGrant.expiresAt,
    },
  });
});
