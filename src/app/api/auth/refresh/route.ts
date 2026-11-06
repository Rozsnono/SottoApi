import { clientIp, handle, ok, readBody, userAgent } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { RefreshBodySchema } from "@/protocol/schemas";
import { rotateRefreshToken } from "@/lib/auth/sessions";

/** Refresh token forgatása; újrafelhasznált token esetén a teljes család visszavonásra kerül és auditálódik. */
export const POST = handle(async (req) => {
  const ip = clientIp(req);
  await enforce(`refresh:${ip}`, RULES.refresh);
  const { refreshToken } = await readBody(req, RefreshBodySchema);
  const tokens = await rotateRefreshToken(refreshToken, { ip, userAgent: userAgent(req) });
  return ok({ tokens });
});
