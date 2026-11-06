import { connectDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Device, User } from "@/models";
import { requireConversation } from "@/lib/social/helpers";

/**
 * A beszélgetés két résztvevőjének AKTUÁLIS (nem visszavont) eszközei és identitás-kulcsai – ezekre kell csomagolni
 * az üzenetkulcsot (`identity:<userId>` + minden eszköz). Eltérő lista esetén az üzenetküldés 409 DEVICE_LIST_CHANGED-et ad.
 */
export const GET = handle(async (req, ctx: RouteContext<"/api/conversations/[id]/devices">) => {
  const { user } = await requireUser(req);
  const { id } = await ctx.params;
  const { conv } = await requireConversation(id, user._id);
  await connectDb();
  const [devices, users] = await Promise.all([
    Device.find({ userId: { $in: conv.participants }, revokedAt: { $exists: false } }, { userId: 1, deviceId: 1, devicePublicKey: 1 }).lean(),
    User.find({ _id: { $in: conv.participants } }, { identityPublicKey: 1, status: 1 }).lean(),
  ]);
  return ok({
    archived: conv.archived,
    devices: devices.map((d) => ({ userId: String(d.userId), deviceId: d.deviceId, devicePublicKey: d.devicePublicKey })),
    identities: users.map((u) => ({ userId: String(u._id), identityPublicKey: u.identityPublicKey, available: u.status === "active" })),
  });
});
