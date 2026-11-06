import { connectDb } from "@/lib/db";
import { ApiError, clientIp, handle, ok, readBody, userAgent } from "@/lib/http";
import { requireUser, revokeAllSessionsExceptDevice } from "@/lib/auth/sessions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ChangePasswordBodySchema } from "@/protocol/schemas";
import { enforce, RULES } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

/**
 * Jelszócsere a jelenlegi jelszóval megerősítve. Siker után a többi eszköz munkamenete visszavonódik,
 * az aktuális eszköz belépve marad. A jelszavak sosem kerülnek naplóba.
 */
export const POST = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  await enforce(`chpw:${user._id}`, RULES.resetPassword);
  const { currentPassword, newPassword } = await readBody(req, ChangePasswordBodySchema);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new ApiError("UNAUTHORIZED", "Hibás jelszó.");
  if (currentPassword === newPassword) throw new ApiError("VALIDATION_ERROR", "Az új jelszó nem egyezhet a réginél.");
  await connectDb();
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAllSessionsExceptDevice(String(user._id), deviceId);
  await audit({ actorType: "user", actorId: String(user._id), action: "account.password_change", ip: clientIp(req), userAgent: userAgent(req) });
  return ok({ changed: true });
});
