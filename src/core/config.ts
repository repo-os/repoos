/**
 * Config resolution. Zero-config by default; `repoos.toml` at the repo root
 * can override any field. We parse only the flat subset of TOML we need, again
 * to avoid a runtime dependency.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type {
  Agent,
  AuthConfig,
  BuiltInAgentConfig,
  BuiltInAgentSchedule,
  RepoOSConfig,
  Status,
  Assignee,
  Theme,
  UiTheme,
  WhisperConfig,
} from "./types.js";
import { STATUSES } from "./types.js";

/** Coding agents an Agent can run under. */
export const AGENT_CLIS = ["opencode", "claude code", "qwen code", "kiro", "codex", "github copilot"] as const;
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
      : agent
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
  maxActiveTasks: 3,
  whisper: {
    provider: "none",
    apiKey: "",
  },
  auth: {
    enabled: false,
    sessionMaxAge: 604800,
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
  // Load .env before resolving [auth]/[whisper] secrets below, so every path
  // that boots a real server (repoos serve, previews, the UI smoke test)
  // sees the same env-sourced values consistently, not just the CLI's own
  // entrypoint.
  loadDotEnv(root);
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
    const tunnelEnabled = parsed["tunnel.enabled"];
    if (typeof tunnelEnabled === "boolean") cfg.tunnelEnabled = tunnelEnabled;
    if (typeof get("ntfyEnabled") === "boolean") cfg.ntfyEnabled = get("ntfyEnabled") as boolean;
    if (typeof get("ntfyTopic") === "string") cfg.ntfyTopic = get("ntfyTopic") as string;
    if (typeof get("ntfyBaseUrl") === "string") cfg.ntfyBaseUrl = get("ntfyBaseUrl") as string;
    const taskMode = get("defaultTaskMode");
    if (taskMode === "freeform" || taskMode === "manual") cfg.defaultTaskMode = taskMode;
    if (Array.isArray(parsed.agents)) cfg.agents = parsed.agents as Agent[];
    if (typeof get("autoEngineeringMode") === "boolean")
      cfg.autoEngineeringMode = get("autoEngineeringMode") as boolean;
    const maxActiveTasks = get("maxActiveTasks");
    if (typeof maxActiveTasks === "number" && maxActiveTasks >= 1 && maxActiveTasks <= 20)
      cfg.maxActiveTasks = maxActiveTasks as number;
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

    // [whisper] section — voice transcription for vibe-coding.
    const whisperProvider = parsed["whisper.provider"];
    if (typeof whisperProvider === "string" && ["groq", "openai", "none"].includes(whisperProvider)) {
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
            : process.env.GROQ_API_KEY ?? process.env.OPENAI_API_KEY);
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
    const authSessionSecret = parsed["auth.sessionSecret"] ?? process.env.REPOOS_AUTH_SESSION_SECRET;
    if (typeof authSessionSecret === "string" && authSessionSecret) {
      cfg.auth = { ...cfg.auth, sessionSecret: authSessionSecret };
    }
    const authSessionMaxAge = parsed["auth.sessionMaxAge"];
    if (typeof authSessionMaxAge === "number" && authSessionMaxAge >= 300) {
      cfg.auth = { ...cfg.auth, sessionMaxAge: authSessionMaxAge };
    }
    const authBootstrapAdmin = parsed["auth.bootstrapAdmin"];
    if (typeof authBootstrapAdmin === "string") {
      cfg.auth = { ...cfg.auth, bootstrapAdmin: authBootstrapAdmin };
    }
    // Dev backdoor OTP: env-var only, never a repoos.toml key, so it can
    // never end up in a git-tracked config file. `verifyOtp` also refuses to
    // honor it outside NODE_ENV !== "production" as a second guard.
    const authDevBackdoorCode = process.env.REPOOS_AUTH_DEV_BACKDOOR_CODE;
    if (typeof authDevBackdoorCode === "string" && authDevBackdoorCode && process.env.NODE_ENV !== "production") {
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
            ...(typeof emailFromName === "string" && emailFromName ? { fromName: emailFromName } : {}),
          },
        };
      }
    }
    // Google OAuth — clientId isn't sensitive and stays config-only;
    // clientSecret may come from the config file or REPOOS_GOOGLE_CLIENT_SECRET.
    const googleClientId = parsed["auth.google.clientId"];
    const googleClientSecret = parsed["auth.google.clientSecret"] ?? process.env.REPOOS_GOOGLE_CLIENT_SECRET;
    if (typeof googleClientId === "string" && typeof googleClientSecret === "string" && googleClientSecret) {
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
      default: "604800",
      description: "How long a login session lasts in seconds (default 604800 = 7 days)",
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
      // A brand-new scalar must land at root scope. Appending at the very end
      // of the file is only safe when nothing after it is a `[section]` or
      // `[[array-of-tables]]` block — otherwise the line reads back as a
      // member of that table instead of the root config (the reader has no
      // way to know the table "ended" without a following header). Insert
      // before the first header line instead, so newly-saved keys are always
      // unambiguously root-level regardless of what tables follow.
      const firstHeaderIndex = result.findIndex((l) => l.replace(/#.*$/, "").trim().startsWith("["));
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
  if (
    typeof raw.schedule === "string" &&
    (BUILT_IN_SCHEDULES as string[]).includes(raw.schedule)
  ) {
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
