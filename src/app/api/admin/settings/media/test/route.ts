import { z } from "zod";
import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ok, readBody, clientIp, userAgent, ApiError } from "@/lib/http";
import { adapterFor, getStoredServerKeyConfig } from "@/lib/media/settings";
import { audit } from "@/lib/audit";

const Body = z.object({ useStored: z.boolean().default(true) }).default({ useStored: true });

/** Kapcsolat-teszt a mentett szerveres kulccsal (/health és /health/key). A kulcs a válaszban nem szerepel. */
export const POST = adminRoute(async (req, _ctx: unknown, admin) => {
  await connectDb();
  await readBody(req, Body, 1024).catch(() => ({ useStored: true }));
  const cfg = await getStoredServerKeyConfig();
  if (!cfg) throw new ApiError("MEDIA_NOT_CONFIGURED", "Előbb mentsd el a beállításokat.");
  const health = await adapterFor(cfg).health();
  await audit({ actorType: "admin", actorId: admin.adminId, action: "admin.media_settings_test", ip: clientIp(req), userAgent: userAgent(req), meta: { ok: health.ok } });
  return ok(health);
});
