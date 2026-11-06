import { connectDb } from "@/lib/db";
import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Device } from "@/models";

/** A saját eszközök listája (Beállítások → Eszközök). */
export const GET = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  await connectDb();
  const ds = await Device.find({ userId: user._id }).sort({ createdAt: -1 }).lean();
  return ok({ items: ds.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName, lastSeenAt: d.lastSeenAt ?? null, revoked: !!d.revokedAt, isCurrent: d.deviceId === deviceId })) });
});
