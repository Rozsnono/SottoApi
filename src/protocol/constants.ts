/**
 * Sotto protokoll – állandók. FORRÁS: sotto-api/src/protocol (a sotto-app másolja: `npm run sync:protocol`).
 * Futásidőben csak a `zod`-tól függhet.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** Engedélyezett nyomtatható ASCII jelek a betűk és számok mellett (szóköz és vezérlő karakter tilos). */
export const USERNAME_SYMBOLS = "._-!#$%&*+=?@^~";
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const JWT_CLOCK_TOLERANCE_SEC = 60;

export const MAX_IMAGE_CIPHERTEXT_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_CIPHERTEXT_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_DURATION_MS = 60_000; // csak kliensoldali szabály

export const MODERATION_GRANT_TTL_SEC = 24 * 60 * 60;
export const ACCOUNT_PURGE_DAYS = 30;
export const AUDIT_RETENTION_SEC = 30 * 24 * 60 * 60;

export const KDF_ID = "hkdf-sha256-v1" as const;

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL"
  | "BLOCKED"
  | "CONVERSATION_ARCHIVED"
  | "DEVICE_LIST_CHANGED"
  | "GRANT_EXPIRED"
  | "ACCOUNT_SUSPENDED"
  | "MEDIA_NOT_CONFIGURED";

/** Egységes válasz-boríték. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiFail = { ok: false; error: { code: ErrorCode; message: string } };
export type ApiResponse<T> = ApiOk<T> | ApiFail;

/** Üzenet- és jelentés-korlátok. */
export const MAX_TEXT_CIPHERTEXT_CHARS = 100_000;
export const MAX_WRAPPED_KEYS = 64;
export const MESSAGE_RATE = { perMinute: 10, burst: 5, burstWindowSec: 5 } as const;
export const SYNC_PAGE_SIZE = 100;
export const REPORT_REASONS = ["harassment", "spam", "illegal", "other"] as const;
/** A `wrappedKeys` deviceId-ja az identitáskulcsra csomagolt példányhoz: `identity:<userId>`. */
export const identityRecipientId = (userId: string) => `identity:${userId}`;
