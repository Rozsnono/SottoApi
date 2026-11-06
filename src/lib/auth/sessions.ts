/**
 * Munkamenetek: refresh token forgatás újrafelhasználás-észleléssel, eszköz-/fiókellenőrzés a kérésekben.
 * A refresh token csak hash-elve tárolt; ha egy már felhasznált token újra megjelenik, a teljes család visszavonásra kerül.
 */
import { connectDb } from "../db";
import { Device, RefreshToken, User } from "@/models";
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from "@/protocol/constants";
import { signAccessToken, verifyAccessToken } from "./jwt";
import { randomToken, sha256Hex } from "../crypto/server";
import { ApiError } from "../http";
import { audit } from "../audit";
import type { HydratedDocument } from "mongoose";
import { randomUUID } from "node:crypto";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueTokens(userId: string, deviceId: string, authTime: Date, familyId?: string): Promise<TokenPair> {
  const refreshToken = randomToken(32);
  await RefreshToken.create({
    userId,
    deviceId,
    familyId: familyId ?? randomUUID(),
    tokenHash: sha256Hex(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    authTime,
  });
  const accessToken = await signAccessToken({ userId, deviceId, authTime: Math.floor(authTime.getTime() / 1000) });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SEC };
}

export async function rotateRefreshToken(refreshToken: string, ctx: { ip?: string; userAgent?: string }): Promise<TokenPair> {
  await connectDb();
  const hash = sha256Hex(refreshToken);
  const doc = await RefreshToken.findOne({ tokenHash: hash });
  if (!doc || doc.revokedAt || doc.expiresAt.getTime() < Date.now()) throw new ApiError("UNAUTHORIZED", "Lépj be újra.");
  // Atomikus „felhasználás”: csak az első beváltás nyer.
  const claimed = await RefreshToken.findOneAndUpdate({ _id: doc._id, usedAt: { $exists: false } }, { usedAt: new Date() });
  if (!claimed) {
    await RefreshToken.updateMany({ familyId: doc.familyId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
    await audit({ actorType: "system", actorId: String(doc.userId), action: "auth.refresh_reuse_detected", ip: ctx.ip, userAgent: ctx.userAgent, meta: { familyId: doc.familyId } });
    throw new ApiError("UNAUTHORIZED", "Lépj be újra.");
  }
  const user = await User.findById(doc.userId);
  const device = await Device.findOne({ userId: doc.userId, deviceId: doc.deviceId });
  if (!user || user.status !== "active" || !device || device.revokedAt) throw new ApiError("UNAUTHORIZED", "Lépj be újra.");
  return issueTokens(String(doc.userId), doc.deviceId, doc.authTime, doc.familyId);
}

export async function revokeDeviceSessions(userId: string, deviceId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, deviceId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}
export async function revokeAllSessions(userId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}

export interface AuthContext {
  user: HydratedDocument<import("mongoose").InferSchemaType<typeof User.schema>>;
  deviceId: string;
  authTime: number;
}

/**
 * Hitelesített kérés: Bearer token → érvényes aláírás → aktív fiók → nem visszavont eszköz.
 * A `allowPending` a törlésre váró fiók visszaállításához kell.
 */
export async function requireUser(req: Request, opts: { allowPending?: boolean } = {}): Promise<AuthContext> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(h);
  const claims = m ? await verifyAccessToken(m[1]) : null;
  if (!claims) throw new ApiError("UNAUTHORIZED", "Lépj be újra.");
  await connectDb();
  const user = await User.findById(claims.userId);
  if (!user) throw new ApiError("UNAUTHORIZED", "Lépj be újra.");
  if (user.status === "suspended") throw new ApiError("ACCOUNT_SUSPENDED", "A fiók fel van függesztve.");
  if (user.status === "purged") throw new ApiError("UNAUTHORIZED", "Lépj be újra.");
  if (user.status === "deleted_pending" && !opts.allowPending) throw new ApiError("FORBIDDEN", "A fiók törlésre vár.");
  const device = await Device.findOne({ userId: user._id, deviceId: claims.deviceId });
  if (!device || device.revokedAt) throw new ApiError("UNAUTHORIZED", "Ezt az eszközt visszavonták. Lépj be újra.");
  return { user, deviceId: claims.deviceId, authTime: claims.authTime };
}

/** Minden munkamenet visszavonása az adott eszköz kivételével (pl. jelszócsere után a többi eszköz kilép). */
export async function revokeAllSessionsExceptDevice(userId: string, keepDeviceId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, deviceId: { $ne: keepDeviceId }, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}
