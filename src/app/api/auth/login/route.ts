import { connectDb } from "@/lib/db";
import { clientIp, handle, ok, readBody, userAgent, ApiError } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { LoginBodySchema, normalizeUsername } from "@/protocol/schemas";
import { Device, User } from "@/models";
import { dummyVerify, verifyPassword } from "@/lib/auth/password";
import { issueTokens } from "@/lib/auth/sessions";
import { publicUser } from "@/lib/auth/users";
import { audit } from "@/lib/audit";

/** Belépés. Hibás adatoknál általános üzenet (nem árulja el, hogy a név vagy a jelszó volt rossz). */
export const POST = handle(async (req) => {
  const ip = clientIp(req);
  const body = await readBody(req, LoginBodySchema);
  const usernameNormalized = normalizeUsername(body.username);
  await enforce(`login:ip:${ip}`, RULES.login);
  await enforce(`login:acct:${usernameNormalized}`, RULES.login);
  await connectDb();

  const user = await User.findOne({ usernameNormalized });
  const valid = user ? await verifyPassword(body.password, user.passwordHash) : (await dummyVerify(body.password), false);
  if (!user || !valid) {
    await audit({ actorType: "user", action: "auth.login_failed", ip, userAgent: userAgent(req) });
    throw new ApiError("UNAUTHORIZED", "Hibás adatok. Próbáld újra.");
  }
  if (user.status === "suspended") throw new ApiError("ACCOUNT_SUSPENDED", "A fiók fel van függesztve.");
  if (user.status === "purged") throw new ApiError("UNAUTHORIZED", "Hibás adatok. Próbáld újra.");

  const clash = await Device.findOne({ deviceId: body.device.deviceId, userId: { $ne: user._id } }, { _id: 1 }).lean();
  if (clash) throw new ApiError("CONFLICT", "Ez az eszköz már használatban van.");
  const existing = await Device.findOne({ userId: user._id, deviceId: body.device.deviceId });
  if (existing?.revokedAt) throw new ApiError("FORBIDDEN", "Ezt az eszközt visszavonták. Lépj be új eszközként.");
  if (existing) {
    existing.deviceName = body.device.deviceName;
    existing.devicePublicKey = body.device.devicePublicKey;
    existing.lastSeenAt = new Date();
    await existing.save();
  } else {
    await Device.create({
      userId: user._id,
      deviceId: body.device.deviceId,
      deviceName: body.device.deviceName,
      devicePublicKey: body.device.devicePublicKey,
      lastSeenAt: new Date(),
    });
  }
  const tokens = await issueTokens(String(user._id), body.device.deviceId, new Date());
  await audit({ actorType: "user", actorId: String(user._id), action: "auth.login", ip, userAgent: userAgent(req) });
  return ok({ user: publicUser(user), tokens });
});
