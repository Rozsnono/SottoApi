import { z } from "zod";
import { handle, ok, readBody, clientIp, userAgent, ApiError } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { ADMIN_COOKIE, adminCookieAttributes, checkAdminCredentials, createAdminToken, assertSameOrigin } from "@/lib/auth/admin";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";

const Body = z.object({ password: z.string().min(1).max(256), totp: z.string().max(10).optional() });

/** Admin belépés: IP-nként 5 kísérlet / 15 perc; minden kísérlet auditálva (IP, UA). Nem árulja el, mi volt hibás. */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  const ua = userAgent(req);
  try {
    await enforce(`admin-login:${ip}`, RULES.adminLogin);
  } catch (e) {
    await audit({ actorType: "admin", action: "admin.login_rate_limited", ip, userAgent: ua });
    throw e;
  }
  const body = await readBody(req, Body, 4096);
  if (!checkAdminCredentials(body.password, body.totp)) {
    await audit({ actorType: "admin", action: "admin.login_failed", ip, userAgent: ua });
    throw new ApiError("UNAUTHORIZED", "Hibás adatok.");
  }
  await audit({ actorType: "admin", actorId: getEnv().ADMIN_ID, action: "admin.login_success", ip, userAgent: ua });
  const res = ok({ loggedIn: true });
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=${await createAdminToken()}; ${adminCookieAttributes()}`);
  return res;
});
