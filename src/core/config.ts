/**
 * Config resolution. Zero-config by default; `repoos.toml` at the repo root
 * can override any field. We parse only the flat subset of TOML we need, again
 * to avoid a runtime dependency.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type {
  Agent,
  RepoOSConfig,
  Status,
  Assignee,
  Theme,
  UiTheme,
  TaskMode,
} from "./types.js";
import { STATUSES } from "./types.js";

/** Coding agents an Agent can run under. */
export const AGENT_CLIS = ["opencode", "claude code", "qwen code", "codex"] as const;
/** Models an Agent can pin (or "default" for the coding agent's default). */
export const AGENT_MODELS = ["default", "big pickle", "deepseek v4"] as const;

/** Built-in agents, seeded at runtime when the config has none. */
export const DEFAULT_AGENTS: Agent[] = [
  {
    name: "engineer",
    cli: "opencode",
    model: "big pickle",
    enabled: true,
    instructions:
      "Implements tasks: reads the task file, writes clean code, runs `repoos check`, updates the task status.",
  },
  {
    name: "reviewer",
    cli: "opencode",
    model: "big pickle",
    enabled: true,
    instructions:
      "Reviews task diffs on the feature branch; requests changes by updating the task status; approves only on a green `repoos check`.",
  },
  {
    name: "pm",
    cli: "opencode",
    model: "big pickle",
    enabled: true,
    instructions:
      "Owns the roadmap: moves tasks between statuses, writes activity entries, keeps the work board tidy.",
  },
];

/** Default agent names — these are seeded and cannot be removed. */
export const DEFAULT_AGENT_NAMES = DEFAULT_AGENTS.map((a) => a.name);

export const DEFAULT_CONFIG: Omit<RepoOSConfig, "root"> = {
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
  theme: "system",
  uiTheme: "classic",
  defaultTaskMode: "freeform",
  agents: [],
};

/**
 * Sibling directory that holds per-task agent worktrees, e.g.
 * `/path/to/repoos` -> `/path/to/repoos-worktrees/`. Kept OUTSIDE the repo
 * root so a linked worktree can never dirty the main checkout or confuse
 * `repoos check` staleness. `<branch>` path segments are kept so a worktree
 * for `feat/123-x` lives at `<dir>/feat/123-x`.
 */
export function worktreesDir(root: string): string {
  return join(dirname(root), `${basename(root)}-worktrees`);
}

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

/** Extremely small flat-TOML reader: `key = value`, `[section]` headers, and `[[array-of-tables]]`. */
function parseFlatToml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section = "";
  let arrayTable: Record<string, unknown> | null = null;
  let arrayTableKey = "";
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const arrSec = line.match(/^\[\[([^\]]+)\]\]$/);
    if (arrSec) {
      section = "";
      arrayTableKey = arrSec[1];
      const arr = (out[arrayTableKey] as Record<string, unknown>[]) ?? [];
      arrayTable = {};
      arr.push(arrayTable);
      out[arrayTableKey] = arr;
      continue;
    }
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1];
      arrayTable = null;
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
    if (arrayTable && arrayTableKey) {
      arrayTable[kv[1]] = val;
    } else {
      out[key] = val;
    }
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
    if (typeof get("skillsDir") === "string") cfg.skillsDir = get("skillsDir") as string;
    if (Array.isArray(get("taskExtensions")))
      cfg.taskExtensions = get("taskExtensions") as string[];
    if (typeof get("defaultStatus") === "string")
      cfg.defaultStatus = get("defaultStatus") as Status;
    if (typeof get("defaultAssignee") === "string")
      cfg.defaultAssignee = get("defaultAssignee") as Assignee;
    if (typeof get("cacheDir") === "string") cfg.cacheDir = get("cacheDir") as string;
    if (typeof get("strictBuild") === "boolean") cfg.strictBuild = get("strictBuild") as boolean;
    if (typeof get("theme") === "string") cfg.theme = get("theme") as Theme;
    if (typeof get("uiTheme") === "string")
      cfg.uiTheme = get("uiTheme") as UiTheme;
    const taskMode = get("defaultTaskMode");
    if (taskMode === "freeform" || taskMode === "manual") cfg.defaultTaskMode = taskMode;
    if (Array.isArray(parsed.agents)) cfg.agents = parsed.agents as Agent[];
  }
  return cfg;
}

/** Metadata describing a single config field for the Settings UI. */
export interface ConfigFieldMeta {
  key: string;
  label: string;
  type: "string" | "boolean" | "select" | "array";
  tier: "live" | "restart" | "guarded";
  restartRequired: boolean;
  default: unknown;
  options?: { value: string; label: string }[];
  description: string;
}

export function getConfigSchema(): ConfigFieldMeta[] {
  return [
    {
      key: "theme",
      label: "Theme",
      type: "select",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.theme,
      options: [
        { value: "system", label: "System (follow OS)" },
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
      ],
      description: "UI appearance — applies immediately, no restart",
    },
    {
      key: "uiTheme",
      label: "Design theme",
      type: "select",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.uiTheme,
      options: [
        { value: "classic", label: "Classic" },
        { value: "clear", label: "Clear" },
        { value: "gen z", label: "Gen Z" },
      ],
      description: "Visual design language — applies immediately, no restart",
    },
    {
      key: "defaultStatus",
      label: "Default status",
      type: "select",
      tier: "restart",
      restartRequired: true,
      default: DEFAULT_CONFIG.defaultStatus,
      options: STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
      description: "Status assigned to new tasks",
    },
    {
      key: "defaultTaskMode",
      label: "New-task mode",
      type: "select",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.defaultTaskMode,
      options: [
        { value: "freeform", label: "Freeform (AI writes the task)" },
        { value: "manual", label: "Manual form" },
      ],
      description: "Which flow the New task drawer opens with",
    },
    {
      key: "defaultAssignee",
      label: "Default assignee",
      type: "select",
      tier: "restart",
      restartRequired: true,
      default: DEFAULT_CONFIG.defaultAssignee,
      options: [
        { value: "unassigned", label: "Unassigned" },
        { value: "ai", label: "AI agent" },
        { value: "human", label: "Human" },
      ],
      description: "Default assignee for new tasks",
    },
    {
      key: "strictBuild",
      label: "Strict build check",
      type: "boolean",
      tier: "restart",
      restartRequired: true,
      default: false,
      description: "Exit with error on stale build instead of warning",
    },
    {
      key: "workDir",
      label: "Work directory",
      type: "string",
      tier: "guarded",
      restartRequired: true,
      default: DEFAULT_CONFIG.workDir,
      description: "Directory holding task files (relative to repo root)",
    },
    {
      key: "docsDir",
      label: "Docs directory",
      type: "string",
      tier: "guarded",
      restartRequired: true,
      default: DEFAULT_CONFIG.docsDir,
      description: "Directory holding context docs (relative to repo root)",
    },
    {
      key: "skillsDir",
      label: "Skills directory",
      type: "string",
      tier: "guarded",
      restartRequired: true,
      default: DEFAULT_CONFIG.skillsDir,
      description: "Directory holding skills (relative to repo root)",
    },
    {
      key: "taskExtensions",
      label: "Task extensions",
      type: "array",
      tier: "guarded",
      restartRequired: true,
      default: DEFAULT_CONFIG.taskExtensions,
      description: "File extensions treated as tasks (comma-separated)",
    },
    {
      key: "cacheDir",
      label: "Cache directory",
      type: "string",
      tier: "guarded",
      restartRequired: true,
      default: DEFAULT_CONFIG.cacheDir,
      description: "Directory for derived index cache (relative to repo root)",
    },
  ];
}

function serializeTomlVal(val: unknown): string {
  if (typeof val === "string") return JSON.stringify(val);
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "true" : "false";
  if (Array.isArray(val)) {
    return `[${val.map((v) => JSON.stringify(v)).join(", ")}]`;
  }
  return String(val);
}

/** True when a value is an array of plain objects → serialized as [[tables]]. */
function isTableArray(val: unknown): val is Record<string, unknown>[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    val.every((v) => typeof v === "object" && v !== null && !Array.isArray(v))
  );
}

/** Serialize an array of plain objects as `[[key]]` table blocks. */
function serializeTableArray(key: string, rows: Record<string, unknown>[]): string {
  return rows
    .map((row) => {
      const body = Object.entries(row)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k} = ${serializeTomlVal(v)}`);
      return `[[${key}]]\n${body.join("\n")}`;
    })
    .join("\n");
}

/**
 * Patch a repoos.toml file with the given key-value pairs, preserving all
 * other lines (comments, formatting, unknown keys).
 */
export function patchTomlConfig(tomlPath: string, patch: Record<string, unknown>): void {
  if (!existsSync(tomlPath)) {
    writeFileSync(tomlPath, "", "utf8");
  }

  const text = readFileSync(tomlPath, "utf8");
  let result = text.replace(/\r\n/g, "\n").split("\n");
  let modified = false;

  // Array-of-tables keys ([[agents]]): drop the existing blocks and append the
  // freshly serialized ones at the end of the file.
  for (const [key, rawVal] of Object.entries(patch)) {
    if (!isTableArray(rawVal)) continue;
    const blocks = serializeTableArray(key, rawVal);
    const kept: string[] = [];
    let i = 0;
    while (i < result.length) {
      if (result[i].replace(/#.*$/, "").trim() === `[[${key}]]`) {
        i++;
        while (i < result.length) {
          const s = result[i].replace(/#.*$/, "").trim();
          if (s.startsWith("[")) break;
          i++;
        }
        continue;
      }
      kept.push(result[i]);
      i++;
    }
    while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
    kept.push(blocks);
    result = kept;
    modified = true;
  }

  // Scalars and plain arrays: in-place line-preserving patch.
  for (const [key, rawVal] of Object.entries(patch)) {
    if (isTableArray(rawVal)) continue;
    const serialized = serializeTomlVal(rawVal);
    let found = false;

    for (let i = 0; i < result.length; i++) {
      const stripped = result[i].replace(/#.*$/, "").trim();
      if (!stripped || stripped.startsWith("[")) continue;

      const kv = stripped.match(/^([A-Za-z0-9_.-]+)\s*=\s*/);
      if (kv && kv[1] === key) {
        const indent = result[i].match(/^\s*/)?.[0] || "";
        result[i] = `${indent}${key} = ${serialized}`;
        modified = true;
        found = true;
        break;
      }
    }

    if (!found) {
      result.push(`${key} = ${serialized}`);
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(tomlPath, result.join("\n") + "\n", "utf8");
  }
}
