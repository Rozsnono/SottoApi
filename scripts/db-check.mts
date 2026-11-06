/** Kapcsolat- és indexellenőrzés: `npm run db:check` (az indexeket szinkronizálja, secret nélkül naplóz). */
import { readFileSync } from "node:fs";
import { connectDb, disconnectDb } from "../src/lib/db";
import * as models from "../src/models";

// Egyszerű .env.local betöltés (nincs plusz függőség).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* nincs .env.local – a környezetből olvasunk */
}

try {
  await connectDb();
  for (const [name, m] of Object.entries(models)) {
    if (typeof (m as { syncIndexes?: unknown }).syncIndexes !== "function") continue;
    await (m as { syncIndexes(): Promise<unknown> }).syncIndexes();
    console.log(`✓ ${name}: indexek szinkronban`);
  }
  console.log("Adatbázis rendben.");
} catch (e) {
  console.error("Adatbázis hiba:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
