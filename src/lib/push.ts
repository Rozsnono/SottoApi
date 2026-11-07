/**
 * Expo Push értesítések. A tartalom SOHA nem kerül bele: csak a feladó neve és az általános „New message” szöveg.
 * Az Expo/Apple/Google látja a metaadatot (címzett token, feladó neve, időzítés) – ezt a README/tájékoztató rögzíti.
 * Hiba nem néma: naplózzuk; `DeviceNotRegistered` esetén a token törlődik.
 */
import { Device, ConversationPref, User } from "@/models";
import { logger } from "./logger";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";
let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tesztekhez: fetch cseréje. */
export function setPushFetch(f: typeof fetch | null): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

export interface NotifyArgs {
  recipientId: string;
  senderUsername: string;
  conversationId: string;
}

export async function notifyNewMessage(a: NotifyArgs): Promise<{ sent: number }> {
  try {
    const recipient = await User.findById(a.recipientId, { status: 1 }).lean();
    if (!recipient || recipient.status !== "active") return { sent: 0 };
    const pref = await ConversationPref.findOne({ userId: a.recipientId, conversationId: a.conversationId }, { mutedUntil: 1 }).lean();
    if (pref?.mutedUntil && pref.mutedUntil.getTime() > Date.now()) return { sent: 0 };
    const devices = await Device.find({ userId: a.recipientId, revokedAt: { $exists: false }, pushToken: { $exists: true, $ne: null }, notificationsEnabled: { $ne: false } }, { pushToken: 1, notificationDetail: 1 }).lean();
    if (!devices.length) return { sent: 0 };
    const messages = devices.map((d) => ({
      to: d.pushToken,
      title: d.notificationDetail === "hidden" ? "Sotto" : a.senderUsername,
      body: "New message",
      sound: "default",
      channelId: "messages",
      data: { type: "message", conversationId: a.conversationId },
    }));
    const res = await fetchImpl(EXPO_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(messages) });
    if (!res.ok) {
      logger.warn("Expo push hiba", { status: res.status });
      return { sent: 0 };
    }
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const tickets = json.data ?? [];
    await Promise.all(
      tickets.map(async (t, i) => {
        if (t.status === "error" && t.details?.error === "DeviceNotRegistered") await Device.updateOne({ _id: devices[i]._id }, { $unset: { pushToken: 1 } });
      }),
    );
    return { sent: tickets.filter((t) => t.status === "ok").length };
  } catch (e) {
    logger.error("Push küldés sikertelen", e);
    return { sent: 0 };
  }
}
