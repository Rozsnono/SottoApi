import { z } from "zod";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ok, readBody, clientIp, userAgent, ApiError } from "@/lib/http";
import { getMediaSettingsPublic, saveMediaSettings } from "@/lib/media/settings";
import { audit } from "@/lib/audit";

const Body = z.object({ phoneKey: z.string().min(8).max(512), phoneKeyExpiresAt: z.string().datetime().nullable().optional() });

/** Telefonos kulcs forgatása: új kulcs + verzióléptetés; az eszközök a következő lekéréskor az újat kapják. */
export const POST = adminRoute(async (req, _ctx: unknown, admin) => {
  await connectDb();
  const body = await readBody(req, Body, 4096);
  const cur = await getMediaSettingsPublic();
  if (!cur.configured || !cur.baseUrl || !cur.folder) throw new ApiError("MEDIA_NOT_CONFIGURED", "Előbb mentsd el a beállításokat.");
  const r = await saveMediaSettings({ baseUrl: cur.baseUrl, folder: cur.folder, phoneKey: body.phoneKey, phoneKeyExpiresAt: body.phoneKeyExpiresAt }, admin.adminId);
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.media_key_rotate", ip: clientIp(req), userAgent: userAgent(req), meta: { version: r.version } });
  return ok(await getMediaSettingsPublic());
});
