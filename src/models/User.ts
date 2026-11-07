import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Felhasználó. Nincs e-mail mező (adatminimalizálás). Privát kulcs sosem kerül ide;
 * a titkosított kulcsmentés csak a hitelesített visszaállító végponton adható vissza.
 */
const UserSchema = new Schema(
  {
    username: { type: String, required: true },
    usernameNormalized: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    identityPublicKey: { type: String, required: true },
    identitySigningPublicKey: { type: String, required: true },
    encryptedKeyBackup: { type: String, required: true },
    backupNonce: { type: String, required: true },
    kdfParams: { type: new Schema({ kdf: { type: String, required: true } }, { _id: false }), required: true },
    /** Az HKDF-ből levezetett recovery-verifier hash-e (a nyers kód/verifier sosem tárolt). */
    recoveryVerifierHash: { type: String, required: true },
    /** Aktivitás-megosztás: ha kikapcsolt, a felhasználó nem látszik fent lévőnek, és ő sem lát másokét. */
    showActivity: { type: Boolean, default: true },
    discoverability: { type: String, enum: ["everyone", "friends_only", "hidden"], default: "everyone" },
    friendRequestPolicy: { type: String, enum: ["everyone", "friends_only"], default: "everyone" },
    status: { type: String, enum: ["active", "suspended", "deleted_pending", "purged"], default: "active", index: true },
    deletedAt: { type: Date },
    suspendedReason: { type: String },
    lastSeenAt: { type: Date },
  },
  { timestamps: true },
);
UserSchema.index({ status: 1, deletedAt: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: import("mongoose").Types.ObjectId };
export const User: Model<InferSchemaType<typeof UserSchema>> =
  (models.User as Model<InferSchemaType<typeof UserSchema>>) || model("User", UserSchema);
