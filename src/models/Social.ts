import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Ismeretség (rendezetlen pár egyedi indexszel). */
const FriendshipSchema = new Schema(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    addresseeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Rendezett pár kulcs az egyediséghez: "<kisebb>:<nagyobb>". */
    pairKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "accepted", "declined", "cancelled", "archived"], default: "pending" },
    respondedAt: { type: Date },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

const BlockSchema = new Schema(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
BlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

const ConversationSchema = new Schema(
  {
    participants: { type: [Schema.Types.ObjectId], required: true, validate: (v: unknown[]) => v.length === 2 },
    participantsKey: { type: String, required: true, unique: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

/** Beszélgetésenkénti értesítés-némítás (a szerver némított chatre nem küld pusht). */
const ConversationPrefSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  mutedUntil: { type: Date },
});
ConversationPrefSchema.index({ userId: 1, conversationId: 1 }, { unique: true });

/** Becenév/szín: KLIENS-oldalon titkosított blob, a szerver nem látja a tartalmát. */
const ContactPrefSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    contactUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    valueEncrypted: { type: String, required: true },
    nonce: { type: String, required: true },
  },
  { timestamps: true },
);
ContactPrefSchema.index({ userId: 1, contactUserId: 1 }, { unique: true });

export const Friendship: Model<InferSchemaType<typeof FriendshipSchema>> =
  (models.Friendship as Model<InferSchemaType<typeof FriendshipSchema>>) || model("Friendship", FriendshipSchema);
export const Block: Model<InferSchemaType<typeof BlockSchema>> =
  (models.Block as Model<InferSchemaType<typeof BlockSchema>>) || model("Block", BlockSchema);
export const Conversation: Model<InferSchemaType<typeof ConversationSchema>> =
  (models.Conversation as Model<InferSchemaType<typeof ConversationSchema>>) || model("Conversation", ConversationSchema);
export const ConversationPref: Model<InferSchemaType<typeof ConversationPrefSchema>> =
  (models.ConversationPref as Model<InferSchemaType<typeof ConversationPrefSchema>>) || model("ConversationPref", ConversationPrefSchema);
export const ContactPref: Model<InferSchemaType<typeof ContactPrefSchema>> =
  (models.ContactPref as Model<InferSchemaType<typeof ContactPrefSchema>>) || model("ContactPref", ContactPrefSchema);
