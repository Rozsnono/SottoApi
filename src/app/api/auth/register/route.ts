import { connectDb } from "@/lib/db";
import { clientIp, handle, ok, readBody, userAgent, ApiError } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { RegisterBodySchema, normalizeUsername } from "@/protocol/schemas";
import { Device, User } from "@/models";
import { hashPassword } from "@/lib/auth/password";
import { sha256Hex } from "@/lib/crypto/server";
import { issueTokens } from "@/lib/auth/sessions";
import { isDuplicateKeyError, publicUser } from "@/lib/auth/users";
import { audit } from "@/lib/audit";

/**
 * Regisztráció: felhasználónév + jelszó (nincs e-mail). A kulcsgenerálás, a Recovery Code és a titkosított
 * mentés a KLIENSEN készül; a szerver csak a publikus kulcsokat, a titkosított mentést és a verifikátor hash-ét tárolja.
 */
export const POST = handle(async (req) => {
  const ip = clientIp(req);
  await enforce(`register:${ip}`, RULES.register);
  const body = await readBody(req, RegisterBodySchema);
  await connectDb();

  const usernameNormalized = normalizeUsername(body.username);
  // A foglaltságot általános üzenettel jelezzük (nem árulunk el mást); a versenyhelyzetet az egyedi index fogja meg.
  if (await User.exists({ usernameNormalized })) throw new ApiError("CONFLICT", "Ez a név nem használható.");

  let user;
  try {
    user = await User.create({
      username: body.username,
      usernameNormalized,
      passwordHash: await hashPassword(body.password),
      identityPublicKey: body.identityPublicKey,
      identitySigningPublicKey: body.identitySigningPublicKey,
      encryptedKeyBackup: body.backup.encryptedKeyBackup,
      backupNonce: body.backup.backupNonce,
      kdfParams: body.backup.kdfParams,
      recoveryVerifierHash: sha256Hex(Buffer.from(body.recoveryVerifier, "base64")),
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) throw new ApiError("CONFLICT", "Ez a név nem használható.");
    throw e;
  }

  if (await Device.exists({ deviceId: body.device.deviceId })) {
    await User.deleteOne({ _id: user._id });
    throw new ApiError("CONFLICT", "Ez az eszköz már használatban van.");
  }
  await Device.create({
    userId: user._id,
    deviceId: body.device.deviceId,
    deviceName: body.device.deviceName,
    devicePublicKey: body.device.devicePublicKey,
    lastSeenAt: new Date(),
  });
  const tokens = await issueTokens(String(user._id), body.device.deviceId, new Date());
  await audit({ actorType: "user", actorId: String(user._id), action: "auth.register", ip, userAgent: userAgent(req) });
  return ok({ user: publicUser(user), tokens }, { status: 201 });
});
