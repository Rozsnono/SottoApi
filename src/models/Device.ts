import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Eszköz: saját X25519 kulcspár publikus fele; a visszavont eszköz nem kap új borítékot/kulcsot. */
const DeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    deviceId: { type: String, required: true },
    deviceName: { type: String, required: true },
    devicePublicKey: { type: String, required: true },
    pushToken: { type: String },
    notificationsEnabled: { type: Boolean, default: true },
    lastSeenAt: { type: Date },
    revokedAt: { type: Date },
    /** Utolsó médiakulcs-verzió, amit az eszköz megkapott (admin kiosztás-statisztikához). */
    mediaKeyVersionSeen: { type: Number, default: 0 },
  },
  { timestamps: true },
);
/** A deviceId GLOBÁLISAN egyedi: a kulcscsomagolásban a deviceId azonosítja az eszközt (nincs kétértelműség). */
DeviceSchema.index({ deviceId: 1 }, { unique: true });
DeviceSchema.index({ userId: 1, deviceId: 1 });

export const Device: Model<InferSchemaType<typeof DeviceSchema>> =
  (models.Device as Model<InferSchemaType<typeof DeviceSchema>>) || model("Device", DeviceSchema);
