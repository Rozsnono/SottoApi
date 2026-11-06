/**
 * Egyszerű, titokmentes naplózó. A részletes technikai hiba a szerverlogba kerül,
 * a felhasználó csak érthető üzenetet kap (lásd `http.ts`).
 * Tilos naplózni: üzenettartalmat, ciphertextet, kulcsot, tokent, jelszót, helyreállító kódot.
 */
const REDACT = /(pass|secret|token|key|cipher|authorization|cookie|recovery|nonce|signature)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[mély]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: "info" | "warn" | "error", msg: string, meta?: unknown): void {
  const line = { t: new Date().toISOString(), level, msg, ...(meta ? { meta: redact(meta) } : {}) };
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify(line));
}

export const logger = {
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  /** Hibát naplóz stack nélkül a válaszban, de a logban a részletekkel (secret nélkül). */
  error: (msg: string, err?: unknown, meta?: unknown) =>
    write("error", msg, {
      ...(meta as object),
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    }),
};
