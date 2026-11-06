/** Felhasználó-segédek: egyedi hibák felismerése, publikus nézet. */
import type { HydratedDocument, InferSchemaType } from "mongoose";
import type { User } from "@/models";

type UserDoc = HydratedDocument<InferSchemaType<typeof User.schema>>;

export function isDuplicateKeyError(e: unknown): boolean {
  return (e as { code?: number } | null)?.code === 11000;
}

/** A kliensnek adható felhasználói nézet (nincs hash, nincs backup). */
export function publicUser(u: UserDoc) {
  return {
    id: String(u._id),
    username: u.username,
    status: u.status,
    identityPublicKey: u.identityPublicKey,
    identitySigningPublicKey: u.identitySigningPublicKey,
    discoverability: u.discoverability,
    friendRequestPolicy: u.friendRequestPolicy,
  };
}
