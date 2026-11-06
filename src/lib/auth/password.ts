/** Jelszó hash/ellenőrzés (bcrypt, cost ≥ 12). Soha nem naplózunk jelszót. */
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Időzítés-kiegyenlítéshez: nemlétező felhasználónál is lefuttatunk egy valódi bcrypt összehasonlítást. */
let dummyHash: Promise<string> | null = null;
export async function dummyVerify(plain: string): Promise<void> {
  dummyHash ??= bcrypt.hash("sotto-dummy-password", COST);
  await bcrypt.compare(plain, await dummyHash);
}
