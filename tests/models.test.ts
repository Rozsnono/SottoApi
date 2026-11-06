import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDb, stopDb } from "./helpers";
import { AuditLog, RefreshToken, User, Friendship, Message } from "@/models";

beforeAll(startDb);
afterAll(stopDb);

describe("indexek", () => {
  it("az audit napló 30 napos TTL indexe létrejön", async () => {
    await AuditLog.syncIndexes();
    const idx = await AuditLog.collection.indexes();
    const ttl = idx.find((i) => i.key?.createdAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(2592000);
  });
  it("a refresh token lejárati TTL indexe létrejön", async () => {
    await RefreshToken.syncIndexes();
    const idx = await RefreshToken.collection.indexes();
    expect(idx.find((i) => i.key?.expiresAt === 1)?.expireAfterSeconds).toBe(0);
  });
  it("egyedi indexek: felhasználónév, ismeretség-pár, küldő+clientMessageId", async () => {
    await Promise.all([User.syncIndexes(), Friendship.syncIndexes(), Message.syncIndexes()]);
    const u = await User.collection.indexes();
    expect(u.some((i) => i.key?.usernameNormalized === 1 && i.unique)).toBe(true);
    const f = await Friendship.collection.indexes();
    expect(f.some((i) => i.key?.pairKey === 1 && i.unique)).toBe(true);
    const m = await Message.collection.indexes();
    expect(m.some((i) => i.key?.senderId === 1 && i.key?.clientMessageId === 1 && i.unique)).toBe(true);
  });
});
