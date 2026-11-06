import { connectDb } from "@/lib/db";
import { ApiError, clientIp, handle, ok, readBody, userAgent } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { RestoreAccountBodySchema, normalizeUsername } from "@/protocol/schemas";
import { User } from "@/models";
import { dummyVerify, verifyPassword } from "@/lib/auth/password";
import { safeEqual, sha256Hex } from "@/lib/crypto/server";
import { ACCOUNT_PURGE_DAYS } from "@/protocol/constants";
import { audit } from "@/lib/audit";

/**
 * Törlésre váró fiók visszaállítása a 30 napos ablakon belül: jelszó ÉS Recovery Code verifikátor kell.
 * A munkamenetek visszavonva maradnak; a visszaállítás után új belépés (új eszközként) szükséges.
 */
export const POST = handle(async (req) => {
  const ip = clientIp(req);
  const body = await readBody(req, RestoreAccountBodySchema);
  const un = normalizeUsername(body.username);
  await enforce(`restore:ip:${ip}`, RULES.resetPassword);
  await enforce(`restore:acct:${un}`, RULES.resetPassword);
  await connectDb();
  const user = await User.findOne({ usernameNormalized: un });
  const pwOk = user ? await verifyPassword(body.password, user.passwordHash) : (await dummyVerify(body.password), false);
  const verifierOk = safeEqual(sha256Hex(Buffer.from(body.recoveryVerifier, "base64")), user?.recoveryVerifierHash ?? "0".repeat(64));
  const inWindow = !!user?.deletedAt && Date.now() - user.deletedAt.getTime() < ACCOUNT_PURGE_DAYS * 86_400_000;
  if (!user || !pwOk || !verifierOk || user.status !== "deleted_pending" || !inWindow) {
    await audit({ actorType: "user", action: "account.restore_failed", ip, userAgent: userAgent(req) });
    throw new ApiError("UNAUTHORIZED", "Hibás adatok. Próbáld újra.");
  }
  user.status = "active";
  user.deletedAt = undefined;
  await user.save();
  await audit({ actorType: "user", actorId: String(user._id), action: "account.restored", ip, userAgent: userAgent(req) });
  return ok({ restored: true });
});
