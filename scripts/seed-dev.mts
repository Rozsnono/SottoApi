/**
 * Fejlesztői szintetikus adatok az admin felület kipróbálásához (SOHA nem éles adat, nincs valós titok).
 * Használat: `npm run db:seed` (előtte fusson a `npm run db:dev`). Production környezetben megtagadja a futást.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { connectDb, disconnectDb } from "../src/lib/db";
import { AuditLog, ModerationLog, Report, User, Device } from "../src/models";

if (process.env.NODE_ENV === "production") throw new Error("A seed production környezetben nem futtatható.");
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* nincs .env.local */ }

const b64 = (n: number) => randomBytes(n).toString("base64");
await connectDb();
const names = ["alice", "bence_77", "maja!", "dani", "emese", "gergo.k", "luca#1", "nora_x"];
const users = [];
for (const [i, n] of names.entries()) {
  const status = i === 3 ? "suspended" : i === 6 ? "deleted_pending" : "active";
  users.push(
    await User.findOneAndUpdate(
      { usernameNormalized: n.toLowerCase() },
      {
        username: n, usernameNormalized: n.toLowerCase(), passwordHash: "$2b$12$seed-not-a-real-hash", identityPublicKey: b64(32), identitySigningPublicKey: b64(32),
        encryptedKeyBackup: b64(64), backupNonce: b64(24), kdfParams: { kdf: "hkdf-sha256-v1" }, recoveryVerifierHash: randomBytes(32).toString("hex"),
        status, lastSeenAt: new Date(Date.now() - i * 3_600_000), ...(status === "deleted_pending" ? { deletedAt: new Date(Date.now() - 5 * 86_400_000) } : {}),
        ...(status === "suspended" ? { suspendedReason: "Zaklatás (seed)" } : {}),
      },
      { upsert: true, returnDocument: "after" },
    ),
  );
  await Device.findOneAndUpdate({ userId: users[i]._id, deviceId: `seed-${i}` }, { deviceName: `Telefon ${i + 1}`, devicePublicKey: b64(32), lastSeenAt: new Date() }, { upsert: true });
}
await Report.create({ reporterId: users[0]._id, targetUserId: users[3]._id, reason: "Zaklatás", note: "Szintetikus teszt jelentés", status: "open" });
await Report.create({ reporterId: users[1]._id, targetUserId: users[2]._id, reason: "Kéretlen tartalom", status: "reviewed", resolvedAt: new Date() });
await ModerationLog.create({ userId: users[3]._id, decision: "suspend", reason: "Zaklatás (seed)", adminId: "admin" });
for (const action of ["admin.login_success", "auth.register", "auth.login", "admin.user_suspend"]) {
  await AuditLog.create({ actorType: action.startsWith("admin") ? "admin" : "user", actorId: "seed", action, ip: "127.0.0.1", userAgent: "seed" });
}
console.log("Szintetikus adatok betöltve.");
await disconnectDb();
