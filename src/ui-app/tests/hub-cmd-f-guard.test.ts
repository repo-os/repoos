import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RepoOS Hub implements Cmd-F in native AppKit; the browser/PWA must not
 * override the platform find bar.
 *
 * Trace (#0789): nothing in src/ui-app binds Cmd/Ctrl-F. The settings-search
 * overlay in the report screenshot is the settings-scoped SearchOverlay empty
 * state ("Search settings by name or config key", SearchOverlay.vue), whose
 * only open paths are Cmd-K and pointer clicks (SettingsView, ContextView,
 * SearchBar). It was not opened by a Cmd-F path, so there is nothing to fix
 * there — this guard keeps it that way: ANY Cmd/Ctrl-F key handling fails,
 * not just handlers that call preventDefault.
 */
describe("browser find shortcut guard (#0783)", () => {
  it("does not handle Cmd/Ctrl-F in src/ui-app", async () => {
    const srcRoot = path.resolve(import.meta.dirname, "..");
    const files = await listSourceFiles(srcRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const mentionsFindKey =
          /key\.toLowerCase\(\)\s*===\s*["']f["']/.test(line) ||
          /key\s*===\s*["']f["']/.test(line) ||
          /["']f["']\s*===\s*key/.test(line);
        if (!mentionsFindKey) continue;
        const windowStart = Math.max(0, index - 6);
        const windowEnd = Math.min(lines.length, index + 2);
        const context = lines.slice(windowStart, windowEnd).join("\n");
        if (/metaKey|ctrlKey/.test(context)) {
          offenders.push(`${path.relative(srcRoot, file)}:${index + 1}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not call preventDefault on Cmd-F in src/ui-app", async () => {
    const srcRoot = path.resolve(import.meta.dirname, "..");
    const files = await listSourceFiles(srcRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.includes("preventDefault")) continue;
        const windowStart = Math.max(0, index - 6);
        const windowEnd = Math.min(lines.length, index + 2);
        const context = lines.slice(windowStart, windowEnd).join("\n");
        const mentionsFindKey =
          /key\.toLowerCase\(\)\s*===\s*["']f["']/.test(context) ||
          /key\s*===\s*["']f["']/.test(context) ||
          /["']f["']\s*===\s*key/.test(context);
        const mentionsMeta = /metaKey|ctrlKey/.test(context);
        if (mentionsFindKey && mentionsMeta) {
          offenders.push(`${path.relative(srcRoot, file)}:${index + 1}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "tests") continue;
      files.push(...(await listSourceFiles(full)));
    } else if (/\.(vue|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}
