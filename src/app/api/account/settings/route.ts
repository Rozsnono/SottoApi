import { connectDb } from "@/lib/db";
import { clientIp, handle, ok, readBody, userAgent } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { AccountSettingsBodySchema } from "@/protocol/schemas";
import { audit } from "@/lib/audit";

/** Fiókbeállítások lekérése: felhasználónév + kereshetőség + ismerőskérelem-szabály + aktivitás-megosztás. */
export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  return ok({ username: user.username, discoverability: user.discoverability, friendRequestPolicy: user.friendRequestPolicy, showActivity: user.showActivity !== false });
});

/** Beállítások módosítása (részleges; legalább egy mező kell). Auditálva. */
export const PUT = handle(async (req) => {
  const { user } = await requireUser(req);
  const body = await readBody(req, AccountSettingsBodySchema);
  await connectDb();
  if (body.discoverability !== undefined) user.discoverability = body.discoverability;
  if (body.friendRequestPolicy !== undefined) user.friendRequestPolicy = body.friendRequestPolicy;
  if (body.showActivity !== undefined) user.showActivity = body.showActivity;
  await user.save();
  await audit({ actorType: "user", actorId: String(user._id), action: "account.settings_update", ip: clientIp(req), userAgent: userAgent(req), meta: body });
  return ok({ username: user.username, discoverability: user.discoverability, friendRequestPolicy: user.friendRequestPolicy, showActivity: user.showActivity !== false });
});
