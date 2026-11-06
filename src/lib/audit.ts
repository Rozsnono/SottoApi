/**
 * AuditLogger. Soha nem dob: ha az írás sikertelen, a hiba a szerverlogba kerül (nincs néma hiba).
 * Tartalmat, kulcsot, tokent, jelszót nem naplózunk.
 */
import { connectDb } from "./db";
import { AuditLog } from "@/models";
import { logger } from "./logger";

export interface AuditEntry {
  actorType: "admin" | "user" | "system";
  actorId?: string;
  action: string;
  target?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await connectDb();
    await AuditLog.create(entry);
  } catch (e) {
    logger.error("Audit napló írása sikertelen", e, { action: entry.action });
  }
}
