/**
 * Fejlesztői MongoDB Docker és külön telepítés nélkül: elindít egy valódi mongod-ot (mongodb-memory-server csomagon át),
 * az adatokat a `.data/mongo` mappában tartja meg, és kiírja a `DATABASE_URL`-t.
 * Használat: `npm run db:dev` (külön terminálban), a kapott URL-t tedd a `.env.local`-ba.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), ".data/mongo");
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { dbPath, storageEngine: "wiredTiger", port: 27027 },
});
console.log(`\nMongoDB fut. DATABASE_URL=${server.getUri("sotto")}\nLeállítás: Ctrl+C (az adatok megmaradnak: ${dbPath})\n`);

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
