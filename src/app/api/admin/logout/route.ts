import { handle, ok, clientIp, userAgent } from "@/lib/http";
import { ADMIN_COOKIE, assertSameOrigin, readCookie, verifyAdminToken } from "@/lib/auth/admin";
import { audit } from "@/lib/audit";

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const s = await verifyAdminToken(readCookie(req, ADMIN_COOKIE));
  if (s) await audit({ actorType: "admin", actorId: s.adminId, action: "admin.logout", ip: clientIp(req), userAgent: userAgent(req) });
  const res = ok({ loggedOut: true });
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  return res;
});
