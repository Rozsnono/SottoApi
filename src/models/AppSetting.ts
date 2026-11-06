import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Kulcs-érték beállítás, az érték nyugalmi állapotban titkosítva (CONFIG_ENCRYPTION_KEY). */
const AppSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    valueEncrypted: { type: String, required: true },
    nonce: { type: String, required: true },
    version: { type: Number, default: 1 },
    updatedBy: { type: String },
  },
  { timestamps: true },
);

export const AppSetting: Model<InferSchemaType<typeof AppSettingSchema>> =
  (models.AppSetting as Model<InferSchemaType<typeof AppSettingSchema>>) || model("AppSetting", AppSettingSchema);
