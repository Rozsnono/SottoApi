import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Device } from "@/models";
import { sealMediaConfigForDevice } from "@/lib/media/settings";

/**
 * A médiatár elérése és a TELEFONOS API kulcs az eszköz PUBLIKUS kulcsára zárva (sealed box).
 * Csak az eszköz privát kulcsa nyitja; a kulcs soha nem megy nyíltan a hálón az alkalmazás rétegen.
 */
export const GET = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  const device = await Device.findOne({ userId: user._id, deviceId });
  if (!device) throw new Error("Az eszköz nem található"); // requireUser már ellenőrizte
  const cfg = await sealMediaConfigForDevice(device.devicePublicKey);
  device.mediaKeyVersionSeen = cfg.keyVersion;
  await device.save();
  return ok({ keyVersion: cfg.keyVersion, sealed: cfg.sealed });
});
