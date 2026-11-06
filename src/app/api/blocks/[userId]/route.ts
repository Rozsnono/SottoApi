import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/sessions";
import { Block } from "@/models";

/** Feloldás. Az ismeretség nem áll vissza automatikusan (újra kell jelölni). */
export const DELETE = handle(async (req, ctx: RouteContext<"/api/blocks/[userId]">) => {
  const { user } = await requireUser(req);
  const { userId } = await ctx.params;
  if (!Types.ObjectId.isValid(userId)) throw new ApiError("NOT_FOUND", "Nem található.");
  await connectDb();
  await Block.deleteOne({ blockerId: user._id, blockedId: userId });
  return ok({ blocked: false });
});
