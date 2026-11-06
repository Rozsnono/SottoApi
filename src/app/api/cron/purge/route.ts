import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { safeEqual } from "@/lib/crypto/server";
import { runPurge } from "@/lib/purge";

/** Időzített takarítás indítása (helyi ütemezőből): `x-cron-secret` fejléc kell. */
export const POST = handle(async (req) => {
  const secret = getEnv().CRON_SECRET;
  if (!secret) throw new ApiError("SERVICE_UNAVAILABLE", "A cron nincs beállítva.");
  if (!safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) throw new ApiError("UNAUTHORIZED", "Nem engedélyezett.");
  await connectDb();
  return ok(await runPurge());
});
