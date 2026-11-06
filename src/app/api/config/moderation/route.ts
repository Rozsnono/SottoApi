import { handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { getEnv } from "@/lib/env";

/** A moderációs PUBLIKUS kulcs (a jelentő erre csomagolja újra az üzenetkulcsot). `null`: a megosztás nem érhető el. */
export const GET = handle(async (req) => {
  await requireUser(req);
  return ok({ publicKey: getEnv().MODERATION_PUBLIC_KEY ?? null, grantTtlSec: 24 * 3600 });
});
