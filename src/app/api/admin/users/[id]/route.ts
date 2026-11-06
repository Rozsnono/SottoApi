import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ApiError, ok } from "@/lib/http";
import { Block, Device, Friendship, Report, User } from "@/models";

/** Felhasználó részletei – metaadat és darabszámok; üzenet- vagy ismerős-tartalom nincs. */
export const GET = adminRoute(async (_req, ctx: RouteContext<"/api/admin/users/[id]">) => {
  const { id } = await ctx.params;
  if (!isValidObjectId(id)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  const user = await User.findById(id).lean();
  if (!user) throw new ApiError("NOT_FOUND", "Nem található.");
  const [devices, friends, blocks, reportsAgainst] = await Promise.all([
    Device.find({ userId: id }).sort({ createdAt: -1 }).lean(),
    Friendship.countDocuments({ status: "accepted", $or: [{ requesterId: id }, { addresseeId: id }] }),
    Block.countDocuments({ blockerId: id }),
    Report.countDocuments({ targetUserId: id }),
  ]);
  return ok({
    id: String(user._id),
    username: user.username,
    status: user.status,
    suspendedReason: user.suspendedReason ?? null,
    createdAt: (user as unknown as { createdAt: Date }).createdAt,
    lastSeenAt: user.lastSeenAt ?? null,
    deletedAt: user.deletedAt ?? null,
    counts: { friends, blocks, reportsAgainst },
    devices: devices.map((d) => ({ deviceName: d.deviceName, lastSeenAt: d.lastSeenAt ?? null, revoked: !!d.revokedAt })),
  });
});
