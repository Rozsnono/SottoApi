import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { AUDIT_RETENTION_SEC } from "@/protocol/constants";

/** Audit napló, 30 napos TTL. Tartalom, kulcs, token soha nem kerül ide. */
const AuditLogSchema = new Schema({
  actorType: { type: String, enum: ["admin", "user", "system"], required: true },
  actorId: { type: String },
  action: { type: String, required: true, index: true },
  target: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_RETENTION_SEC });

export const AuditLog: Model<InferSchemaType<typeof AuditLogSchema>> =
  (models.AuditLog as Model<InferSchemaType<typeof AuditLogSchema>>) || model("AuditLog", AuditLogSchema);
