import { handle, ok } from "@/lib/http";
import { requireUser, revokeDeviceSessions } from "@/lib/auth/sessions";
import { Device } from "@/models";

/** Kijelentkezés: az eszköz munkamenetei visszavonva, a push token törölve (az eszköz regisztrált marad). */
export const POST = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  await revokeDeviceSessions(String(user._id), deviceId);
  await Device.updateOne({ userId: user._id, deviceId }, { $unset: { pushToken: 1 } });
  return ok({ loggedOut: true });
});
