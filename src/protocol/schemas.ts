/**
 * Sotto protokoll – Zod sémák (kliens ↔ szerver). FORRÁS: sotto-api/src/protocol.
 */
import { z } from "zod";
import {
  KDF_ID,
  MAX_TEXT_CIPHERTEXT_CHARS,
  MAX_WRAPPED_KEYS,
  REPORT_REASONS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_SYMBOLS,
} from "./constants";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
const USERNAME_RE = new RegExp(`^[A-Za-z0-9${escapeRe(USERNAME_SYMBOLS)}]{${USERNAME_MIN},${USERNAME_MAX}}$`);

/** Base64 mező, a dekódolt hosszra opcionális ellenőrzéssel. */
export const b64 = (bytes?: number) =>
  z
    .string()
    .min(1)
    .max(200_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Érvénytelen base64")
    .refine((v) => bytes === undefined || Math.floor((v.replace(/=+$/, "").length * 3) / 4) === bytes, `Pontosan ${bytes} bájt szükséges`);

export const UsernameSchema = z.string().regex(USERNAME_RE, "Érvénytelen felhasználónév");
export const PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** Normalizált felhasználónév (egyediséghez): NFKC + kisbetű. */
export function normalizeUsername(u: string): string {
  return u.normalize("NFKC").toLowerCase();
}

export const DeviceInfoSchema = z.object({
  deviceId: z.string().uuid(),
  deviceName: z.string().min(1).max(60),
  /** Eszközönkénti X25519 publikus kulcs (32 bájt). */
  devicePublicKey: b64(32),
});

export const KeyBackupSchema = z.object({
  /** Az identitáskulcs-csomag titkosítva a helyreállító kódból levezetett kulccsal. */
  encryptedKeyBackup: b64(),
  backupNonce: b64(24),
  kdfParams: z.object({ kdf: z.literal(KDF_ID) }),
});

export const RegisterBodySchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  identityPublicKey: b64(32),
  identitySigningPublicKey: b64(32),
  /** HKDF-ből levezetett ellenőrző érték; a szerver csak a hash-ét tárolja. */
  recoveryVerifier: b64(32),
  backup: KeyBackupSchema,
  device: DeviceInfoSchema,
});

export const LoginBodySchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
  device: DeviceInfoSchema,
});

export const RefreshBodySchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const LogoutBodySchema = z.object({ refreshToken: z.string().min(20).max(512).optional() });

export const ResetPasswordBodySchema = z.object({
  username: UsernameSchema,
  recoveryVerifier: b64(32),
  newPassword: PasswordSchema,
});

export const BackupUpdateBodySchema = z.object({
  backup: KeyBackupSchema,
  /** Újra-hitelesítés: jelszó. */
  password: PasswordSchema,
});

export const DiscoverabilitySchema = z.enum(["everyone", "friends_only", "hidden"]);
export const FriendRequestPolicySchema = z.enum(["everyone", "friends_only"]);

/** Admin: média API beállítások. A kulcs mezők írhatók, de sosem olvashatók vissza. */
export const AdminMediaSettingsSchema = z.object({
  baseUrl: z.string().url().max(300),
  folder: z.string().min(1).max(200).regex(/^[A-Za-z0-9_\-./]+$/, "Érvénytelen mappanév").refine((f) => !f.includes(".."), "'..' tilos"),
  /** Üres/hiányzó = a meglévő érték marad. */
  phoneKey: z.string().min(8).max(512).optional(),
  serverKey: z.string().min(8).max(512).optional(),
  /** Telefonos kulcs lejárata (opcionális, tájékoztató). */
  phoneKeyExpiresAt: z.string().datetime().nullable().optional(),
});

/** Boríték egy címzett eszközhöz (vagy `identity:<userId>`-hoz). */
export const WrappedKeySchema = z.object({
  deviceId: z.string().min(1).max(80),
  ephemeralPublicKey: b64(32),
  wrapNonce: b64(24),
  wrappedKey: b64(),
});

const ObjectIdStr = z.string().regex(/^[a-f0-9]{24}$/, "Érvénytelen azonosító");

/** Üzenet küldése (kliens → szerver). A tartalom és a kulcsok titkosítva; az aláírást a szerver ellenőrzi. */
export const SendMessageBodySchema = z
  .object({
    conversationId: ObjectIdStr,
    /** `event`: titkosított rendszer-esemény (reakció, téma) – a szerver nem látja a fajtáját, nincs push. */
    type: z.enum(["text", "image", "video", "audio", "event"]),
    ciphertext: b64(),
    nonce: b64(24),
    /** Ed25519 aláírás a `messageSignatureInput` felett (64 bájt). */
    signature: b64(64),
    wrappedKeys: z.array(WrappedKeySchema).min(2).max(MAX_WRAPPED_KEYS),
    mediaRef: z.string().regex(/^[a-f0-9]{32}$/).nullable().default(null),
    mediaSizeBytes: z.number().int().positive().max(200 * 1024 * 1024).optional(),
    clientMessageId: z.string().uuid(),
  })
  .superRefine((m, ctx) => {
    if (m.type === "text" || m.type === "event") {
      if (m.mediaRef) ctx.addIssue({ code: "custom", message: "Szöveges üzenethez nem tartozhat média." });
      if (m.ciphertext.length > MAX_TEXT_CIPHERTEXT_CHARS) ctx.addIssue({ code: "custom", message: "Túl hosszú üzenet." });
    } else if (!m.mediaRef) {
      ctx.addIssue({ code: "custom", message: "Médiaüzenethez mediaRef kell." });
    }
  });

export const FriendRequestBodySchema = z.object({ username: UsernameSchema });
export const BlockBodySchema = z.object({ userId: ObjectIdStr });
export const ConversationPrefBodySchema = z.object({ mutedUntil: z.string().datetime().nullable() });
export const ContactPrefBodySchema = z.object({ valueEncrypted: b64(), nonce: b64(24) });
export const PushTokenBodySchema = z.object({
  pushToken: z.string().regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/).nullable(),
  notificationsEnabled: z.boolean().optional(),
  /** `hidden`: a push nem tartalmazza a feladó nevét (csak „Sotto” + általános szöveg). */
  notificationDetail: z.enum(["name", "hidden"]).optional(),
});

export const ReportBodySchema = z.object({
  messageId: ObjectIdStr,
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(500).optional(),
  /** A jelentő által a moderációs PUBLIKUS kulcsra újracsomagolt üzenetkulcs (önkéntes megosztás). */
  grant: z.object({ wrappedKey: b64(), ephemeralPublicKey: b64(32), wrapNonce: b64(24) }).optional(),
});

/** Fiókbeállítások (kereshetőség, ismerősnek jelölés). */
export const AccountSettingsBodySchema = z
  .object({ discoverability: DiscoverabilitySchema.optional(), friendRequestPolicy: FriendRequestPolicySchema.optional(), showActivity: z.boolean().optional() })
  .refine((v) => v.discoverability !== undefined || v.friendRequestPolicy !== undefined || v.showActivity !== undefined, "Legalább egy beállítás szükséges");

/** Jelszócsere (a jelenlegi jelszóval megerősítve). */
export const ChangePasswordBodySchema = z.object({ currentPassword: PasswordSchema, newPassword: PasswordSchema });

export const DeleteAccountBodySchema = z.object({ password: PasswordSchema });
export const RestoreAccountBodySchema = z.object({ username: UsernameSchema, password: PasswordSchema, recoveryVerifier: b64(32) });
