import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Forgó refresh token (csak hash-e tárolt). A `familyId` a újrafelhasználás-észleléshez kell. */
const RefreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    /** Beváltva (rotálva) – ha újra megjelenik, a teljes család visszavonásra kerül. */
    usedAt: { type: Date },
    /** A jelszavas hitelesítés ideje (a család minden tagjára öröklődik) – friss újra-hitelesítés ellenőrzéséhez. */
    authTime: { type: Date, required: true },
  },
  { timestamps: true },
);
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<InferSchemaType<typeof RefreshTokenSchema>> =
  (models.RefreshToken as Model<InferSchemaType<typeof RefreshTokenSchema>>) || model("RefreshToken", RefreshTokenSchema);
