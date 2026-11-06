/** Fejlesztői/teszt adapter: a „média” helyi lemezen (csak titkosított tartalomra szánt). */
import { promises as fs } from "node:fs";
import path from "node:path";
import { assertMediaRef, type MediaHealth, type MediaInfo, type MediaStorageAdapter } from "./adapter";

export class LocalDiskAdapter implements MediaStorageAdapter {
  constructor(private dir: string) {}
  private p(ref: string) {
    assertMediaRef(ref);
    return path.join(this.dir, ref);
  }
  async put(ref: string, data: Uint8Array): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.p(ref), data);
  }
  async info(ref: string): Promise<MediaInfo> {
    try {
      return { exists: true, sizeBytes: (await fs.stat(this.p(ref))).size };
    } catch {
      return { exists: false };
    }
  }
  async delete(ref: string): Promise<void> {
    await fs.rm(this.p(ref), { force: true });
  }
  async health(): Promise<MediaHealth> {
    await fs.mkdir(this.dir, { recursive: true });
    return { ok: true, detail: "Helyi lemezes adapter (csak fejlesztéshez)." };
  }
}
