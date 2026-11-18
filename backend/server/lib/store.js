import fs from "node:fs/promises";
import path from "node:path";

/** Small JSON file store: serialized writes, atomic tmp+rename, survives crashes mid-write. */
export class JsonStore {
  constructor(file, fallback) {
    this.file = file;
    this.fallback = fallback;
    this.queue = Promise.resolve();
  }
  async load() {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return structuredClone(this.fallback);
      throw e;
    }
  }
  save(data) {
    const run = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
      await fs.rename(tmp, this.file);
    });
    this.queue = run.catch(() => {}); // a failed write must not poison later writes
    return run;
  }
}

/** Append-only JSON-lines audit log. */
export async function appendLine(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(obj) + "\n", { mode: 0o600 });
}
