/**
 * Környezeti változók validálása (Zod). Lazy olvasás: build közben nem kell minden érték,
 * hiányuk esetén futásidőben érthető hibát kapunk (a titkok értéke sosem kerül naplóba).
 *
 * Minden titok kizárólag környezeti változóból jön (`.env.local`, gitignore-olt) – lásd `.env.example`.
 */
import { z } from "zod";

/** 32 bájtos kulcs base64-ben (pl. `openssl rand -base64 32`). */
const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "32 bájtos base64 kulcs szükséges");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** MongoDB kapcsolat (natív mongod vagy Atlas). */
  DATABASE_URL: z.string().min(1),
  /** Felhasználói JWT aláíró titok (HS256), min. 32 karakter. */
  JWT_SECRET: z.string().min(32),
  /** Admin munkamenet-süti aláíró titok, külön a felhasználói JWT-től. */
  ADMIN_SESSION_SECRET: z.string().min(32),
  /** Közös admin jelszó (összehasonlítás időállandóan, hash-ek között). */
  ADMIN_PASSWORD: z.string().min(12),
  /** Opcionális TOTP titok (base32) az admin belépéshez. */
  ADMIN_TOTP_SECRET: z.string().optional(),
  /** Admin azonosító az audit naplóhoz (nem titok). */
  ADMIN_ID: z.string().min(1).default("admin"),
  /** AppSetting (pl. média API kulcsok) nyugalmi titkosításához. */
  CONFIG_ENCRYPTION_KEY: base64Key32,
  /** Moderációs publikus kulcs (X25519, base64). A privát kulcs sosem kerül a szerverre. */
  MODERATION_PUBLIC_KEY: z.string().optional(),
  /** Cron végpontok védelme. */
  CRON_SECRET: z.string().min(16).optional(),
  /** Firebase szolgáltatásfiók JSON base64-ben (FCM push, Expo-fiók nélkül). Titok! Opcionális: nélküle csak az Expo-tokenes push működik. */
  FCM_SERVICE_ACCOUNT_B64: z.string().optional(),
  /** Csak fejlesztéshez: helyi lemezes média adapter gyökere. */
  LOCAL_MEDIA_DIR: z.string().default(".data/media"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Visszaadja a validált környezetet; hiba esetén érthető üzenet, értékek nélkül. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Hiányzó vagy hibás környezeti változó(k): ${fields}. Lásd .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Tesztekhez: a gyorsítótár törlése. */
export function resetEnvCache(): void {
  cached = null;
}
