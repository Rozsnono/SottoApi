import { connectDb } from "@/lib/db";
import { ApiError, handle, ok, clientIp, userAgent } from "@/lib/http";
import { requireUser, revokeDeviceSessions } from "@/lib/auth/sessions";
import { Device } from "@/models";
import { audit } from "@/lib/audit";

/** Másik eszköz visszavonása: nem kap több üzenetet/kulcsot, munkamenetei megszűnnek. A saját eszköz kijelentkezéssel zárható. */
export const DELETE = handle(async (req, ctx: RouteContext<"/api/devices/[deviceId]">) => {
  const { user, deviceId: current } = await requireUser(req);
  const { deviceId } = await ctx.params;
  if (deviceId === current) throw new ApiError("VALIDATION_ERROR", "A saját eszközt a kijelentkezéssel zárd le.");
  await connectDb();
  const d = await Device.findOne({ userId: user._id, deviceId });
  if (!d) throw new ApiError("NOT_FOUND", "Nem található.");
  if (!d.revokedAt) {
    d.revokedAt = new Date();
    d.pushToken = undefined;
    await d.save();
    await revokeDeviceSessions(String(user._id), deviceId);
    await audit({ actorType: "user", actorId: String(user._id), action: "device.revoke", ip: clientIp(req), userAgent: userAgent(req) });
  }
  return ok({ revoked: true });
});
