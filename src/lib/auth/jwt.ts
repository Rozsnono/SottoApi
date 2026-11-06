/** Hozzáférési token (JWT HS256, 15 perc, ±60 mp óraeltérés-tűrés). */
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "../env";
import { ACCESS_TOKEN_TTL_SEC, JWT_CLOCK_TOLERANCE_SEC } from "@/protocol/constants";

const key = () => new TextEncoder().encode(getEnv().JWT_SECRET);

export interface AccessClaims {
  userId: string;
  deviceId: string;
  /** A jelszavas hitelesítés ideje (epoch mp) – friss újra-hitelesítéshez. */
  authTime: number;
}

export async function signAccessToken(c: AccessClaims): Promise<string> {
  return new SignJWT({ did: c.deviceId, at: c.authTime })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.userId)
    .setIssuer("sotto")
    .setAudience("sotto-api")
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(key());
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
      issuer: "sotto",
      audience: "sotto-api",
      clockTolerance: JWT_CLOCK_TOLERANCE_SEC,
    });
    if (!payload.sub || typeof payload.did !== "string" || typeof payload.at !== "number") return null;
    return { userId: payload.sub, deviceId: payload.did, authTime: payload.at };
  } catch {
    return null;
  }
}
