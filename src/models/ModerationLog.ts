import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Tartós moderációs döntésnapló (nincs TTL, nincs IP, nincs tartalom). */
const ModerationLogSchema = new Schema({
  reportId: { type: Schema.Types.ObjectId, ref: "Report" },
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  decision: { type: String, required: true },
  reason: { type: String, required: true },
  adminId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

export const ModerationLog: Model<InferSchemaType<typeof ModerationLogSchema>> =
  (models.ModerationLog as Model<InferSchemaType<typeof ModerationLogSchema>>) || model("ModerationLog", ModerationLogSchema);
