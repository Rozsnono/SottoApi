import { connectDb } from "@/lib/db";
import { handle, ok, readBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { PushTokenBodySchema } from "@/protocol/schemas";
import { Device } from "@/models";

/** Expo push token regisztrálása / törlése és az értesítések eszközszintű kapcsolója. Egy token csak egy eszközhöz tartozhat. */
export const PUT = handle(async (req) => {
  const { user, deviceId } = await requireUser(req);
  const body = await readBody(req, PushTokenBodySchema, 2048);
  await connectDb();
  if (body.pushToken) await Device.updateMany({ pushToken: body.pushToken, deviceId: { $ne: deviceId } }, { $unset: { pushToken: 1 } });
  await Device.updateOne(
    { userId: user._id, deviceId },
    { ...(body.pushToken ? { pushToken: body.pushToken } : { $unset: { pushToken: 1 } }), ...(body.notificationsEnabled !== undefined ? { notificationsEnabled: body.notificationsEnabled } : {}) },
  );
  return ok({ registered: !!body.pushToken });
});
