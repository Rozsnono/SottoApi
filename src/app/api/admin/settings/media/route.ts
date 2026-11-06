import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ok, readBody, clientIp, userAgent } from "@/lib/http";
import { AdminMediaSettingsSchema } from "@/protocol/schemas";
import { getMediaSettingsPublic, saveMediaSettings } from "@/lib/media/settings";
import { audit } from "@/lib/audit";

/** Média API beállítások (a kulcsok csak maszkolva láthatók). */
export const GET = adminRoute(async () => {
  await connectDb();
  return ok(await getMediaSettingsPublic());
});

/** Mentés. A kulcs mezők csak írhatók; az auditba csak a művelet és a verzió kerül (érték nélkül). */
export const PUT = adminRoute(async (req, _ctx: unknown, admin) => {
  await connectDb();
  const body = await readBody(req, AdminMediaSettingsSchema, 8192);
  const r = await saveMediaSettings(body, admin.adminId);
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.media_settings_update", ip: clientIp(req), userAgent: userAgent(req), meta: { version: r.version, phoneKeyChanged: r.phoneKeyChanged } });
  return ok({ ...(await getMediaSettingsPublic()) });
});
