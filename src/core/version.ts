import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Reads the version stamped into .build-info.json at build time; falls back for dev/source runs. */
export function readVersion(): string {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const info = JSON.parse(readFileSync(join(root, ".build-info.json"), "utf8")) as {
      version?: string;
    };
    if (info.version) return info.version;
  } catch {
    /* fall through */
  }
  return "0.0.0-dev";
}
