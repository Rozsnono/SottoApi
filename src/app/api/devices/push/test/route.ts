import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Device } from "@/models";
import { fcmEnabled, sendFcm } from "@/lib/fcm";
import { sendExpoTest } from "@/lib/push";

/**
 * Teszt-értesítés a hívó eszközére (hibakereséshez: megmutatja, hol akad el a push – nincs token, nincs FCM-beállítás,
 * vagy a küldés sikertelen). Tartalma csak általános szöveg. Csak a saját eszközre küld.
 */
export const POST = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  await connectDb();
  const d = await Device.findOne({ userId: user._id, deviceId, revokedAt: { $exists: false } }, { pushToken: 1, pushProvider: 1, notificationDetail: 1 }).lean();
  if (!d?.pushToken) throw new ApiError("NOT_FOUND", "Ehhez az eszközhöz nincs regisztrált push token.");
  const provider = d.pushProvider === "fcm" ? "fcm" : "expo";
  if (provider === "fcm") {
    if (!fcmEnabled()) throw new ApiError("SERVICE_UNAVAILABLE", "A push nincs beállítva a szerveren (FCM_SERVICE_ACCOUNT_B64).");
    const r = await sendFcm(d.pushToken, { title: "Sotto", body: "Test", data: { type: "test" } });
    if (r === "unregistered") {
      await Device.updateOne({ _id: d._id }, { $unset: { pushToken: 1 } });
      throw new ApiError("NOT_FOUND", "Az eszköz tokenje érvénytelen; indítsd újra az appot a regisztrációhoz.");
    }
    if (r !== "ok") throw new ApiError("SERVICE_UNAVAILABLE", "Az FCM küldés sikertelen (lásd a szerver naplóját).");
  } else if (!(await sendExpoTest(d.pushToken))) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Az Expo push küldés sikertelen.");
  }
  return ok({ provider, delivered: true });
});
