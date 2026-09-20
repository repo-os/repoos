/**
 * Config resolution. Zero-config by default; `repoos.toml` at the repo root
 * can override any field. We parse only the flat subset of TOML we need, again
 * to avoid a runtime dependency.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type {
  Agent,
  AuthConfig,
  BuiltInAgentConfig,
  BuiltInAgentSchedule,
  CheckContrastPair,
  CheckThemeScope,
  DeploymentConfig,
  DistributionConfig,
  DistributionKind,
  ModelProviderKeysConfig,
  PreviewConfig,
  PreviewTargetConfig,
  RepoOSConfig,
  Status,
  Assignee,
  Theme,
  UiTheme,
  WhisperConfig,
} from "./types.js";
import { STATUSES } from "./types.js";
import { parseCheckPlanConfig } from "./check-plan.js";
import { stripTomlComment, unquoteTomlString } from "./toml-line.js";

/** Default display labels for board columns, keyed by canonical status ID. */
export const DEFAULT_COLUMN_LABELS: Record<string, string> = {
  draft: "Proposed / Drafts",
  inbox: "Inbox",
  ready: "Ready",
  active: "Active",
  review: "Review",
  done: "Done",
};

/** Coding agents an Agent can run under. */
export const AGENT_CLIS = [
  "opencode",
  "claude code",
  "qwen code",
  "kiro",
  "codex",
  "github copilot",
  "cursor",
  "antigravity",
] as const;
/** Models an Agent can pin (or "default" for the coding agent's default). */
export const AGENT_MODELS = ["default", "big pickle", "deepseek v4"] as const;

/** Built-in agents, seeded at runtime when the config has none. */
export const DEFAULT_AGENTS: Agent[] = [
  {
    name: "Ross",
    cli: "opencode",
    model: "big pickle",
    enabled: true,
    instructions:
      "You are Ross, a repository-aware assistant inspired by Ross Geller from Friends — warm, enthusiastic, and genuinely curious about code and context. You answer questions about this repository, RepoOS, tasks, statuses, issues, and code with clear, helpful explanations and occasional dry wit. Never edit files, change task state, or modify the repository.",
  },
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
      "Reviews a task the moment it lands in `review`: reads the diff in the task's worktree and reports bugs, edge cases, and suggestions for the human signing off. Never changes a task's status.",
  },
  {
    name: "pm",
    cli: "opencode",
    model: "big pickle",
    enabled: true,
    instructions:
      "Owns the roadmap: moves tasks between statuses, writes activity entries, keeps the work board tidy.",
  },
  {
    name: "cto",
    cli: "opencode",
    model: "big pickle",
    enabled: false,
    instructions:
      "You are the CTO: an always-on board monitor and un-sticker. Watch for stuck tasks, stale reviews, zombie processes, and broken builds. Report what you find, escalate when needed, and ask the human before taking action. Never move a task to done, merge branches, delete worktrees, change config, or spend money.",
  },
];

/** Default agent names — these are seeded and cannot be removed. */
export const DEFAULT_AGENT_NAMES = DEFAULT_AGENTS.map((a) => a.name);

const REPO_GUIDE_NAME = "Ross";
const REPO_GUIDE_LEGACY_NAME = "RepoOS Guide";

/**
 * Add Ross to an existing stored agent list without replacing user edits.
 * When the stored config has the legacy "RepoOS Guide" name, rename it to "Ross"
 * so the chat continues working. The other defaults deliberately are not
 * re-seeded: a user may have removed one of those roles from an older configuration.
 */
export function agentsForConfig(config: Pick<RepoOSConfig, "agents">): Agent[] {
  const stored = Array.isArray(config.agents) ? config.agents : [];
  if (!stored.length) return DEFAULT_AGENTS.map((agent) => ({ ...agent }));

  // Migrate legacy "RepoOS Guide" name to "Ross", preserving all other fields
  const migrated = stored.map((agent) =>
    agent.name.toLowerCase() === REPO_GUIDE_LEGACY_NAME.toLowerCase()
      ? { ...agent, name: REPO_GUIDE_NAME }
      : agent,
  );

  const names = new Set(migrated.map((agent) => agent.name.toLowerCase()));
  const guide = DEFAULT_AGENTS.find((agent) => agent.name === REPO_GUIDE_NAME);
  return [
    ...migrated.map((agent) => ({ ...agent })),
    ...(guide && !names.has(REPO_GUIDE_NAME.toLowerCase()) ? [{ ...guide }] : []),
  ];
}

/**
 * "Auto" default for `maxConcurrentAgents`. An agent's own test pool
 * is capped separately (vite.config.ts `test.poolOptions.forks.maxForks: 2`),
 * so one agent's worst-case footprint is bounded rather than "the whole
 * machine" — this can size off total cores directly instead of dividing them
 * away defensively. `cores / 2` leaves headroom for that ~2-worker pool plus
 * the agent process's own overhead per concurrent agent; capped at 8 so a
 * many-core desktop doesn't queue dozens of agents whose non-test work (tool
 * calls, I/O) still contends over shared resources like the git index.
 */
export function defaultMaxConcurrentAgents(): number {
  return Math.max(2, Math.min(8, Math.floor(cpus().length / 2)));
}

export const DEFAULT_CONFIG: Omit<RepoOSConfig, "root"> = {
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  inputsDir: "inputs",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
  theme: "system",
  uiTheme: "classic",
  defaultTaskMode: "freeform",
  tunnelEnabled: false,
  ntfyEnabled: false,
  ntfyTopic: "",
  ntfyBaseUrl: "https://ntfy.sh",
  agents: [],
  supervisor: {
    enabled: false,
    interval: 300,
    mode: "observe",
  },
  watchdog: {
    enabled: true,
    stalenessMs: 5 * 60 * 1000,
    autoTransition: true,
  },
  autoEngineeringMode: false,
  skillSuggestions: false,
  maxActiveTasks: 3,
  worktreeWarnThreshold: 20,
  whisper: {
    provider: "none",
    apiKey: "",
  },
  auth: {
    enabled: false,
    sessionMaxAge: 2592000,
  },
  remoteValidation: {
    enabled: false,
    provider: "hetzner",
    serverType: "cax31",
    location: "hil",
    idleShutdownMinutes: 8,
    maxServerLifetimeMinutes: 120,
    fallbackToLocal: false,
  },
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

/**
 * Read just the `[worktrees] inheritEnv` opt-in straight from `repoos.toml`,
 * without a full `loadConfig` (which would also run `loadDotEnv` and mutate
 * `process.env`). `ensureWorktree` calls this per worktree resolution to decide
 * whether to link the main checkout's `.env` into the worktree (#0373). A
 * missing file, a missing key, a non-boolean value, or any read/parse failure
 * all yield `false` — the safe default is no secrets in worktrees.
 */
export function worktreesInheritEnv(root: string): boolean {
  const tomlPath = join(root, "repoos.toml");
  if (!existsSync(tomlPath)) return false;
  try {
    return parseFlatToml(readFileSync(tomlPath, "utf8"))["worktrees.inheritEnv"] === true;
  } catch {
    return false;
  }
}

/** The port range `deriveServePort` picks from — deliberately just above the
 *  classic 7171 so a derived port never collides with a repo that pins it. */
const DERIVED_PORT_BASE = 7200;
const DERIVED_PORT_SPAN = 800;

/**
 * A stable default serve port for a repo, derived from its canonical root
 * path (djb2 hash → `${DERIVED_PORT_BASE}`..`${DERIVED_PORT_BASE + DERIVED_PORT_SPAN - 1}`).
 * Deterministic per checkout, so two repos on one machine don't both default
 * to 7171 and reap each other. Exported for tests.
 */
export function deriveServePort(root: string): number {
  let canonical = root;
  try {
    canonical = realpathSync(root);
  } catch {
    /* not on disk (a test fixture path) — hash the literal string */
  }
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(i)) >>> 0;
  }
  return DERIVED_PORT_BASE + (hash % DERIVED_PORT_SPAN);
}

/**
 * Resolve the port `repoos serve` should bind: an explicit `--port` flag wins,
 * then `servePort` in repoos.toml, then a stable per-repo derived port.
 */
export function resolveServePort(
  root: string,
  config: { servePort?: number },
  portFlag?: number,
): number {
  if (Number.isInteger(portFlag) && (portFlag as number) > 0) return portFlag as number;
  if (Number.isInteger(config.servePort) && (config.servePort as number) > 0) {
    return config.servePort as number;
  }
  return deriveServePort(root);
}

/**
 * Load `.env` from the repo root into `process.env`, if present. Zero
 * runtime deps (no dotenv package) — a minimal `KEY=value` parser, one line
 * per variable. Real env vars already set take precedence over the file, so
 * e.g. a systemd unit's `Environment=` still wins. Safe to call more than
 * once; safe when `.env` doesn't exist.
 */
export function loadDotEnv(root: string = findRepoRoot()): void {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * Persist a local secret to the gitignored `.env` at the repo root, keeping
 * the same env-var-secret convention `loadDotEnv` reads back (dev backdoor
 * code, auth provider keys, model-provider API keys). An empty `value`
 * removes the line entirely so a cleared secret can't linger as `KEY=`.
 * Also updates `process.env` directly: `loadDotEnv` skips keys already
 * present in the environment, so a re-`loadConfig` alone would never refresh
 * a value the booting process had already seen.
 *
 * Only ever called with the fixed secret names this codebase owns (the
 * model-provider keys today) — callers validate that before calling. The
 * value is written raw, one `KEY=value` line, exactly what `loadDotEnv`
 * parses back.
 */
export function setDotEnvSecret(root: string, key: string, value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid env var name: ${JSON.stringify(key)}`);
  }
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error("Secret value must not contain newlines");
  }
  const envPath = join(root, ".env");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let found = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const eq = trimmed.indexOf("=");
    const name = eq > 0 ? trimmed.slice(0, eq).trim() : "";
    if (name === key) {
      found = true;
      continue;
    }
    kept.push(rawLine);
  }
  if (value) kept.push(`${key}=${value}`);
  if (!found && lines.length && kept[kept.length - 1] === "") kept.pop();
  writeFileSync(envPath, kept.join("\n") + "\n", "utf8");
  if (value) process.env[key] = value;
  else delete process.env[key];
}

/** Walk upward from `start` to find the repo root (nearest .git or repoos.toml). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, "repoos.toml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return resolve(start); // hit filesystem root; fall back
    dir = parent;
  }
}

/**
 * True when `dir` is a LINKED WORKTREE root rather than a real repo root: a
 * worktree's `.git` is a FILE reading `gitdir: …`, while a real root's `.git`
 * is a directory. Cheap — one stat, no git subprocess.
 *
 * `findRepoRoot` does not make this distinction (it matches any `.git`), which
 * is exactly why board reads run from inside a worktree used to silently
 * resolve to the worktree's own copy of the task files instead of the live
 * board's main checkout (the #0068 false-positive).
 */
export function isLinkedWorktreeRoot(dir: string): boolean {
  const gitPath = join(dir, ".git");
  if (!existsSync(gitPath)) return false;
  try {
    return statSync(gitPath).isFile();
  } catch {
    return false;
  }
}

/**
 * The MAIN checkout root for a linked worktree, or null when `dir` is not a
 * linked worktree root. A worktree's `.git` file points at
 * `<main>/.git/worktrees/<name>` (absolute, or relative to the worktree); the
 * main root is the first ancestor of that pointer whose own `.git` is a
 * directory. Fail-soft: any anomaly yields null and callers fall back to the
 * resolved root.
 */
export function mainCheckoutRoot(dir: string): string | null {
  if (!isLinkedWorktreeRoot(dir)) return null;
  let text: string;
  try {
    text = readFileSync(join(dir, ".git"), "utf8");
  } catch {
    return null;
  }
  const m = text.match(/^gitdir:\s*(.+)$/m);
  if (!m) return null;
  let probe = resolve(dir, m[1].trim());
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(probe, ".git")) && !isLinkedWorktreeRoot(probe)) {
      return probe;
    }
    const parent = resolve(probe, "..");
    if (parent === probe) return null; // hit filesystem root — not a worktree
    probe = parent;
  }
}

/**
 * The project display name: `basename(mainCheckoutRoot(root) ?? root)` — never
 * the raw worktree basename. When the server runs inside a task worktree this
 * resolves to the main checkout's directory name (e.g. "repoos"), not the
 * branch name that the worktree directory is named after.
 */
export function projectDisplayName(root: string): string {
  return basename(mainCheckoutRoot(root) ?? root) || "repoos";
}

/**
 * The branch name when `root` is a linked worktree, or null when it is the
 * main checkout. Useful for "repo × branch" display combinations.
 */
export function projectDisplayBranch(root: string): string | null {
  return mainCheckoutRoot(root) !== null ? basename(root) : null;
}

/**
 * The root LIVE-BOARD reads (`repoos show`/`list`/`index`) should resolve to:
 * the MAIN checkout even when the CLI runs inside a task worktree, so a
 * readback can never false-positive on the worktree's own copy. `fromWorktree`
 * signals that resolution jumped the main checkout — callers surface it so the
 * behavior is never silent. Mutating commands keep `findRepoRoot` semantics
 * (they must act on the directory they run in).
 */
export function boardRoot(start?: string): { root: string; fromWorktree: boolean } {
  const resolved = findRepoRoot(start);
  const main = mainCheckoutRoot(resolved);
  return main ? { root: main, fromWorktree: true } : { root: resolved, fromWorktree: false };
}

/**
 * Extremely small flat-TOML reader: `key = value`, `[section]` headers, and
 * `[[array-of-tables]]`. Exported so callers that need the raw key set (e.g.
 * `repoos doctor`'s unknown-key check) read the same parse `loadConfig` does,
 * rather than re-implementing the tokenizer.
 */
export function parseFlatToml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section = "";
  let arrayTable: Record<string, unknown> | null = null;
  let arrayTableKey = "";
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripTomlComment(rawLine).trim();
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
        .map((x) => unquoteTomlString(x.trim()))
        .filter(Boolean);
    } else if (/^-?\d+$/.test(s)) {
      val = Number(s);
    } else if (s === "true" || s === "false") {
      val = s === "true";
    } else {
      val = unquoteTomlString(s);
    }
    if (arrayTable && arrayTableKey) {
      arrayTable[kv[1]] = val;
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Parse `[board.columns]` from the flat TOML output. Invalid entries (blank,
 * non-string, >40 chars after trim, or duplicate of another column's final
 * label) fall back to the default for that column. Returns undefined when no
 * override is configured.
 */
export function parseBoardColumns(
  parsed: Record<string, unknown>,
): Record<string, string> | undefined {
  const overrides: Record<string, string> = {};
  // Seed with default labels so overrides that collide with another column's
  // default are caught (e.g. ready = "Done" while done keeps its default).
  const usedLabels = new Map<string, string>();
  for (const [status, label] of Object.entries(DEFAULT_COLUMN_LABELS)) {
    usedLabels.set(label.toLowerCase(), status);
  }

  for (const status of STATUSES) {
    const key = `board.columns.${status}`;
    const raw = parsed[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      console.warn(`[board.columns] ${status}: non-string value ignored`);
      continue;
    }
    const label = raw.trim();
    if (!label) {
      console.warn(`[board.columns] ${status}: blank label ignored, using default`);
      continue;
    }
    if (label.length > 40) {
      console.warn(
        `[board.columns] ${status}: label exceeds 40 chars (${label.length}), using default`,
      );
      continue;
    }
    const existing = usedLabels.get(label.toLowerCase());
    if (existing) {
      console.warn(
        `[board.columns] ${status}: duplicate label "${label}" (already used by ${existing}), using default`,
      );
      continue;
    }
    usedLabels.set(label.toLowerCase(), status);
    overrides[status] = label;
  }

  return Object.keys(overrides).length ? overrides : undefined;
}

/** Resolve the full set of column labels, merging config overrides over defaults. */
export function resolveColumnLabels(boardColumns?: Record<string, string>): Record<string, string> {
  const out = { ...DEFAULT_COLUMN_LABELS };
  if (boardColumns) {
    for (const [k, v] of Object.entries(boardColumns)) {
      if (k in out) out[k] = v;
    }
  }
  return out;
}

const DISTRIBUTION_KINDS: readonly DistributionKind[] = [
  "npm",
  "homebrew",
  "github-release",
  "custom",
];

/**
 * Parse the `[[distribution]]` array of tables (#0445) — one row per place
 * users install this project's releases. Invalid rows are dropped with a
 * warning rather than poisoning the section: a missing name, a non-http(s)
 * `url`, or an uncompilable `versionRegex`. An unrecognized `kind` is not an
 * error — the channel still renders its install commands, just with no
 * automatic version check. Returns undefined when nothing usable is declared,
 * which keeps the Releases page's existing experience untouched.
 */
export function parseDistributionConfig(
  parsed: Record<string, unknown>,
): DistributionConfig[] | undefined {
  const raw = parsed.distribution;
  if (!Array.isArray(raw)) return undefined;
  const channels: DistributionConfig[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.name !== "string" || !r.name.trim()) {
      console.warn("[distribution] ignoring a channel with no name");
      continue;
    }
    const channel: DistributionConfig = { name: r.name.trim() };
    if (typeof r.kind === "string" && r.kind.trim()) {
      const kind = r.kind.trim() as DistributionKind;
      if (DISTRIBUTION_KINDS.includes(kind)) channel.kind = kind;
      else
        console.warn(`[distribution] ${channel.name}: unknown kind "${r.kind}", no version check`);
    }
    if (typeof r.url === "string" && r.url.trim()) {
      const url = r.url.trim();
      if (/^https?:\/\//i.test(url)) channel.url = url;
      else console.warn(`[distribution] ${channel.name}: url must start with http(s)://, dropping`);
    }
    if (typeof r.package === "string" && r.package.trim()) channel.package = r.package.trim();
    if (typeof r.repository === "string" && r.repository.trim())
      channel.repository = r.repository.trim();
    if (typeof r.versionUrl === "string" && r.versionUrl.trim())
      channel.versionUrl = r.versionUrl.trim();
    if (typeof r.versionRegex === "string" && r.versionRegex.trim()) {
      const pattern = r.versionRegex.trim();
      try {
        new RegExp(pattern);
        channel.versionRegex = pattern;
      } catch {
        console.warn(
          `[distribution] ${channel.name}: versionRegex is not a valid regex, dropping it`,
        );
      }
    }
    const installRaw = r.install;
    const install = (Array.isArray(installRaw) ? installRaw : [installRaw])
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.trim());
    if (install.length) channel.install = install;
    channels.push(channel);
  }
  return channels.length ? channels : undefined;
}

/**
 * Parse the `[preview]` section (plus `[[preview.targets]]` tables) from flat
 * TOML. Exported for tests; `loadConfig` merges the result into the config.
 * Rows without a usable `command` are dropped rather than poisoning resolution.
 */
export function parsePreviewConfig(parsed: Record<string, unknown>): PreviewConfig | undefined {
  const preview: PreviewConfig = {};
  const command = parsed["preview.command"];
  if (typeof command === "string" && command.trim()) preview.command = command.trim();
  const cwd = parsed["preview.cwd"];
  if (typeof cwd === "string" && cwd.trim()) preview.cwd = cwd.trim();
  const readyPath = normalizeReadyPath(parsed["preview.readyPath"]);
  if (readyPath) preview.readyPath = readyPath;
  const readyTimeoutMs = normalizeReadyTimeoutMs(parsed["preview.readyTimeoutMs"]);
  if (readyTimeoutMs) preview.readyTimeoutMs = readyTimeoutMs;

  if (Array.isArray(parsed["preview.targets"])) {
    const targets: PreviewTargetConfig[] = [];
    // Target names are the pick/label key the UI and resolution use (#0379), so
    // they must be unique. Auto-derived names (`areas.join("/")`) collide the
    // moment two targets claim the same area, and explicit duplicates are just
    // as easy to write; either would render two identical picker options and
    // make `resolvePreviewTarget(name)` select the first silently. Disambiguate
    // deterministically with a numeric suffix instead of dropping a target.
    const usedNames = new Set<string>();
    for (const raw of parsed["preview.targets"]) {
      if (typeof raw !== "object" || raw === null) continue;
      const r = raw as Record<string, unknown>;
      const targetCommand = typeof r.command === "string" ? r.command.trim() : "";
      if (!targetCommand) continue;
      const areasRaw = r.areas;
      const areas = (Array.isArray(areasRaw) ? areasRaw : [areasRaw])
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .filter(Boolean);
      const base =
        typeof r.name === "string" && r.name.trim() ? r.name.trim() : areas.join("/") || "target";
      let name = base;
      for (let n = 2; usedNames.has(name); n++) name = `${base} (${n})`;
      usedNames.add(name);
      const target: PreviewTargetConfig = { name, areas, command: targetCommand };
      const targetCwd = typeof r.cwd === "string" ? r.cwd.trim() : "";
      if (targetCwd) target.cwd = targetCwd;
      const targetReadyPath = normalizeReadyPath(r.ready_path ?? r.readyPath);
      if (targetReadyPath) target.readyPath = targetReadyPath;
      const targetReadyTimeoutMs = normalizeReadyTimeoutMs(r.ready_timeout_ms ?? r.readyTimeoutMs);
      if (targetReadyTimeoutMs) target.readyTimeoutMs = targetReadyTimeoutMs;
      targets.push(target);
    }
    if (targets.length) preview.targets = targets;
  }

  const hasCustom = Boolean(preview.command) || Boolean(preview.targets?.length);
  return hasCustom ? preview : undefined;
}

/** Normalize a configured readiness path to a leading-slash path, or undefined. */
function normalizeReadyPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Normalize a configured readiness timeout (ms) to a positive finite number, or undefined. */
function normalizeReadyTimeoutMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/**
 * The `[preview]` keys that configure *how a preview boots* — the preview
 * feature's own settings. Any other `[preview.<path>]` table is a preview-only
 * override of the base configuration (#0464), not a preview setting.
 */
const PREVIEW_FEATURE_KEYS = new Set(["command", "cwd", "readyPath", "readyTimeoutMs", "targets"]);

export interface PreviewOverlay {
  /** Overridden base config paths (dotted, e.g. `"auth.enabled"`) -> value. */
  entries: Record<string, unknown>;
  /** The overridden paths, sorted, for reporting. */
  keys: string[];
}

/**
 * Extract the preview-only overrides from a flat-TOML parse (#0464). A key is
 * an overlay when it sits under `preview.` but is not one of the preview
 * feature's own keys; the path after `preview.` is the base config key it
 * overrides. Because `parseFlatToml` already flattens nested tables, merging is
 * deep by construction: `[preview.auth] enabled = false` contributes only
 * `auth.enabled`, leaving every other `[auth]` key at its base value.
 */
export function parsePreviewOverlays(parsed: Record<string, unknown>): PreviewOverlay {
  const entries: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith("preview.")) continue;
    const path = key.slice("preview.".length);
    const head = path.split(".")[0];
    if (PREVIEW_FEATURE_KEYS.has(head)) continue;
    if (typeof value === "object" && value !== null) continue; // no table arrays
    entries[path] = value;
  }
  const keys = Object.keys(entries).sort();
  return { entries, keys };
}

/**
 * True when `path` names a base configuration key RepoOS actually reads, so an
 * overlay targeting it is meaningful. `SUPPORTED_TOML_KEYS` (the same contract
 * the docs-drift test and `repoos doctor` use) lists the dotted leaves, so a
 * nested override like `auth.emailProvider.type` resolves while a typo or a
 * section name is dropped with a warning.
 */
function isOverridableConfigPath(path: string): boolean {
  return SUPPORTED_TOML_KEYS.includes(path);
}

/**
 * The preview-only override keys a repo's `repoos.toml` declares that the
 * runtime will actually apply (supported base keys only), sorted. Fail-soft: a
 * missing/unreadable file yields `[]`. Used by the preview manager to report
 * the effective overrides a preview boot is applying (#0464) — the child itself
 * warns about and drops the same unknown paths.
 */
export function readPreviewOverlayKeys(root: string): string[] {
  const tomlPath = join(root, "repoos.toml");
  if (!existsSync(tomlPath)) return [];
  try {
    return parsePreviewOverlays(parseFlatToml(readFileSync(tomlPath, "utf8"))).keys.filter(
      isOverridableConfigPath,
    );
  } catch {
    return [];
  }
}

export interface LoadConfigOptions {
  /**
   * Apply the repo's `[preview.*]` configuration overlay (#0464). Only the
   * preview/UI-test preview runtime sets this; every normal command leaves it
   * unset and resolves the base configuration unchanged.
   */
  previewOverrides?: boolean;
}

export function loadConfig(rootArg?: string, options: LoadConfigOptions = {}): RepoOSConfig {
  const root = rootArg ? resolve(rootArg) : findRepoRoot();
  // Load .env before resolving [auth]/[whisper] secrets below, so every path
  // that boots a real server (repoos serve, previews, the UI smoke test)
  // sees the same env-sourced values consistently, not just the CLI's own
  // entrypoint.
  loadDotEnv(root);
  const cfg: RepoOSConfig = { root, ...DEFAULT_CONFIG };

  const tomlPath = join(root, "repoos.toml");
  if (existsSync(tomlPath)) {
    const parsed = parseFlatToml(readFileSync(tomlPath, "utf8"));
    // Preview-only overlay (#0464): re-apply the `[preview.*]` keys over the
    // base parse before the normal field reads below, so precedence is
    // defaults → base repoos.toml → preview overlay → explicit CLI flags. Only
    // the preview/UI-test runtime opts in; every other caller sees the base
    // config. An overlay path RepoOS does not read is dropped with a warning
    // rather than silently accepted as a typo.
    const appliedOverrides: string[] = [];
    if (options.previewOverrides) {
      const overlay = parsePreviewOverlays(parsed);
      for (const [path, value] of Object.entries(overlay.entries)) {
        if (!isOverridableConfigPath(path)) {
          console.warn(`[preview] ignoring unknown preview override "${path}"`);
          continue;
        }
        parsed[path] = value;
        appliedOverrides.push(path);
      }
      appliedOverrides.sort();
      if (appliedOverrides.length) cfg.previewOverrides = appliedOverrides;
    }
    const get = (k: string) => parsed[k] ?? parsed[`repoos.${k}`];
    if (typeof get("workDir") === "string") cfg.workDir = get("workDir") as string;
    if (typeof get("docsDir") === "string") cfg.docsDir = get("docsDir") as string;
    if (typeof get("skillsDir") === "string") cfg.skillsDir = get("skillsDir") as string;
    if (typeof get("inputsDir") === "string") cfg.inputsDir = get("inputsDir") as string;
    if (Array.isArray(get("taskExtensions")))
      cfg.taskExtensions = get("taskExtensions") as string[];
    if (typeof get("defaultStatus") === "string")
      cfg.defaultStatus = get("defaultStatus") as Status;
    if (typeof get("defaultAssignee") === "string")
      cfg.defaultAssignee = get("defaultAssignee") as Assignee;
    if (typeof get("cacheDir") === "string") cfg.cacheDir = get("cacheDir") as string;
    if (typeof get("strictBuild") === "boolean") cfg.strictBuild = get("strictBuild") as boolean;
    const tunnelEnabled = parsed["tunnel.enabled"];
    if (typeof tunnelEnabled === "boolean") cfg.tunnelEnabled = tunnelEnabled;
    // Optional release surface. No [release] block means no Releases navigation
    // or API action, keeping this entirely dormant for other repositories.
    const releaseEnabled = parsed["release.enabled"];
    if (typeof releaseEnabled === "boolean") {
      cfg.release = { ...cfg.release, enabled: releaseEnabled };
      for (const key of [
        "provider",
        "name",
        "branch",
        "versionFile",
        "tagPrefix",
        "remote",
        "repository",
        "workflow",
      ] as const) {
        const value = parsed[`release.${key}`];
        if (typeof value === "string") cfg.release[key] = value as never;
      }
    }
    // Optional deployments surface (#0340). A [[deployments]] array of tables —
    // one per (service, branch) — is what turns the Deployments nav item and
    // API on; no block at all means the feature is entirely dormant for this
    // repository, exactly like [release] above. Rows with no name/branch are
    // dropped rather than poisoning the page.
    if (Array.isArray(parsed.deployments)) {
      const rows: DeploymentConfig[] = [];
      for (const raw of parsed.deployments) {
        if (typeof raw !== "object" || raw === null) continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.name !== "string" || !r.name.trim()) continue;
        if (typeof r.branch !== "string" || !r.branch.trim()) continue;
        const row: DeploymentConfig = { name: r.name.trim(), branch: r.branch.trim() };
        if (typeof r.service === "string" && r.service.trim()) row.service = r.service.trim();
        if (typeof r.provider === "string" && r.provider.trim()) row.provider = r.provider.trim();
        if (typeof r.url === "string" && r.url.trim()) row.url = r.url.trim();
        // TOML spelling is `dashboard_url`; normalized to camelCase here.
        if (typeof r.dashboard_url === "string" && r.dashboard_url.trim())
          row.dashboardUrl = r.dashboard_url.trim();
        if (typeof r.subdir === "string" && r.subdir.trim()) row.subdir = r.subdir.trim();
        rows.push(row);
      }
      if (rows.length) cfg.deployments = rows;
    }
    // [[distribution]] (#0445) — where users install this project's releases,
    // rendered as the Releases page's "Published to" summary. Opt-in and purely
    // declarative; an unconfigured project keeps the existing Releases view.
    const distribution = parseDistributionConfig(parsed);
    if (distribution) cfg.distribution = distribution;
    if (typeof get("ntfyEnabled") === "boolean") cfg.ntfyEnabled = get("ntfyEnabled") as boolean;
    if (typeof get("ntfyTopic") === "string") cfg.ntfyTopic = get("ntfyTopic") as string;
    if (typeof get("ntfyBaseUrl") === "string") cfg.ntfyBaseUrl = get("ntfyBaseUrl") as string;
    const taskMode = get("defaultTaskMode");
    if (taskMode === "freeform" || taskMode === "manual") cfg.defaultTaskMode = taskMode;
    if (Array.isArray(parsed.agents)) cfg.agents = parsed.agents as Agent[];
    if (typeof get("autoEngineeringMode") === "boolean")
      cfg.autoEngineeringMode = get("autoEngineeringMode") as boolean;
    if (typeof get("skillSuggestions") === "boolean")
      cfg.skillSuggestions = get("skillSuggestions") as boolean;
    const maxActiveTasks = get("maxActiveTasks");
    if (typeof maxActiveTasks === "number" && maxActiveTasks >= 1 && maxActiveTasks <= 20)
      cfg.maxActiveTasks = maxActiveTasks as number;
    const worktreeWarnThreshold = get("worktreeWarnThreshold");
    if (typeof worktreeWarnThreshold === "number" && worktreeWarnThreshold >= 0)
      cfg.worktreeWarnThreshold = Math.floor(worktreeWarnThreshold);
    else if (typeof worktreeWarnThreshold === "string" && /^\d+$/.test(worktreeWarnThreshold))
      cfg.worktreeWarnThreshold = Number(worktreeWarnThreshold);
    // [worktrees] section (#0373): opt-in to linking the main checkout's
    // gitignored `.env` into task worktrees. Absent means false (unchanged).
    const worktreesInheritEnvFlag = get("worktrees.inheritEnv");
    if (typeof worktreesInheritEnvFlag === "boolean") {
      cfg.worktrees = { ...cfg.worktrees, inheritEnv: worktreesInheritEnvFlag };
    }
    const servePort = get("servePort");
    const servePortNum =
      typeof servePort === "number"
        ? servePort
        : typeof servePort === "string" && /^\d+$/.test(servePort)
          ? Number(servePort)
          : NaN;
    if (Number.isInteger(servePortNum) && servePortNum >= 1 && servePortNum <= 65535)
      cfg.servePort = servePortNum;
    // Older Settings builds wrote this select value as a quoted TOML string.
    // Accept a strict integer string on load so existing repos immediately
    // recover, while the API now writes new values as numbers.
    if (typeof maxActiveTasks === "string" && /^(?:[1-9]|1\d|20)$/.test(maxActiveTasks))
      cfg.maxActiveTasks = Number(maxActiveTasks);
    const maxConcurrentAgents = get("maxConcurrentAgents");
    if (
      typeof maxConcurrentAgents === "number" &&
      maxConcurrentAgents >= 1 &&
      maxConcurrentAgents <= 16
    )
      cfg.maxConcurrentAgents = maxConcurrentAgents as number;

    // [check] section (#0348) — opt-in commands for `repoos check` steps that
    // are only meaningful for projects that declare them. A project can instead
    // declare a `smoke` package.json script for a zero-config default; this
    // config value overrides it when both are present. Both the `[check]` and
    // `[checks]` spellings are accepted (the task's prose used `checks.uiSmoke`).
    const checkUiSmoke = parsed["check.uiSmoke"] ?? parsed["checks.uiSmoke"];
    if (typeof checkUiSmoke === "string" && checkUiSmoke.trim()) {
      cfg.check = { ...cfg.check, uiSmoke: checkUiSmoke.trim() };
    }

    // [check] stylesheet guards (#0351) — the CSS-layering and theme-contrast
    // steps read a project-declared stylesheet and token vocabulary instead of
    // a RepoOS-hardcoded path and token names. A row missing its required keys
    // is dropped rather than poisoning the guard.
    const checkUiStylesheet = parsed["check.uiStylesheet"] ?? parsed["checks.uiStylesheet"];
    if (typeof checkUiStylesheet === "string" && checkUiStylesheet.trim()) {
      cfg.check = { ...cfg.check, uiStylesheet: checkUiStylesheet.trim() };
    }
    const checkThemeScopes = parsed["check.themeScopes"] ?? parsed["checks.themeScopes"];
    if (Array.isArray(checkThemeScopes)) {
      const scopes: CheckThemeScope[] = [];
      for (const raw of checkThemeScopes) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.selector !== "string" || !r.selector.trim()) continue;
        if (typeof r.name !== "string" || !r.name.trim()) continue;
        const scope: CheckThemeScope = { selector: r.selector.trim(), name: r.name.trim() };
        if (Array.isArray(r.inherits)) {
          const inherits = r.inherits
            .filter((v): v is string => typeof v === "string" && v.trim() !== "")
            .map((v) => v.trim());
          if (inherits.length) scope.inherits = inherits;
        }
        scopes.push(scope);
      }
      if (scopes.length) cfg.check = { ...cfg.check, themeScopes: scopes };
    }
    const checkContrastPairs = parsed["check.contrastPairs"] ?? parsed["checks.contrastPairs"];
    if (Array.isArray(checkContrastPairs)) {
      const pairs: CheckContrastPair[] = [];
      for (const raw of checkContrastPairs) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.fg !== "string" || !r.fg.trim()) continue;
        if (typeof r.bg !== "string" || !r.bg.trim()) continue;
        pairs.push({ fg: r.fg.trim(), bg: r.bg.trim() });
      }
      if (pairs.length) cfg.check = { ...cfg.check, contrastPairs: pairs };
    }
    const checkGradientTokens = parsed["check.gradientTokens"] ?? parsed["checks.gradientTokens"];
    if (Array.isArray(checkGradientTokens)) {
      const tokens = checkGradientTokens
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim());
      if (tokens.length) cfg.check = { ...cfg.check, gradientTokens: tokens };
    }
    const checkBackdropToken = parsed["check.backdropToken"] ?? parsed["checks.backdropToken"];
    if (typeof checkBackdropToken === "string" && checkBackdropToken.trim()) {
      cfg.check = { ...cfg.check, backdropToken: checkBackdropToken.trim() };
    }
    // [check] bare-require source roots (#0352). The guard is generic but the
    // directories to scan are RepoOS-shaped, so a managed project declares its
    // own; empty rows are dropped rather than poisoning the scan.
    const checkBareRequireDirs =
      parsed["check.bareRequireDirs"] ?? parsed["checks.bareRequireDirs"];
    if (Array.isArray(checkBareRequireDirs)) {
      const dirs = checkBareRequireDirs
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim());
      if (dirs.length) cfg.check = { ...cfg.check, bareRequireDirs: dirs };
    }
    const checkBareRequireExcludes =
      parsed["check.bareRequireExcludes"] ?? parsed["checks.bareRequireExcludes"];
    if (Array.isArray(checkBareRequireExcludes)) {
      const excludes = checkBareRequireExcludes
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim());
      if (excludes.length) cfg.check = { ...cfg.check, bareRequireExcludes: excludes };
    }
    // [check] declarative plan (#0446) — `version`, `defaultProfile` and the
    // [[check.steps]] rows. When a repo declares steps, `repoos check` runs
    // exactly those, for any stack; without them it falls back to the legacy
    // per-step keys and then to inference (see core/check-plan.ts).
    const plan = parseCheckPlanConfig(parsed);
    if (plan) cfg.check = { ...cfg.check, ...plan };

    // [board.columns] section (#0396) — display-only column label overrides.
    // Invalid entries (blank, non-string, >40 chars, duplicates) fall back to
    // the default for that column; valid siblings still apply.
    const boardColumns = parseBoardColumns(parsed);
    if (boardColumns) cfg.boardColumns = boardColumns;

    // [preview] section (#0362) — how to preview a task's worktree. The
    // project's own command runs, selected by the task's `area`; when no
    // section is declared there is no implicit default (#0370).
    const preview = parsePreviewConfig(parsed);
    if (preview) cfg.preview = preview;

    // [whisper] section — voice transcription for vibe-coding.
    const whisperProvider = parsed["whisper.provider"];
    if (
      typeof whisperProvider === "string" &&
      ["groq", "openai", "none"].includes(whisperProvider)
    ) {
      cfg.whisper = { ...cfg.whisper, provider: whisperProvider as "groq" | "openai" | "none" };
    }
    const whisperApiKey = parsed["whisper.apiKey"];
    if (typeof whisperApiKey === "string") {
      cfg.whisper = { ...cfg.whisper, apiKey: whisperApiKey };
    } else {
      // Env var fallbacks, provider-aware: a generic key wins, then the
      // provider's own var — never send an OPENAI_API_KEY to Groq.
      const provider = cfg.whisper?.provider ?? "none";
      const envKey =
        process.env.REPOOS_WHISPER_KEY ??
        (provider === "groq"
          ? process.env.GROQ_API_KEY
          : provider === "openai"
            ? process.env.OPENAI_API_KEY
            : (process.env.GROQ_API_KEY ?? process.env.OPENAI_API_KEY));
      if (envKey) {
        cfg.whisper = { ...cfg.whisper, apiKey: envKey };
      }
    }

    // [watchdog] section (0180) — the task watchdog over active tasks.
    const watchdogEnabled = parsed["watchdog.enabled"];
    if (typeof watchdogEnabled === "boolean") {
      cfg.watchdog = { ...cfg.watchdog, enabled: watchdogEnabled };
    }
    const watchdogStaleness = parsed["watchdog.stalenessMs"];
    if (typeof watchdogStaleness === "number" && watchdogStaleness >= 60_000) {
      cfg.watchdog = { ...cfg.watchdog, stalenessMs: watchdogStaleness };
    }
    const watchdogAutoTransition = parsed["watchdog.autoTransition"];
    if (typeof watchdogAutoTransition === "boolean") {
      cfg.watchdog = { ...cfg.watchdog, autoTransition: watchdogAutoTransition };
    }

    // [auth] section — authentication configuration.
    const authEnabled = parsed["auth.enabled"];
    if (typeof authEnabled === "boolean") {
      cfg.auth = { ...cfg.auth, enabled: authEnabled };
    }
    // Secrets prefer an env var over the (git-tracked) config file, same
    // fallback pattern as [whisper] above — env wins when both are set.
    const authSessionSecret =
      parsed["auth.sessionSecret"] ?? process.env.REPOOS_AUTH_SESSION_SECRET;
    if (typeof authSessionSecret === "string" && authSessionSecret) {
      cfg.auth = { ...cfg.auth, sessionSecret: authSessionSecret };
    }
    const authSessionMaxAge = parsed["auth.sessionMaxAge"];
    if (typeof authSessionMaxAge === "number" || typeof authSessionMaxAge === "string") {
      const num =
        typeof authSessionMaxAge === "string" ? Number(authSessionMaxAge) : authSessionMaxAge;
      if (Number.isFinite(num) && num > 0) {
        // Accept values in days (1-1000) or seconds (>=300s). Assume values <300 are days.
        const ageInSeconds = num < 300 ? num * 86400 : num;
        if (ageInSeconds >= 300) {
          cfg.auth = { ...cfg.auth, sessionMaxAge: ageInSeconds };
        }
      }
    }
    const authBootstrapAdmin = parsed["auth.bootstrapAdmin"];
    if (typeof authBootstrapAdmin === "string") {
      cfg.auth = { ...cfg.auth, bootstrapAdmin: authBootstrapAdmin };
    }
    // Dev backdoor OTP: env-var only, never a repoos.toml key, so it can
    // never end up in a git-tracked config file. `verifyOtp` also refuses to
    // honor it outside NODE_ENV !== "production" as a second guard.
    const authDevBackdoorCode = process.env.REPOOS_AUTH_DEV_BACKDOOR_CODE;
    if (
      typeof authDevBackdoorCode === "string" &&
      authDevBackdoorCode &&
      process.env.NODE_ENV !== "production"
    ) {
      cfg.auth = { ...cfg.auth, devBackdoorCode: authDevBackdoorCode };
    }
    // Email provider — fromAddress isn't sensitive and stays config-only;
    // apiKey may come from the config file or REPOOS_RESEND_API_KEY.
    const emailProviderType = parsed["auth.emailProvider.type"];
    if (typeof emailProviderType === "string" && emailProviderType === "resend") {
      const emailApiKey = parsed["auth.emailProvider.apiKey"] ?? process.env.REPOOS_RESEND_API_KEY;
      const emailFrom = parsed["auth.emailProvider.fromAddress"];
      const emailFromName = parsed["auth.emailProvider.fromName"];
      if (typeof emailApiKey === "string" && emailApiKey && typeof emailFrom === "string") {
        cfg.auth = {
          ...cfg.auth,
          emailProvider: {
            type: "resend",
            apiKey: emailApiKey,
            fromAddress: emailFrom,
            ...(typeof emailFromName === "string" && emailFromName
              ? { fromName: emailFromName }
              : {}),
          },
        };
      }
    }
    // Google OAuth — clientId isn't sensitive and stays config-only;
    // clientSecret may come from the config file or REPOOS_GOOGLE_CLIENT_SECRET.
    const googleClientId = parsed["auth.google.clientId"];
    const googleClientSecret =
      parsed["auth.google.clientSecret"] ?? process.env.REPOOS_GOOGLE_CLIENT_SECRET;
    if (
      typeof googleClientId === "string" &&
      typeof googleClientSecret === "string" &&
      googleClientSecret
    ) {
      cfg.auth = {
        ...cfg.auth,
        google: { clientId: googleClientId, clientSecret: googleClientSecret },
      };
    }

    // [remoteValidation] section — run the close-out build+test on a cloud VM.
    // The API token and SSH key path are env-only (never a git-tracked TOML
    // key), same rule as the [auth] secrets above.
    const rvEnabled = parsed["remoteValidation.enabled"];
    if (typeof rvEnabled === "boolean") {
      cfg.remoteValidation = { ...cfg.remoteValidation, enabled: rvEnabled };
    }
    const rvServerType = parsed["remoteValidation.serverType"];
    if (typeof rvServerType === "string" && rvServerType) {
      cfg.remoteValidation = { ...cfg.remoteValidation, serverType: rvServerType };
    }
    const rvLocation = parsed["remoteValidation.location"];
    if (typeof rvLocation === "string" && rvLocation) {
      cfg.remoteValidation = { ...cfg.remoteValidation, location: rvLocation };
    }
    const rvSnapshot = parsed["remoteValidation.snapshotId"];
    if (typeof rvSnapshot === "string" && rvSnapshot) {
      cfg.remoteValidation = { ...cfg.remoteValidation, snapshotId: rvSnapshot };
    }
    const rvSshKeyName = parsed["remoteValidation.sshKeyName"];
    if (typeof rvSshKeyName === "string" && rvSshKeyName) {
      cfg.remoteValidation = { ...cfg.remoteValidation, sshKeyName: rvSshKeyName };
    }
    const rvIdle = parsed["remoteValidation.idleShutdownMinutes"];
    if (typeof rvIdle === "number" && rvIdle >= 0) {
      cfg.remoteValidation = { ...cfg.remoteValidation, idleShutdownMinutes: rvIdle };
    }
    const rvMaxLife = parsed["remoteValidation.maxServerLifetimeMinutes"];
    if (typeof rvMaxLife === "number" && rvMaxLife >= 10) {
      cfg.remoteValidation = { ...cfg.remoteValidation, maxServerLifetimeMinutes: rvMaxLife };
    }
    const rvFallback = parsed["remoteValidation.fallbackToLocal"];
    if (typeof rvFallback === "boolean") {
      cfg.remoteValidation = { ...cfg.remoteValidation, fallbackToLocal: rvFallback };
    }
    const rvReleases = parsed["remoteValidation.useForReleases"];
    if (typeof rvReleases === "boolean") {
      cfg.remoteValidation = { ...cfg.remoteValidation, useForReleases: rvReleases };
    }
  }

  // Model-provider API keys (0327): env-only, same rule as the [auth] secrets
  // above — they must never land in the git-tracked repoos.toml. Read after
  // the TOML block (env vars need no repoos.toml to exist), into the flat
  // `modelProviders` config section the model-providers route consumes.
  const modelProviders: ModelProviderKeysConfig = {};
  const openrouterApiKey = process.env.REPOOS_OPENROUTER_API_KEY;
  if (openrouterApiKey) modelProviders.openrouterApiKey = openrouterApiKey;
  const opencodeGoApiKey = process.env.REPOOS_OPENCODE_GO_API_KEY;
  if (opencodeGoApiKey) modelProviders.opencodeGoApiKey = opencodeGoApiKey;
  if (modelProviders.openrouterApiKey || modelProviders.opencodeGoApiKey) {
    cfg.modelProviders = modelProviders;
  }

  cfg.builtInAgents = loadBuiltInAgentsConfig(root, cfg.cacheDir);
  return cfg;
}

/** Metadata describing a single config field for the Settings UI. */
export interface ConfigFieldMeta {
  key: string;
  label: string;
  type: "string" | "boolean" | "select" | "array";
  tier: "live" | "restart" | "guarded";
  /**
   * Which primary Settings section a field belongs to. Defaults to "general"
   * for non-guarded fields and "advanced" for guarded ones. "voice" carves out
   * a dedicated, always-visible "Voice transcription" section so the feature
   * is discoverable without opening Advanced.
   */
  group?: "general" | "voice";
  restartRequired: boolean;
  default: unknown;
  options?: { value: string; label: string }[];
  description: string;
}

export function getConfigSchema(): ConfigFieldMeta[] {
  return [
    {
      key: "tunnelEnabled",
      label: "Cloudflare Tunnel",
      type: "boolean",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.tunnelEnabled,
      description: "Publish local apps securely through Cloudflare Tunnel + Access",
    },
    {
      key: "ntfyEnabled",
      label: "ntfy notifications",
      type: "boolean",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.ntfyEnabled,
      description: "Send push notifications on task lifecycle events",
    },
    {
      key: "ntfyTopic",
      label: "ntfy topic",
      type: "string",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.ntfyTopic,
      description: "The ntfy topic RepoOS publishes events to (e.g. repoos_myproject)",
    },
    {
      key: "ntfyBaseUrl",
      label: "ntfy base URL",
      type: "string",
      tier: "guarded",
      restartRequired: false,
      default: DEFAULT_CONFIG.ntfyBaseUrl,
      description: "Self-hosted ntfy server base URL (NTFY_BASE_URL env var overrides)",
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
    {
      key: "autoEngineeringMode",
      label: "Auto-engineering mode",
      type: "boolean",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.autoEngineeringMode,
      description: "Automatically select and start ready tasks up to the maximum",
    },
    {
      key: "skillSuggestions",
      label: "Auto-suggest skills from completed sessions",
      type: "boolean",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.skillSuggestions,
      description:
        "Off by default. When on, a task's session is analysed only after the task reaches " +
        "'done' — never at review. A suggestion is created only for a high-bar reusable " +
        "procedure (stable, repeatable on future tasks, with real decisions) corroborated by " +
        "at least two independent completed sessions. One-off fixes, task checklists, test " +
        "ideas, local conventions, review feedback, and failed/unverified work are rejected. " +
        "The first candidate is kept internally until corroborated; a single session never " +
        "creates a suggestion, and nothing goes live as a skill until you approve it.",
    },
    {
      key: "maxActiveTasks",
      label: "Maximum active tasks",
      type: "select",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.maxActiveTasks,
      options: Array.from({ length: 20 }, (_, i) => {
        const val = i + 1;
        return { value: String(val), label: String(val) };
      }),
      description:
        "Maximum number of simultaneously active tasks when auto-engineering mode is enabled (1-20)",
    },
    {
      key: "worktreeWarnThreshold",
      label: "Worktree warning threshold",
      type: "select",
      tier: "live",
      restartRequired: false,
      default: DEFAULT_CONFIG.worktreeWarnThreshold,
      options: [
        { value: "0", label: "Off" },
        ...[10, 15, 20, 25, 30, 40, 50].map((v) => ({ value: String(v), label: String(v) })),
      ],
      description:
        "Advisory ceiling on registered git worktrees. Above it, the Control page's Codebase card turns amber and the server logs a `repoos gc` reminder. Never blocks a task.",
    },
    {
      key: "maxConcurrentAgents",
      label: "Maximum concurrent agent processes",
      type: "select",
      tier: "live",
      restartRequired: false,
      default: defaultMaxConcurrentAgents(),
      options: Array.from({ length: 16 }, (_, i) => {
        const val = i + 1;
        return { value: String(val), label: String(val) };
      }),
      description:
        `How many agent CLI processes (start/send/chat) may run at once; extras queue. ` +
        `Default (${defaultMaxConcurrentAgents()}) is computed from this machine's CPU count.`,
    },
    {
      key: "whisper.provider",
      label: "Voice transcription provider",
      type: "select",
      tier: "live",
      group: "voice",
      restartRequired: false,
      default: DEFAULT_CONFIG.whisper?.provider ?? "none",
      options: [
        { value: "none", label: "Disabled" },
        { value: "groq", label: "Groq (whisper-large-v3)" },
        { value: "openai", label: "OpenAI (whisper-1)" },
      ],
      description: "Provider for voice-to-text transcription in text areas",
    },
    {
      key: "whisper.apiKey",
      label: "Voice transcription API key",
      type: "string",
      tier: "live",
      group: "voice",
      restartRequired: false,
      default: "",
      description:
        "API key for the selected provider (never sent to browser; stored in repoos.toml or REPOOS_WHISPER_KEY env var)",
    },
    {
      key: "auth.enabled",
      label: "Authentication",
      type: "boolean",
      tier: "restart",
      restartRequired: true,
      default: false,
      description: "Require login to access RepoOS (email OTP or Google OAuth)",
    },
    {
      key: "auth.sessionMaxAge",
      label: "Session duration (seconds)",
      type: "string",
      tier: "restart",
      restartRequired: true,
      default: String(DEFAULT_CONFIG.auth?.sessionMaxAge ?? 2592000),
      description:
        "How long a login session lasts in seconds (default 2592000 = 30 days). Values under 300 are read as days.",
    },
    {
      key: "remoteValidation.enabled",
      label: "Remote validation runner",
      type: "boolean",
      tier: "restart",
      restartRequired: true,
      default: false,
      description:
        "Run the close-out build + test suite on a disposable Hetzner VM instead of this machine " +
        "(needs HETZNER_API_TOKEN + REPOOS_REMOTE_SSH_KEY env vars and [remoteValidation] snapshotId/sshKeyName in repoos.toml — see docs/remote-validation.md). Sends repo contents to a third-party host.",
    },
    {
      key: "remoteValidation.fallbackToLocal",
      label: "Remote validation: fall back to local",
      type: "boolean",
      tier: "restart",
      restartRequired: true,
      default: false,
      description:
        "When the remote runner is unreachable, run the full gate locally instead of keeping the task in review for retry.",
    },
    {
      key: "remoteValidation.useForReleases",
      label: "Remote validation: also validate releases",
      type: "boolean",
      tier: "restart",
      restartRequired: true,
      default: false,
      description:
        "Cut releases on the same Hetzner runner as close-outs (off by default — a release is watched live, so the provision delay reads as a regression; opt in per repo). Only applies when the runner is enabled.",
    },
    // [board.columns] — display-only label overrides (#0396).
    ...STATUSES.map((status) => ({
      key: `board.columns.${status}`,
      label: `Column label: ${status}`,
      type: "string" as const,
      tier: "live" as const,
      restartRequired: false,
      default: DEFAULT_COLUMN_LABELS[status],
      description: `Display label for the "${status}" column (${DEFAULT_COLUMN_LABELS[status]})`,
    })),
  ];
}

/**
 * Every `repoos.toml` key the parser supports, as dotted paths — the contract
 * the user-facing reference is verified against in
 * `src/ui-app/tests/config-docs.test.ts`.
 *
 * Deliberately separate from `getConfigSchema()`, which covers only the
 * Settings UI surface. Parser-only sections (previews, checks, releases,
 * deployments, distribution, worktrees, tunnels, remote validation) are listed
 * here too. **When you add a key to `loadConfig`, `parsePreviewConfig`,
 * `parseBoardColumns`, `parseDistributionConfig`, or the `[tunnel]` parser, add
 * it here and document it** — otherwise the docs-drift test cannot see it.
 */
export const SUPPORTED_TOML_KEYS: readonly string[] = [
  // Layout and repository paths
  "workDir",
  "docsDir",
  "skillsDir",
  "inputsDir",
  "cacheDir",
  "taskExtensions",
  // Board behavior
  "defaultStatus",
  "defaultAssignee",
  "defaultTaskMode",
  "maxActiveTasks",
  "autoEngineeringMode",
  "skillSuggestions",
  "worktreeWarnThreshold",
  "board.columns.draft",
  "board.columns.inbox",
  "board.columns.ready",
  "board.columns.active",
  "board.columns.review",
  "board.columns.done",
  // Server and UI
  "servePort",
  "strictBuild",
  // Worktrees
  "worktrees.inheritEnv",
  // Agents
  "maxConcurrentAgents",
  "watchdog.enabled",
  "watchdog.stalenessMs",
  "watchdog.autoTransition",
  "whisper.provider",
  "whisper.apiKey",
  // Task previews
  "preview.command",
  "preview.cwd",
  "preview.readyPath",
  "preview.readyTimeoutMs",
  "preview.targets.name",
  "preview.targets.areas",
  "preview.targets.command",
  "preview.targets.cwd",
  "preview.targets.readyPath",
  "preview.targets.readyTimeoutMs",
  // Preview-only overrides (#0464): a `[preview.<base path>]` table applied
  // only by the preview/UI-test preview runtime. auth.enabled is the headline
  // case; any supported base key can be overridden the same way.
  "preview.auth.enabled",
  // Checks
  "check.uiSmoke",
  "check.uiStylesheet",
  "check.themeScopes",
  "check.contrastPairs",
  "check.gradientTokens",
  "check.backdropToken",
  "check.bareRequireDirs",
  "check.bareRequireExcludes",
  "check.themeScopes.selector",
  "check.themeScopes.name",
  "check.themeScopes.inherits",
  "check.contrastPairs.fg",
  "check.contrastPairs.bg",
  // Authentication
  "auth.enabled",
  "auth.sessionMaxAge",
  "auth.bootstrapAdmin",
  "auth.emailProvider.type",
  "auth.emailProvider.fromAddress",
  "auth.emailProvider.fromName",
  "auth.google.clientId",
  // Releases
  "release.enabled",
  "release.provider",
  "release.name",
  "release.branch",
  "release.versionFile",
  "release.tagPrefix",
  "release.remote",
  "release.repository",
  "release.workflow",
  // Deployments
  "deployments.name",
  "deployments.service",
  "deployments.branch",
  "deployments.provider",
  "deployments.url",
  "deployments.dashboard_url",
  "deployments.subdir",
  // Distribution
  "distribution.name",
  "distribution.kind",
  "distribution.url",
  "distribution.package",
  "distribution.repository",
  "distribution.versionUrl",
  "distribution.versionRegex",
  "distribution.install",
  // Notifications
  "ntfyEnabled",
  "ntfyTopic",
  "ntfyBaseUrl",
  // Tunnels
  "tunnel.enabled",
  "tunnel.provider",
  "tunnel.name",
  "tunnel.domain",
  "tunnel.tunnel_id",
  "tunnel.apps",
  // Remote validation
  "remoteValidation.enabled",
  "remoteValidation.serverType",
  "remoteValidation.location",
  "remoteValidation.snapshotId",
  "remoteValidation.sshKeyName",
  "remoteValidation.idleShutdownMinutes",
  "remoteValidation.maxServerLifetimeMinutes",
  "remoteValidation.fallbackToLocal",
  "remoteValidation.useForReleases",
];

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
      if (stripTomlComment(result[i]).trim() === `[[${key}]]`) {
        i++;
        while (i < result.length) {
          const s = stripTomlComment(result[i]).trim();
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

  // [board.columns] section keys: find or create the section header, then
  // patch entries under it. These keys use dotted notation (board.columns.draft)
  // but live indented under `[board.columns]`, not at root scope.
  const boardColKeys = Object.entries(patch).filter(([k]) => k.startsWith("board.columns."));
  if (boardColKeys.length) {
    const sectionHeader = "[board.columns]";
    let sectionIdx = result.findIndex((l) => stripTomlComment(l).trim() === sectionHeader);
    if (sectionIdx === -1) {
      // Create the section — insert before the first existing header or at end.
      const firstHeader = result.findIndex((l) => stripTomlComment(l).trim().startsWith("["));
      sectionIdx = firstHeader === -1 ? result.length : firstHeader;
      result.splice(sectionIdx, 0, sectionHeader, "");
      sectionIdx += 1; // skip past the header itself
      modified = true;
    }
    // Find the end of the [board.columns] section (next section header or EOF).
    let sectionEnd = result.length;
    for (let i = sectionIdx + 1; i < result.length; i++) {
      const s = stripTomlComment(result[i]).trim();
      if (s.startsWith("[") && s !== sectionHeader) {
        sectionEnd = i;
        break;
      }
    }
    // Patch each board.columns.* key within the section.
    for (const [key, rawVal] of boardColKeys) {
      const shortKey = key.slice("board.columns.".length);
      const serialized = serializeTomlVal(rawVal);
      let found = false;
      for (let i = sectionIdx; i < sectionEnd; i++) {
        const stripped = stripTomlComment(result[i]).trim();
        const kv = stripped.match(/^([A-Za-z0-9_-]+)\s*=\s*/);
        if (kv && kv[1] === shortKey) {
          result[i] = `  ${shortKey} = ${serialized}`;
          found = true;
          modified = true;
          break;
        }
      }
      if (!found) {
        result.splice(sectionEnd, 0, `  ${shortKey} = ${serialized}`);
        sectionEnd += 1;
        modified = true;
      }
    }
  }

  // Scalars and plain arrays: in-place line-preserving patch.
  for (const [key, rawVal] of Object.entries(patch)) {
    if (isTableArray(rawVal)) continue;
    if (key.startsWith("board.columns.")) continue; // handled above
    const serialized = serializeTomlVal(rawVal);
    let found = false;

    for (let i = 0; i < result.length; i++) {
      const stripped = stripTomlComment(result[i]).trim();
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
      // A brand-new scalar must land at root scope. Appending at the very end
      // of the file is only safe when nothing after it is a `[section]` or
      // `[[array-of-tables]]` block — otherwise the line reads back as a
      // member of that table instead of the root config (the reader has no
      // way to know the table "ended" without a following header). Insert
      // before the first header line instead, so newly-saved keys are always
      // unambiguously root-level regardless of what tables follow.
      const firstHeaderIndex = result.findIndex((l) => stripTomlComment(l).trim().startsWith("["));
      if (firstHeaderIndex === -1) {
        result.push(`${key} = ${serialized}`);
      } else {
        result.splice(firstHeaderIndex, 0, `${key} = ${serialized}`);
      }
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(tomlPath, result.join("\n") + "\n", "utf8");
  }
}

/**
 * Absolute path of the built-in agent state sidecar (a JSON file living next
 * to the cache dir). It holds runtime state — enabled/schedule/last run — that
 * the Tech Debt Agent's server-side scheduler reads and the Agents page
 * writes; it is deliberately NOT part of repoos.toml.
 */
export function builtInAgentsPath(root: string, cacheDir?: string): string {
  return join(root, cacheDir ?? DEFAULT_CONFIG.cacheDir, "built-in-agents.json");
}

const BUILT_IN_SCHEDULES: BuiltInAgentSchedule[] = ["daily", "weekly", "manual"];

/** Coerce an unknown PATCH/read value into a sane BuiltInAgentConfig. */
export function sanitizeBuiltInAgent(value: unknown): BuiltInAgentConfig | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: BuiltInAgentConfig = {};
  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
  if (typeof raw.schedule === "string" && (BUILT_IN_SCHEDULES as string[]).includes(raw.schedule)) {
    out.schedule = raw.schedule as BuiltInAgentSchedule;
  }
  if (typeof raw.lastRunAt === "string" && !Number.isNaN(Date.parse(raw.lastRunAt))) {
    out.lastRunAt = raw.lastRunAt;
  }
  if (typeof raw.cli === "string") out.cli = raw.cli;
  if (typeof raw.model === "string") out.model = raw.model;
  return out;
}

/**
 * Coerce a whole record of built-in agent state (as read from the sidecar or
 * sent via PATCH) into a safe shape. Invalid entries are dropped; a valid
 * entry with no recognized fields is dropped too.
 */
export function sanitizeBuiltInAgents(value: unknown): Record<string, BuiltInAgentConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, BuiltInAgentConfig> = {};
  for (const [name, entry] of Object.entries(value)) {
    const clean = sanitizeBuiltInAgent(entry);
    if (clean && Object.keys(clean).length > 0) out[name] = clean;
  }
  return out;
}

/** Read the built-in agent state sidecar, or undefined when absent/unreadable. */
export function loadBuiltInAgentsConfig(
  root: string,
  cacheDir?: string,
): Record<string, BuiltInAgentConfig> | undefined {
  const file = builtInAgentsPath(root, cacheDir);
  try {
    if (!existsSync(file)) return undefined;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return sanitizeBuiltInAgents(parsed);
  } catch {
    // A corrupt sidecar must never block config loading — treat as empty.
    return {};
  }
}

/** Persist the built-in agent state sidecar, creating the cache dir as needed. */
export function saveBuiltInAgentsConfig(
  root: string,
  state: Record<string, BuiltInAgentConfig>,
  cacheDir?: string,
): void {
  const file = builtInAgentsPath(root, cacheDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}
