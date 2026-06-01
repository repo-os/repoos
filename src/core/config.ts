/**
 * Config resolution. Zero-config by default; `repoos.toml` at the repo root
 * can override any field. We parse only the flat subset of TOML we need, again
 * to avoid a runtime dependency.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RepoOSConfig, Status, Assignee } from "./types.js";

export const DEFAULT_CONFIG: Omit<RepoOSConfig, "root"> = {
  workDir: "work",
  docsDir: "docs",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
};

/** Walk upward from `start` to find the repo root (nearest .git or repoos.toml). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, "repoos.toml"))
    ) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return resolve(start); // hit filesystem root; fall back
    dir = parent;
  }
}

/** Extremely small flat-TOML reader: `key = value` and `[section]` headers. */
function parseFlatToml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section = "";
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1];
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = section ? `${section}.${kv[1]}` : kv[1];
    let val: unknown = kv[2].trim();
    const s = val as string;
    if (s.startsWith("[") && s.endsWith("]")) {
      val = s
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (/^-?\d+$/.test(s)) {
      val = Number(s);
    } else if (s === "true" || s === "false") {
      val = s === "true";
    } else {
      val = s.replace(/^["']|["']$/g, "");
    }
    out[key] = val;
  }
  return out;
}

export function loadConfig(rootArg?: string): RepoOSConfig {
  const root = rootArg ? resolve(rootArg) : findRepoRoot();
  const cfg: RepoOSConfig = { root, ...DEFAULT_CONFIG };

  const tomlPath = join(root, "repoos.toml");
  if (existsSync(tomlPath)) {
    const parsed = parseFlatToml(readFileSync(tomlPath, "utf8"));
    const get = (k: string) => parsed[k] ?? parsed[`repoos.${k}`];
    if (typeof get("workDir") === "string") cfg.workDir = get("workDir") as string;
    if (typeof get("docsDir") === "string") cfg.docsDir = get("docsDir") as string;
    if (Array.isArray(get("taskExtensions")))
      cfg.taskExtensions = get("taskExtensions") as string[];
    if (typeof get("defaultStatus") === "string")
      cfg.defaultStatus = get("defaultStatus") as Status;
    if (typeof get("defaultAssignee") === "string")
      cfg.defaultAssignee = get("defaultAssignee") as Assignee;
    if (typeof get("cacheDir") === "string") cfg.cacheDir = get("cacheDir") as string;
  }
  return cfg;
}
