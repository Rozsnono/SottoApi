/**
 * Szerver-indításkor egyszer lefut (Next.js instrumentation hook): kiírja a verziót és a portot,
 * hogy a naplóból azonnal látszódjon, melyik kiadás melyik porton fut.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { version } = (await import("../package.json")).default as { version: string };
  const port = process.env.PORT || "3000";
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  console.log(`[sotto-api] v${version} | port ${port} | ${mode}`);
}
