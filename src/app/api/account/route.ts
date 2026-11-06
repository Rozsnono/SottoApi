import { connectDb } from "@/lib/db";
import { ApiError, clientIp, handle, ok, readBody, userAgent } from "@/lib/http";
import { requireUser, revokeAllSessions } from "@/lib/auth/sessions";
import { verifyPassword } from "@/lib/auth/password";
import { DeleteAccountBodySchema } from "@/protocol/schemas";
import { Device } from "@/models";
import { enforce, RULES } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { ACCOUNT_PURGE_DAYS } from "@/protocol/constants";

/**
 * Fiók törlése (soft delete, jelszóval megerősítve): `deleted_pending`, minden munkamenet és eszköz visszavonva,
 * a felhasználó eltűnik a keresésből, a másik fél „Elérhetetlen felhasználó”-t lát. 30 nap múlva a purge cron véglegesíti.
 */
export const DELETE = handle(async (req) => {
  const { user } = await requireUser(req);
  await enforce(`acctdel:${user._id}`, RULES.resetPassword);
  const { password } = await readBody(req, DeleteAccountBodySchema);
  if (!(await verifyPassword(password, user.passwordHash))) throw new ApiError("UNAUTHORIZED", "Hibás jelszó.");
  await connectDb();
  user.status = "deleted_pending";
  user.deletedAt = new Date();
  await user.save();
  await revokeAllSessions(String(user._id));
  await Device.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date(), $unset: { pushToken: 1 } });
  await audit({ actorType: "user", actorId: String(user._id), action: "account.delete_requested", ip: clientIp(req), userAgent: userAgent(req) });
  return ok({ status: user.status, purgeInDays: ACCOUNT_PURGE_DAYS });
});
