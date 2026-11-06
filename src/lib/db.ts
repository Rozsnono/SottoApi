/**
 * Mongoose kapcsolat – gyorsítótárazott singleton (Next.js hot-reload biztos).
 * Adatbázis-kiesésnél a hívó `SERVICE_UNAVAILABLE` (503) hibát kap (lásd `http.ts`).
 */
import mongoose from "mongoose";
import { getEnv } from "./env";

interface Cache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}
const g = globalThis as unknown as { __sottoMongoose?: Cache };
const cache: Cache = (g.__sottoMongoose ??= { conn: null, promise: null });

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose.connect(getEnv().DATABASE_URL, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: getEnv().NODE_ENV !== "production",
    });
  }
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null; // következő híváskor újrapróbálja
    throw e;
  }
  return cache.conn;
}

/** Tesztekhez/scriptekhez. */
export async function disconnectDb(): Promise<void> {
  if (cache.conn) await cache.conn.disconnect();
  cache.conn = null;
  cache.promise = null;
}
