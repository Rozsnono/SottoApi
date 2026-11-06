import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok, readBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { ContactPrefBodySchema } from "@/protocol/schemas";
import { ContactPref, Conversation } from "@/models";
import { pairKey } from "@/lib/social/helpers";

async function guard(me: string, other: string) {
  if (!Types.ObjectId.isValid(other)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  // Csak olyan felhasználóra állítható, akivel van (akár archivált) beszélgetés.
  if (!(await Conversation.exists({ participantsKey: pairKey(me, other) }))) throw new ApiError("NOT_FOUND", "Nem található.");
}

/** Becenév/szín: KLIENS-oldalon titkosított blob; a szerver nem látja a tartalmát, csak szinkronizálja az eszközök között. */
export const GET = handle(async (req, ctx: RouteContext<"/api/contacts/[userId]/prefs">) => {
  const { user } = await requireUser(req);
  const { userId } = await ctx.params;
  await guard(String(user._id), userId);
  const p = await ContactPref.findOne({ userId: user._id, contactUserId: userId }).lean();
  return ok(p ? { valueEncrypted: p.valueEncrypted, nonce: p.nonce } : null);
});

export const PUT = handle(async (req, ctx: RouteContext<"/api/contacts/[userId]/prefs">) => {
  const { user } = await requireUser(req);
  const { userId } = await ctx.params;
  await guard(String(user._id), userId);
  const body = await readBody(req, ContactPrefBodySchema, 20_000);
  await ContactPref.findOneAndUpdate({ userId: user._id, contactUserId: userId }, body, { upsert: true });
  return ok({ saved: true });
});
