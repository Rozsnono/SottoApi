import { handle, ok, readBody, ApiError, clientIp, userAgent } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { BackupUpdateBodySchema } from "@/protocol/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { enforce, RULES } from "@/lib/ratelimit";

/** Friss jelszavas hitelesítés (5 perc) szükséges a mentés lekéréséhez. */
const REAUTH_SEC = 5 * 60;

/** A titkosított kulcsmentés lekérése (új eszköz). A visszafejtéshez a kliensen kell a Recovery Code. */
export const GET = handle(async (req) => {
  const { user, authTime } = await requireUser(req);
  await enforce(`backup:get:${user._id}`, RULES.resetPassword);
  if (Math.floor(Date.now() / 1000) - authTime > REAUTH_SEC) {
    throw new ApiError("UNAUTHORIZED", "Újra-hitelesítés szükséges. Lépj be újra.");
  }
  await audit({ actorType: "user", actorId: String(user._id), action: "keys.backup_fetch", ip: clientIp(req), userAgent: userAgent(req) });
  return ok({
    encryptedKeyBackup: user.encryptedKeyBackup,
    backupNonce: user.backupNonce,
    kdfParams: user.kdfParams,
    identityPublicKey: user.identityPublicKey,
    identitySigningPublicKey: user.identitySigningPublicKey,
  });
});

/** A titkosított mentés frissítése (jelszó megerősítéssel). */
export const POST = handle(async (req) => {
  const { user } = await requireUser(req);
  const body = await readBody(req, BackupUpdateBodySchema);
  await enforce(`backup:set:${user._id}`, RULES.resetPassword);
  if (!(await verifyPassword(body.password, user.passwordHash))) throw new ApiError("UNAUTHORIZED", "Hibás jelszó.");
  user.encryptedKeyBackup = body.backup.encryptedKeyBackup;
  user.backupNonce = body.backup.backupNonce;
  user.kdfParams = body.backup.kdfParams;
  await user.save();
  await audit({ actorType: "user", actorId: String(user._id), action: "keys.backup_update", ip: clientIp(req), userAgent: userAgent(req) });
  return ok({ updated: true });
});
