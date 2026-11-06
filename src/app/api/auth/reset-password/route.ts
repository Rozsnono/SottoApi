import { connectDb } from "@/lib/db";
import { clientIp, handle, ok, readBody, userAgent, ApiError } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { ResetPasswordBodySchema, normalizeUsername } from "@/protocol/schemas";
import { User } from "@/models";
import { hashPassword } from "@/lib/auth/password";
import { safeEqual, sha256Hex } from "@/lib/crypto/server";
import { revokeAllSessions } from "@/lib/auth/sessions";
import { audit } from "@/lib/audit";

/**
 * Jelszó-visszaállítás a Recovery Code-ból levezetett verifikátorral. Nem árulja el, hogy létezik-e a felhasználó.
 * Az üzenetelőzmények érintetlenek (a kulcsanyag változatlan); minden munkamenet visszavonásra kerül.
 */
export const POST = handle(async (req) => {
  const ip = clientIp(req);
  const body = await readBody(req, ResetPasswordBodySchema);
  const un = normalizeUsername(body.username);
  await enforce(`reset:ip:${ip}`, RULES.resetPassword);
  await enforce(`reset:acct:${un}`, RULES.resetPassword);
  await connectDb();
  const user = await User.findOne({ usernameNormalized: un });
  const presented = sha256Hex(Buffer.from(body.recoveryVerifier, "base64"));
  const match = safeEqual(presented, user?.recoveryVerifierHash ?? "0".repeat(64));
  if (!user || !match || user.status === "purged") {
    await audit({ actorType: "user", action: "auth.reset_failed", ip, userAgent: userAgent(req) });
    throw new ApiError("UNAUTHORIZED", "Hibás adatok. Próbáld újra.");
  }
  user.passwordHash = await hashPassword(body.newPassword);
  await user.save();
  await revokeAllSessions(String(user._id));
  await audit({ actorType: "user", actorId: String(user._id), action: "auth.reset_password", ip, userAgent: userAgent(req) });
  return ok({ reset: true });
});
