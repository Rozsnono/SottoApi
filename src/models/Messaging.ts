import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const WrappedKeySchema = new Schema(
  {
    deviceId: { type: String, required: true }, // "identity" = az identitáskulcsra csomagolt példány (előzmény-visszaállításhoz)
    ephemeralPublicKey: { type: String, required: true },
    wrapNonce: { type: String, required: true },
    wrappedKey: { type: String, required: true },
  },
  { _id: false },
);

/** Üzenet: csak ciphertext + borítékok. Törléskor tombstone marad (ciphertext/kulcsok nélkül). */
const MessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Monoton sorszám a szinkron-kurzorhoz (nem a createdAt). */
    seq: { type: Number, required: true, index: true },
    type: { type: String, enum: ["text", "image", "video", "audio", "event"], required: true },
    ciphertext: { type: String },
    nonce: { type: String },
    signature: { type: String },
    wrappedKeys: { type: [WrappedKeySchema], default: undefined },
    mediaRef: { type: String },
    mediaSizeBytes: { type: Number },
    clientMessageId: { type: String, required: true },
    deletedAt: { type: Date },
    /** A törlés-esemény sorszáma (szinkron-kurzorhoz). */
    deletedSeq: { type: Number, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });

const MessageReceiptSchema = new Schema({
  messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  readAt: { type: Date, default: Date.now },
  /** Az olvasás-esemény sorszáma (szinkron-kurzorhoz). */
  seq: { type: Number, required: true, index: true },
});
MessageReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });

const MediaUploadSchema = new Schema(
  {
    ref: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    size: { type: Number },
    referenced: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/** Jelentés + ideiglenes moderációs grant (a jelentő által a moderációs kulcsra újracsomagolt üzenetkulcs). */
const ReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, required: true },
    note: { type: String, maxlength: 500 },
    status: { type: String, enum: ["open", "reviewed", "dismissed", "actioned"], default: "open", index: true },
    moderationGrant: {
      type: new Schema(
        {
          wrappedKey: String,
          ephemeralPublicKey: String,
          wrapNonce: String,
          expiresAt: Date,
        },
        { _id: false },
      ),
    },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

/** Monoton számláló a szinkron-kurzorhoz (üzenet-, törlés- és olvasás-események közös sorszáma). */
const CounterSchema = new Schema({ _id: { type: String, required: true }, value: { type: Number, default: 0 } });
export const Counter: Model<InferSchemaType<typeof CounterSchema>> =
  (models.Counter as Model<InferSchemaType<typeof CounterSchema>>) || model("Counter", CounterSchema);

export const Message: Model<InferSchemaType<typeof MessageSchema>> =
  (models.Message as Model<InferSchemaType<typeof MessageSchema>>) || model("Message", MessageSchema);
export const MessageReceipt: Model<InferSchemaType<typeof MessageReceiptSchema>> =
  (models.MessageReceipt as Model<InferSchemaType<typeof MessageReceiptSchema>>) || model("MessageReceipt", MessageReceiptSchema);
export const MediaUpload: Model<InferSchemaType<typeof MediaUploadSchema>> =
  (models.MediaUpload as Model<InferSchemaType<typeof MediaUploadSchema>>) || model("MediaUpload", MediaUploadSchema);
export const Report: Model<InferSchemaType<typeof ReportSchema>> =
  (models.Report as Model<InferSchemaType<typeof ReportSchema>>) || model("Report", ReportSchema);
