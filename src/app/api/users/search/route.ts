import { connectDb } from "@/lib/db";
import { escapeRegex } from "@/lib/auth/adminRoute";
import { handle, ok } from "@/lib/http";
import { enforce, RULES } from "@/lib/ratelimit";
import { requireUser } from "@/lib/auth/sessions";
import { Block, Friendship, User } from "@/models";
import { pairKey } from "@/lib/social/helpers";

/**
 * Felhasználónév-keresés (min. 3 karakter, előtag). Szabályok: nincs önmaga, tiltott (bármely irányban) nem látszik,
 * `hidden` soha nem látszik, `friends_only` csak ismerősnek. Sebességkorlát: enumeráció ellen.
 */
export const GET = handle(async (req) => {
  const { user } = await requireUser(req);
  await enforce(`search:${user._id}`, RULES.search);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 20);
  if (q.length < 3) return ok({ items: [] });
  await connectDb();
  const me = user._id;
  const candidates = await User.find({ usernameNormalized: { $regex: "^" + escapeRegex(q) }, status: "active", _id: { $ne: me } }).limit(40).lean();
  const ids = candidates.map((c) => c._id);
  const [blocks, frs] = await Promise.all([
    Block.find({ $or: [{ blockerId: me, blockedId: { $in: ids } }, { blockedId: me, blockerId: { $in: ids } }] }).lean(),
    Friendship.find({ pairKey: { $in: ids.map((i) => pairKey(me, i)) } }).lean(),
  ]);
  const blocked = new Set(blocks.flatMap((b) => [String(b.blockerId), String(b.blockedId)]));
  const fr = new Map(frs.map((f) => [f.pairKey, f]));
  const items = candidates
    .filter((c) => !blocked.has(String(c._id)))
    .map((c) => {
      const f = fr.get(pairKey(me, c._id));
      const relation = !f ? "none" : f.status === "accepted" ? "friend" : f.status === "pending" ? (String(f.requesterId) === String(me) ? "pending_out" : "pending_in") : "none";
      return { c, relation };
    })
    .filter(({ c, relation }) => c.discoverability === "everyone" || (c.discoverability === "friends_only" && relation === "friend"))
    .slice(0, 20)
    .map(({ c, relation }) => ({ id: String(c._id), username: c.username, relation }));
  return ok({ items });
});
