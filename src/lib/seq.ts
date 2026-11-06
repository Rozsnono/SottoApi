/** Monoton sorszám-kiosztás a szinkron-kurzorhoz (üzenet-, törlés- és olvasás-események közös számlálója). */
import { Counter } from "@/models";

export async function nextSeq(): Promise<number> {
  const c = await Counter.findOneAndUpdate({ _id: "sync" }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after" });
  return c.value;
}
