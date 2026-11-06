import { connectDb } from "@/lib/db";
import { ApiError, clientIp, handle, ok, readBody, userAgent } from "@/lib/http";
import { enforce } from "@/lib/ratelimit";
import { requireUser } from "@/lib/auth/sessions";
import { ReportBodySchema } from "@/protocol/schemas";
import { MODERATION_GRANT_TTL_SEC } from "@/protocol/constants";
import { Message, Report } from "@/models";
import { requireConversation } from "@/lib/social/helpers";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";

/**
 * Üzenet jelentése. A jelentő önkéntesen mellékelhet egy, a moderációs PUBLIKUS kulcsra újracsomagolt üzenetkulcsot (grant):
 * ez 24 óráig érvényes, egyetlen üzenetre szól, és sosem hosszabbodik csendben. Csak bejövő (nem saját) üzenet jelenthető.
 */
export const POST = handle(async (req) => {
  const { user } = await requireUser(req);
  await enforce(`report:${user._id}`, { limit: 10, windowSec: 3600 });
  const body = await readBody(req, ReportBodySchema, 20_000);
  await connectDb();
  const msg = await Message.findById(body.messageId, { conversationId: 1, senderId: 1, deletedAt: 1 }).lean();
  if (!msg) throw new ApiError("NOT_FOUND", "Nem található.");
  await requireConversation(String(msg.conversationId), user._id);
  if (String(msg.senderId) === String(user._id)) throw new ApiError("FORBIDDEN", "A saját üzenet nem jelenthető.");
  if (msg.deletedAt) throw new ApiError("NOT_FOUND", "Az üzenet már nem elérhető.");

  const grantEnabled = !!getEnv().MODERATION_PUBLIC_KEY;
  const grant = body.grant && grantEnabled ? { ...body.grant, expiresAt: new Date(Date.now() + MODERATION_GRANT_TTL_SEC * 1000) } : undefined;

  const existing = await Report.findOne({ reporterId: user._id, targetMessageId: msg._id, status: "open" });
  if (existing) {
    if (grant && !existing.moderationGrant) {
      existing.moderationGrant = grant;
      await existing.save();
    }
    return ok({ id: String(existing._id), duplicate: true, grantAccepted: !!existing.moderationGrant });
  }
  const r = await Report.create({ reporterId: user._id, targetMessageId: msg._id, targetUserId: msg.senderId, reason: body.reason, note: body.note, moderationGrant: grant });
  await audit({ actorType: "user", actorId: String(user._id), action: "report.create", target: String(r._id), ip: clientIp(req), userAgent: userAgent(req), meta: { grant: !!grant } });
  return ok({ id: String(r._id), grantAccepted: !!grant }, { status: 201 });
});
