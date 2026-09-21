/**
 * `repoos doctor` — a deterministic, non-destructive readiness preflight for a
 * real project (#0451).
 *
 * It answers one question: is this repository ready to initialize, run, and
 * hand work to an agent — and if not, what exact action fixes it? Every check
 * is strictly read-only: no init, config write, login, install, network call,
 * process kill, task dispatch or git mutation. It never contacts a model
 * provider and never spends tokens; agent CLIs are detected by resolving their
 * binary on PATH, never by running them.
 *
 * The engine is pure-ish and returns a structured, versioned `DoctorReport`.
 * The CLI (`src/commands/doctor.ts`) and, later, the support bundle (#0453) and
 * the UI render that same report — the diagnostic logic lives only here.
 */
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  findRepoRoot,
  isLinkedWorktreeRoot,
  loadConfig,
  mainCheckoutRoot,
  parseFlatToml,
  projectDisplayName,
  resolveServePort,
  SUPPORTED_TOML_KEYS,
  worktreesDir,
} from "./config.js";
import { STATUSES, type RepoOSConfig } from "./types.js";
import { checkBuildForRoot } from "./build.js";
import {
  detectRepoMarkers,
  hasBinary,
  installHint,
  missingBinaries,
  prereqDetail,
} from "./check-runner.js";
import { resolveCheckPlan, type CheckPlan } from "./check-plan.js";
import { isBun, preferBunForDevTasks } from "./runtime.js";
import { detectPackageManager } from "./bootstrap.js";
import { detectAgents, KNOWN_AGENTS } from "./detect.js";
import { compatibilityForDetectedAgent, type CompatibilityStatus } from "./agent-compatibility.js";
import { parseDocument } from "./frontmatter.js";
import { isGitRepo } from "./git.js";
import { portListening } from "./net-probe.js";
import { validateToml } from "./toml-validate.js";

// ── Report shape (the stable --json contract) ───────────────────────────────

export type DoctorSeverity = "pass" | "warn" | "fail";

export type DoctorCategory =
  | "identity"
  | "config"
  | "layout"
  | "runtime"
  | "gate"
  | "lifecycle"
  | "secrets";

/** Order categories are grouped in, for both the human and JSON consumers. */
export const DOCTOR_CATEGORIES: readonly DoctorCategory[] = [
  "identity",
  "config",
  "layout",
  "runtime",
  "gate",
  "lifecycle",
  "secrets",
];

/** A single classified diagnostic finding. */
export interface DoctorFinding {
  /**
   * Stable identifier, `<category>.<slug>` — safe to match on in scripts, the
   * UI and the support bundle. Never changes meaning between releases without
   * a `schemaVersion` bump.
   */
  id: string;
  category: DoctorCategory;
  severity: DoctorSeverity;
  /** Short human label. */
  title: string;
  /** Plain-language explanation of what was found and why it matters. */
  detail: string;
  /**
   * A concrete next command or UI location, or null when there is nothing to
   * do. Secret values and credential variable names are never included.
   */
  remediation: string | null;
}

export interface DoctorReport {
  /** Structure version of this report — consumed by the support bundle (#0453). */
  schemaVersion: 1;
  generatedAt: string;
  project: {
    root: string;
    name: string;
    /** True when the resolved root is a linked worktree of a main checkout. */
    fromWorktree: boolean;
  };
  tool: { name: "repoos"; version: string | null };
  summary: { pass: number; warn: number; fail: number; total: number };
  findings: DoctorFinding[];
}

export interface DoctorOptions {
  /** Directory `doctor` was invoked from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Explicit project root (overrides root discovery) — for tests. */
  root?: string;
  /** Overrides "now" — for tests. */
  now?: Date;
  /** Overrides the probed server port (lockfile → configured → derived). */
  probePort?: number;
  /** Health-probe timeout in ms. Default 800. */
  probeTimeoutMs?: number;
  /** Injectable executable check — for hermetic tests. */
  hasBinary?: (tool: string) => boolean;
  /** RepoOS version string to stamp into the report. */
  version?: string | null;
}

/**
 * Map a compatibility status to a doctor severity. Exported so the contract
 * that only `unsupported` fails the run (and the exit code) is unit-tested
 * directly, independent of live binary detection.
 */
export function compatibilityFindingSeverity(status: CompatibilityStatus): DoctorSeverity {
  if (status === "verified") return "pass";
  if (status === "unsupported") return "fail";
  return "warn";
}

export async function checkAgentCompatibility(
  config: RepoOSConfig,
  hasBin: (tool: string) => boolean,
): Promise<DoctorFinding[]> {
  const enabled = (config.agents ?? []).filter(
    (a): a is NonNullable<typeof a> => !!a && a.enabled === true && typeof a.cli === "string",
  );
  if (enabled.length === 0) return [];

  const enabledClis = new Set(enabled.map((agent) => agent.cli));
  const configured = KNOWN_AGENTS.filter(
    (agent) => agent.cli && enabledClis.has(agent.cli) && hasBin(agent.binary),
  );

  const rows = await detectAgents({ agents: configured, probeAuth: false });
  const byCli = new Map<string, ReturnType<typeof compatibilityForDetectedAgent>>();
  for (const row of rows) {
    if (!row.cli) continue;
    byCli.set(row.cli, compatibilityForDetectedAgent(row));
  }

  const findings: DoctorFinding[] = [];
  for (const entry of enabled) {
    const cli = entry.cli!;
    if (!enabledClis.has(cli)) continue;
    const row = rows.find((agent) => agent.cli === cli);
    const result = row ? (byCli.get(cli) ?? compatibilityForDetectedAgent(row)) : null;

    if (!row || !result) {
      findings.push(
        finding(
          `runtime.compatibility.${cli}`,
          "runtime",
          "warn",
          `${entry.name || cli} is not installed`,
          "The configured harness is not installed on PATH, so RepoOS cannot assess its compatibility.",
          "Install the harness using its official instructions, then refresh the Agents page",
        ),
      );
      continue;
    }

    const severity = compatibilityFindingSeverity(result.status);
    findings.push(
      finding(
        `runtime.compatibility.${cli}`,
        "runtime",
        severity,
        `${entry.name || cli}: ${result.label}`,
        `${result.explanation} Installed: ${result.installedVersion ?? "unknown"}; certified: ${result.newestCertifiedVersion ?? "none"}.`,
        result.status === "verified"
          ? null
          : (result.contract?.upgradeGuidance ??
              "Review the harness release guidance and verify its local capabilities before important work"),
      ),
    );
  }

  const deduped = new Map<string, DoctorFinding>();
  for (const findingRecord of findings) {
    const key = findingRecord.id;
    deduped.set(key, findingRecord);
  }
  return [...deduped.values()];
}

// ── Small helpers ───────────────────────────────────────────────────────────

function finding(
  id: string,
  category: DoctorCategory,
  severity: DoctorSeverity,
  title: string,
  detail: string,
  remediation: string | null = null,
): DoctorFinding {
  return { id, category, severity, title, detail, remediation };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function walkTaskFiles(dir: string, exts: string[], acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkTaskFiles(full, exts, acc);
    else if (exts.includes(extname(entry))) acc.push(full);
  }
  return acc;
}

/**
 * Keys the parser genuinely reads but that are deliberately absent from
 * `SUPPORTED_TOML_KEYS` (that list is the user-facing docs contract, verified
 * by `config-docs.test.ts`; the Settings UI writes a few keys it persists but
 * `loadConfig` does not read back, and the check-plan keys predate their
 * addition to the reference). Doctor must not warn about these on a healthy
 * repo, so they are treated as known here.
 */
const EXTRA_KNOWN_TOML_KEYS: readonly string[] = [
  "theme",
  "uiTheme",
  "agents",
  "ctoMonitorIntervalMs",
  "check.version",
  "check.defaultProfile",
  "check.steps",
];

/** Whether a flattened TOML key belongs to a section RepoOS understands. */
export function isKnownConfigKey(rawKey: string): boolean {
  const key = rawKey.startsWith("repoos.") ? rawKey.slice("repoos.".length) : rawKey;
  const matches = (supported: readonly string[]): boolean =>
    supported.includes(key) ||
    supported.some((s) => key.startsWith(`${s}.`) || s.startsWith(`${key}.`));
  return matches(SUPPORTED_TOML_KEYS) || matches(EXTRA_KNOWN_TOML_KEYS);
}

/** Invalid-but-silently-ignored values `loadConfig` would otherwise drop. */
export function findConfigValueProblems(parsed: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const get = (k: string): unknown => parsed[k] ?? parsed[`repoos.${k}`];

  const enumCheck = (key: string, allowed: readonly string[]): void => {
    const v = get(key);
    if (v === undefined) return;
    if (typeof v !== "string" || !allowed.includes(v)) {
      problems.push(`${key} = ${JSON.stringify(v)} (expected one of ${allowed.join(", ")})`);
    }
  };
  enumCheck("defaultStatus", STATUSES);
  enumCheck("defaultAssignee", ["ai", "human", "unassigned"]);
  enumCheck("defaultTaskMode", ["freeform", "manual"]);
  enumCheck("theme", ["dark", "light", "system"]);
  enumCheck("uiTheme", ["classic", "clear", "gen z", "jelly"]);

  const boolCheck = (key: string): void => {
    const v = get(key);
    if (v !== undefined && typeof v !== "boolean") {
      problems.push(`${key} = ${JSON.stringify(v)} (expected true or false)`);
    }
  };
  for (const key of [
    "strictBuild",
    "autoEngineeringMode",
    "skillSuggestions",
    "ntfyEnabled",
    "tunnel.enabled",
    "auth.enabled",
    "worktrees.inheritEnv",
    "remoteValidation.enabled",
    "watchdog.enabled",
  ]) {
    boolCheck(key);
  }

  const rangeCheck = (key: string, min: number, max: number): void => {
    const v = get(key);
    if (v === undefined) return;
    const n =
      typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${key} = ${JSON.stringify(v)} (expected an integer ${min}–${max})`);
    }
  };
  rangeCheck("servePort", 1, 65535);
  rangeCheck("maxActiveTasks", 1, 20);
  rangeCheck("maxConcurrentAgents", 1, 16);

  const exts = get("taskExtensions");
  if (exts !== undefined && !Array.isArray(exts)) {
    problems.push(`taskExtensions = ${JSON.stringify(exts)} (expected an array)`);
  }
  return problems;
}

// ── Identity ────────────────────────────────────────────────────────────────

function checkIdentity(root: string, cwd: string, hasBin: (t: string) => boolean): DoctorFinding[] {
  const out: DoctorFinding[] = [];
  const hasGitDir = existsSync(join(root, ".git"));
  const hasToml = existsSync(join(root, "repoos.toml"));

  if (!hasGitDir && !hasToml) {
    out.push(
      finding(
        "identity.project-root",
        "identity",
        "fail",
        "No project root found",
        `No .git or repoos.toml found at or above ${cwd}.`,
        "run `git init` in your project directory, then `repoos init`",
      ),
    );
  } else {
    const marks = [hasToml ? "repoos.toml" : null, hasGitDir ? "git" : null]
      .filter(Boolean)
      .join(", ");
    out.push(
      finding(
        "identity.project-root",
        "identity",
        "pass",
        "Project root resolved",
        `${root} (${marks})`,
      ),
    );
  }

  const gitOk = hasBin("git");
  out.push(
    gitOk
      ? finding(
          "identity.git-binary",
          "identity",
          "pass",
          "Git is installed",
          "`git` resolves on PATH.",
        )
      : finding(
          "identity.git-binary",
          "identity",
          "fail",
          "Git is not installed",
          "RepoOS isolates every task in a git worktree, so git is required.",
          installHint("git"),
        ),
  );

  if (!gitOk) {
    out.push(
      finding(
        "identity.git-repo",
        "identity",
        "fail",
        "Repository state unavailable",
        "Git is not installed, so RepoOS cannot read or create the repository it operates on.",
        "install git, then run `git init`",
      ),
    );
  } else if (!isGitRepo(root)) {
    out.push(
      finding(
        "identity.git-repo",
        "identity",
        "fail",
        "Not a valid git repository",
        hasGitDir
          ? `${root} has a .git entry git cannot read — the repository may be corrupt or incomplete.`
          : `${root} has no .git — RepoOS needs git to branch and create a worktree per task.`,
        hasGitDir
          ? "run `git status` here to see the error; re-clone or repair the repository"
          : "run `git init` and make at least one commit",
      ),
    );
  } else {
    out.push(
      finding(
        "identity.git-repo",
        "identity",
        "pass",
        "Git repository",
        `${root} is a git repository.`,
      ),
    );
  }

  if (isLinkedWorktreeRoot(root)) {
    const main = mainCheckoutRoot(root);
    out.push(
      finding(
        "identity.worktree-context",
        "identity",
        "pass",
        "Inside a linked worktree",
        main
          ? `Board reads resolve to the main checkout ${main}.`
          : "This is a linked worktree; its main checkout could not be resolved.",
      ),
    );
  } else {
    out.push(
      finding(
        "identity.worktree-context",
        "identity",
        "pass",
        "Main checkout",
        "Not a linked worktree.",
      ),
    );
  }

  const parent = resolve(root, "..");
  let writable = false;
  try {
    accessSync(root, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  if (parent === root) {
    out.push(
      finding(
        "identity.root-writable",
        "identity",
        "fail",
        "Unsafe project root",
        `${root} is the filesystem root; RepoOS must not operate here.`,
        "run `repoos doctor` from inside your project directory",
      ),
    );
  } else if (!writable) {
    out.push(
      finding(
        "identity.root-writable",
        "identity",
        "fail",
        "Project root is not writable",
        `RepoOS cannot write task files, worktrees or caches under ${root}.`,
        "fix the directory permissions, or run from a writable checkout",
      ),
    );
  } else {
    out.push(
      finding("identity.root-writable", "identity", "pass", "Project root is writable", root),
    );
  }

  const build = checkBuildForRoot(root);
  if (!build.applicable) {
    out.push(
      finding(
        "identity.repoos-build",
        "identity",
        "pass",
        "RepoOS build not applicable",
        "This checkout does not use RepoOS's own compiled build (no build marker).",
      ),
    );
  } else if (build.stale) {
    out.push(
      finding(
        "identity.repoos-build",
        "identity",
        "warn",
        "RepoOS build is stale",
        build.message ?? "src/ has changed since the last build.",
        "run `bun run build`",
      ),
    );
  } else {
    out.push(
      finding(
        "identity.repoos-build",
        "identity",
        "pass",
        "RepoOS build is fresh",
        "dist/ matches src/.",
      ),
    );
  }

  return out;
}

// ── Configuration ───────────────────────────────────────────────────────────

function checkConfig(root: string, config: RepoOSConfig): DoctorFinding[] {
  const out: DoctorFinding[] = [];
  const tomlPath = join(root, "repoos.toml");

  if (!existsSync(tomlPath)) {
    out.push(
      finding(
        "config.repoos-toml",
        "config",
        "pass",
        "No repoos.toml",
        'Built-in defaults apply (workDir "work", docsDir "docs", cacheDir ".repoos").',
        "run `repoos init` to scaffold repoos.toml and AGENTS.md",
      ),
    );
    for (const id of ["config.toml-syntax", "config.unknown-keys", "config.values"]) {
      out.push(
        finding(id, "config", "pass", "No repoos.toml to validate", "Skipped — defaults apply."),
      );
    }
  } else {
    out.push(finding("config.repoos-toml", "config", "pass", "repoos.toml found", tomlPath));
    let text = "";
    let readOk = true;
    try {
      text = readFileSync(tomlPath, "utf8");
    } catch (e) {
      readOk = false;
      out.push(
        finding(
          "config.toml-syntax",
          "config",
          "fail",
          "repoos.toml is unreadable",
          (e as Error).message,
          "check the file permissions on repoos.toml",
        ),
      );
      out.push(
        finding(
          "config.unknown-keys",
          "config",
          "fail",
          "Cannot validate keys",
          "repoos.toml is unreadable.",
        ),
      );
      out.push(
        finding(
          "config.values",
          "config",
          "fail",
          "Cannot validate values",
          "repoos.toml is unreadable.",
        ),
      );
    }

    if (readOk) {
      const syntax = validateToml(text);
      if (!syntax.ok) {
        out.push(
          finding(
            "config.toml-syntax",
            "config",
            "fail",
            "repoos.toml has a syntax error",
            `Line ${syntax.line}: ${syntax.error}`,
            `fix repoos.toml (line ${syntax.line}), then re-run \`repoos doctor\``,
          ),
        );
        out.push(
          finding(
            "config.unknown-keys",
            "config",
            "warn",
            "Cannot validate keys",
            "repoos.toml failed to parse, so unknown keys cannot be reported.",
            "fix the syntax error first",
          ),
        );
        out.push(
          finding(
            "config.values",
            "config",
            "warn",
            "Cannot validate values",
            "repoos.toml failed to parse, so invalid values cannot be reported.",
            "fix the syntax error first",
          ),
        );
      } else {
        out.push(
          finding(
            "config.toml-syntax",
            "config",
            "pass",
            "repoos.toml is valid TOML",
            "Syntax OK.",
          ),
        );
        const parsed = parseFlatToml(text);
        const unknown = Object.keys(parsed).filter((k) => !isKnownConfigKey(k));
        if (unknown.length) {
          const shown = unknown.slice(0, 8).join(", ");
          const more = unknown.length > 8 ? ` (+${unknown.length - 8} more)` : "";
          out.push(
            finding(
              "config.unknown-keys",
              "config",
              "warn",
              `Unrecognized repoos.toml key${unknown.length > 1 ? "s" : ""}`,
              `${shown}${more} — RepoOS ignores these, so a typo silently has no effect.`,
              "correct or remove the key(s); see user-docs/configuration.md",
            ),
          );
        } else {
          out.push(
            finding(
              "config.unknown-keys",
              "config",
              "pass",
              "All repoos.toml keys recognized",
              `${Object.keys(parsed).length} key(s).`,
            ),
          );
        }

        const problems = findConfigValueProblems(parsed);
        if (problems.length) {
          out.push(
            finding(
              "config.values",
              "config",
              "warn",
              "Invalid repoos.toml value(s)",
              problems.slice(0, 6).join("; "),
              "correct the value(s); RepoOS falls back to the default otherwise",
            ),
          );
        } else {
          out.push(
            finding(
              "config.values",
              "config",
              "pass",
              "repoos.toml values valid",
              "All recognized values are in range.",
            ),
          );
        }
      }
    }
  }

  out.push(
    finding(
      "config.layout",
      "config",
      "pass",
      "Effective layout",
      `work=${config.workDir} · docs=${config.docsDir} · inputs=${config.inputsDir ?? "inputs"} · ` +
        `cache=${config.cacheDir} · worktrees=${worktreesDir(root)}`,
    ),
  );

  return out;
}

// ── Filesystem and layout ───────────────────────────────────────────────────

function checkDir(
  root: string,
  id: string,
  label: string,
  key: string,
  rel: string,
  opts: { required: boolean } = { required: false },
): DoctorFinding {
  if (isAbsolute(rel)) {
    return finding(
      id,
      "layout",
      "fail",
      `${label} directory must be relative`,
      `${label} is configured as the absolute path ${rel}; RepoOS paths must stay inside the repo root.`,
      `set repoos.toml \`${key}\` to a path relative to the repo root`,
    );
  }
  const abs = resolve(root, rel);
  const normRoot = resolve(root);
  const inside = abs === normRoot || abs.startsWith(normRoot + sep);
  if (!inside) {
    return finding(
      id,
      "layout",
      "fail",
      `${label} directory escapes the repo root`,
      `${rel} resolves to ${abs}, outside ${normRoot}.`,
      `keep repoos.toml \`${key}\` inside the repo root`,
    );
  }
  if (existsSync(abs)) {
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      return finding(
        id,
        "layout",
        "fail",
        `${label} path is not a directory`,
        `${abs} exists but is not a directory.`,
        `move or remove it, then create the ${rel}/ directory`,
      );
    }
    return finding(id, "layout", "pass", `${label} directory ready`, abs);
  }
  return finding(
    id,
    "layout",
    "pass",
    `${label} directory not created yet`,
    opts.required
      ? `${rel}/ does not exist; RepoOS creates it on first use.`
      : `${rel}/ does not exist (optional).`,
  );
}

function checkLayout(root: string, config: RepoOSConfig): DoctorFinding[] {
  const out: DoctorFinding[] = [
    checkDir(root, "layout.work-dir", "Task", "workDir", config.workDir, { required: true }),
    checkDir(root, "layout.docs-dir", "Docs", "docsDir", config.docsDir),
    checkDir(root, "layout.inputs-dir", "Inputs", "inputsDir", config.inputsDir ?? "inputs"),
    checkDir(root, "layout.cache-dir", "Cache", "cacheDir", config.cacheDir),
  ];

  const wtDir = worktreesDir(root);
  if (existsSync(wtDir)) {
    let isDir = false;
    try {
      isDir = statSync(wtDir).isDirectory();
    } catch {
      isDir = false;
    }
    out.push(
      isDir
        ? finding("layout.worktrees-dir", "layout", "pass", "Worktrees directory ready", wtDir)
        : finding(
            "layout.worktrees-dir",
            "layout",
            "fail",
            "Worktrees path is not a directory",
            `${wtDir} exists but is not a directory.`,
            "move or remove it; RepoOS recreates it when a task starts",
          ),
    );
  } else {
    out.push(
      finding(
        "layout.worktrees-dir",
        "layout",
        "pass",
        "Worktrees directory not created yet",
        `${wtDir} is created on demand when a task starts.`,
      ),
    );
  }

  out.push(checkTaskFrontmatter(root, config));
  return out;
}

function checkTaskFrontmatter(root: string, config: RepoOSConfig): DoctorFinding {
  const workPath = join(root, config.workDir);
  if (!existsSync(workPath)) {
    return finding(
      "layout.task-frontmatter",
      "layout",
      "pass",
      "No task directory yet",
      `${config.workDir}/ does not exist; it is created with the first task.`,
    );
  }
  const files = walkTaskFiles(workPath, config.taskExtensions);
  if (files.length === 0) {
    return finding(
      "layout.task-frontmatter",
      "layout",
      "pass",
      "No task files yet",
      `${config.workDir}/ is empty.`,
    );
  }

  const issues: string[] = [];
  for (const abs of files) {
    const relPath = relative(root, abs).split("\\").join("/");
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      issues.push(`${relPath}: unreadable`);
      continue;
    }
    const { data, hadFrontmatter } = parseDocument(content);
    if (!hadFrontmatter) {
      issues.push(`${relPath}: no frontmatter`);
      continue;
    }
    if (!("id" in data) || data.id === null || String(data.id).trim() === "") {
      issues.push(`${relPath}: missing id`);
      continue;
    }
    const status = String(data.status ?? "").toLowerCase();
    if (data.status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
      issues.push(`${relPath}: invalid status "${String(data.status)}"`);
    }
    if (!("title" in data) || data.title === null || String(data.title).trim() === "") {
      issues.push(`${relPath}: missing title`);
    }
  }

  if (issues.length === 0) {
    return finding(
      "layout.task-frontmatter",
      "layout",
      "pass",
      "Task files have valid frontmatter",
      `${files.length} file(s) checked.`,
    );
  }
  const shown = issues.slice(0, 5).join("; ");
  const more = issues.length > 5 ? ` (+${issues.length - 5} more)` : "";
  return finding(
    "layout.task-frontmatter",
    "layout",
    "warn",
    `${issues.length} task file(s) with invalid frontmatter`,
    `${shown}${more}`,
    "fix the file(s), or re-create them via `repoos new` / the API so frontmatter is valid",
  );
}

// ── Runtime prerequisites ───────────────────────────────────────────────────

function checkRuntime(
  root: string,
  config: RepoOSConfig,
  hasBin: (t: string) => boolean,
  plan: CheckPlan,
): DoctorFinding[] {
  const out: DoctorFinding[] = [];

  const bun = hasBin("bun");
  const node = hasBin("node");
  if (!bun && !node) {
    out.push(
      finding(
        "runtime.core",
        "runtime",
        "fail",
        "No JavaScript runtime found",
        "RepoOS itself runs on Bun or Node, and package-manager scripts need one of them.",
        installHint("bun"),
      ),
    );
  } else if (!bun) {
    out.push(
      finding(
        "runtime.core",
        "runtime",
        "warn",
        "Bun is not installed",
        "RepoOS will fall back to Node, but Bun is recommended (faster installs, builds and tests).",
        installHint("bun"),
      ),
    );
  } else {
    out.push(
      finding(
        "runtime.core",
        "runtime",
        "pass",
        "Bun is installed",
        isBun() ? "Doctor is running under Bun." : "Bun is available on PATH.",
      ),
    );
  }

  const agents = (config.agents ?? []).filter(
    (a): a is NonNullable<typeof a> => !!a && a.enabled === true && typeof a.cli === "string",
  );
  if (agents.length === 0) {
    out.push(
      finding(
        "runtime.agent-clis",
        "runtime",
        "pass",
        "No agent CLIs enabled",
        "Enable an agent on the Agents page when you want to hand work to one.",
      ),
    );
  } else {
    const rows = agents.map((a) => {
      const cli = String(a.cli);
      const known = KNOWN_AGENTS.find((k) => k.cli === cli);
      const binary = known?.binary ?? cli;
      return {
        name: a.name || cli,
        binary,
        installed: hasBin(binary),
        hint: known?.installHint ?? installHint(binary),
      };
    });
    const missing = rows.filter((r) => !r.installed);
    if (missing.length) {
      out.push(
        finding(
          "runtime.agent-clis",
          "runtime",
          "warn",
          `${missing.length} enabled agent CLI${missing.length > 1 ? "s" : ""} not installed`,
          missing.map((r) => `${r.name} (${r.binary}) — ${r.hint}`).join("; "),
          "install the missing CLI(s), or disable the agent on the Agents page",
        ),
      );
    } else {
      out.push(
        finding(
          "runtime.agent-clis",
          "runtime",
          "pass",
          "Enabled agent CLIs are installed",
          rows.map((r) => `${r.name} (${r.binary})`).join(", "),
        ),
      );
    }
  }

  if (!existsSync(join(root, "package.json"))) {
    out.push(
      finding(
        "runtime.package-manager",
        "runtime",
        "pass",
        "No package.json",
        "The package-manager check is skipped for non-JavaScript projects.",
      ),
    );
  } else {
    const pm = detectPackageManager(root);
    out.push(
      pm
        ? finding("runtime.package-manager", "runtime", "pass", "Package manager detected", pm)
        : finding(
            "runtime.package-manager",
            "runtime",
            "warn",
            "package.json has no package manager",
            "No lockfile was found and neither `bun` nor `npm` resolves on PATH.",
            `install Bun (${installHint("bun")}) or Node.js/npm`,
          ),
    );
  }

  if (plan.source === "empty") {
    out.push(
      finding(
        "runtime.check-tools",
        "runtime",
        "pass",
        "No check-plan tools to verify",
        "There is no usable plan to read `requires` from.",
      ),
    );
  } else {
    const required = unique(plan.steps.filter((s) => s.required).flatMap((s) => s.requires));
    const optional = unique(
      plan.steps.filter((s) => !s.required).flatMap((s) => s.requires),
    ).filter((t) => !required.includes(t));
    const missingRequired = missingBinaries(required);
    const missingOptional = missingBinaries(optional);
    if (missingRequired.length) {
      out.push(
        finding(
          "runtime.check-tools",
          "runtime",
          "fail",
          "Missing required check tool(s)",
          prereqDetail(missingRequired),
          "install the tool(s), or adjust `requires` in [[check.steps]]",
        ),
      );
    } else {
      out.push(
        finding(
          "runtime.check-tools",
          "runtime",
          "pass",
          "Required check tools installed",
          required.length ? required.join(", ") : "No required tools declared.",
        ),
      );
    }
    if (missingOptional.length) {
      out.push(
        finding(
          "runtime.check-tools",
          "runtime",
          "warn",
          "Missing optional check tool(s)",
          prereqDetail(missingOptional),
          "install the tool(s), or mark the step required if it must always run",
        ),
      );
    }
  }

  return out;
}

// ── Project gate ────────────────────────────────────────────────────────────

function checkGate(plan: CheckPlan): DoctorFinding[] {
  const requiredCount = plan.steps.filter((s) => s.required).length;
  if (plan.errors.length) {
    return [
      finding(
        "gate.check-plan",
        "gate",
        "fail",
        "Check plan has errors",
        plan.errors.join("; "),
        "fix the [check] section in repoos.toml, or run `repoos check --print-plan`",
      ),
    ];
  }
  switch (plan.source) {
    case "declared":
      return [
        finding(
          "gate.check-plan",
          "gate",
          "pass",
          "Check plan declared",
          `${plan.steps.length} step(s), ${requiredCount} required — \`repoos check\` runs exactly these.`,
        ),
      ];
    case "legacy":
      return [
        finding(
          "gate.check-plan",
          "gate",
          "warn",
          "Legacy [check] configuration",
          "The gate runs, but the plan is synthesised from the pre-plan keys.",
          "run `repoos check --print-plan` and commit the [[check.steps]] output",
        ),
      ];
    case "inferred":
      return [
        finding(
          "gate.check-plan",
          "gate",
          "warn",
          "Check plan inferred, not committed",
          "The gate is meaningful but derived from the repo layout, so it can change silently.",
          "run `repoos check --print-plan` and commit the [[check.steps]] output",
        ),
      ];
    case "empty":
    default:
      return [
        finding(
          "gate.check-plan",
          "gate",
          "fail",
          "No usable check plan",
          "`repoos check` cannot pass: there is no declared plan, no legacy config, and no recognisable stack to infer one from.",
          "add [[check.steps]] to repoos.toml, or run `repoos check --print-plan` to generate one",
        ),
      ];
  }
}

// ── Local lifecycle (read-only) ─────────────────────────────────────────────

interface ServeLockRecord {
  file: string;
  pid: number;
  port: number | null;
  host: string | null;
  startedAt: string | null;
  alive: boolean;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Read `.repoos/serve[-<port>].lock` records — never mutates them. */
function readServeLocks(root: string, cacheDir: string): ServeLockRecord[] {
  let files: string[];
  try {
    files = readdirSync(join(root, cacheDir)).filter((f) => /^serve(?:-\d+)?\.lock$/.test(f));
  } catch {
    return [];
  }
  const out: ServeLockRecord[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(root, cacheDir, file), "utf8")) as {
        pid?: unknown;
        port?: unknown;
        host?: unknown;
        startedAt?: unknown;
      };
      const pid = typeof raw.pid === "number" && Number.isInteger(raw.pid) ? raw.pid : 0;
      out.push({
        file,
        pid,
        port: typeof raw.port === "number" ? raw.port : null,
        host: typeof raw.host === "string" ? raw.host : null,
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
        alive: pid > 0 && pid !== process.pid && pidAlive(pid),
      });
    } catch {
      /* corrupt lockfile — the serve reaper cleans it up; doctor only reports */
    }
  }
  out.sort(
    (a, b) =>
      Number(b.alive) - Number(a.alive) ||
      (Date.parse(b.startedAt ?? "") || 0) - (Date.parse(a.startedAt ?? "") || 0),
  );
  return out;
}

async function probeHealth(
  port: number,
  root: string,
  timeoutMs: number,
): Promise<{ state: "ok" | "foreign" | "unreachable"; root: string | null }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { state: "unreachable", root: null };
    const body = (await res.json()) as { ok?: unknown; root?: unknown };
    if (body.ok !== true || typeof body.root !== "string")
      return { state: "unreachable", root: null };
    return { state: body.root === root ? "ok" : "foreign", root: body.root };
  } catch {
    return { state: "unreachable", root: null };
  }
}

async function checkLifecycle(
  root: string,
  config: RepoOSConfig,
  opts: DoctorOptions,
): Promise<DoctorFinding[]> {
  // A linked worktree's server is the main checkout's; report on that root so a
  // running server is never misread as "a different project" (#0451).
  const mainRoot = mainCheckoutRoot(root) ?? root;
  const locks = readServeLocks(mainRoot, config.cacheDir);
  const primary = locks.find((l) => l.alive) ?? locks[0] ?? null;
  const port = opts.probePort ?? primary?.port ?? resolveServePort(mainRoot, config);
  const timeout = opts.probeTimeoutMs ?? 800;

  const health = await probeHealth(port, mainRoot, timeout);
  if (health.state === "foreign") {
    return [
      finding(
        "lifecycle.server",
        "lifecycle",
        "warn",
        `Port ${port} serves a different project`,
        `A RepoOS server answers on port ${port}, but reports root ${health.root ?? "unknown"}.`,
        "stop the other server, or set a different servePort in repoos.toml",
      ),
    ];
  }
  if (health.state === "ok") {
    const managed = primary?.alive ?? false;
    return [
      finding(
        "lifecycle.server",
        "lifecycle",
        "pass",
        "RepoOS server is running",
        `Port ${port} answers for this project${managed ? " (managed by a serve lock)" : " (no serve lock)"}.`,
      ),
    ];
  }

  const listening = await portListening(port, timeout);
  if (listening) {
    if (primary?.alive) {
      return [
        finding(
          "lifecycle.server",
          "lifecycle",
          "warn",
          "RepoOS server is not answering",
          `Port ${port} is listening and a serve process is recorded, but /api/health did not respond — it may still be starting, or hung.`,
          "check `repoos status`; restart with `repoos stop` then `repoos serve`",
        ),
      ];
    }
    return [
      finding(
        "lifecycle.server",
        "lifecycle",
        "warn",
        `Something else is listening on port ${port}`,
        "The port is open but no RepoOS server answers for this project.",
        "stop the other process, or set a different servePort in repoos.toml",
      ),
    ];
  }

  if (primary && !primary.alive) {
    return [
      finding(
        "lifecycle.server",
        "lifecycle",
        "warn",
        "Stale serve lockfile",
        `A serve lock records pid ${primary.pid}${primary.port !== null ? ` on port ${primary.port}` : ""}, but that process is gone and nothing is listening.`,
        "run `repoos stop` to clear the stale lock, then `repoos serve` when you need the server",
      ),
    ];
  }

  return [
    finding(
      "lifecycle.server",
      "lifecycle",
      "pass",
      "No server running",
      "Start it with `repoos serve` when you need the board or want to hand work to an agent.",
    ),
  ];
}

// ── Secrets / credentials ───────────────────────────────────────────────────

function checkSecrets(config: RepoOSConfig, env: NodeJS.ProcessEnv): DoctorFinding[] {
  const out: DoctorFinding[] = [];

  const auth = config.auth;
  if (!auth?.enabled) {
    out.push(
      finding(
        "secrets.auth",
        "secrets",
        "pass",
        "Authentication is disabled",
        "No login is required.",
      ),
    );
  } else {
    const emailOk = Boolean(auth.emailProvider?.apiKey && auth.emailProvider?.fromAddress);
    const googleOk = Boolean(auth.google?.clientId && auth.google?.clientSecret);
    const bootstrapOk =
      typeof auth.bootstrapAdmin === "string" && auth.bootstrapAdmin.trim() !== "";
    if (!emailOk && !googleOk) {
      out.push(
        finding(
          "secrets.auth",
          "secrets",
          "fail",
          "Auth is enabled but no login provider is ready",
          "With auth.enabled = true and no working login provider credential, the server refuses to start.",
          "configure an email or Google login provider — see user-docs/environment-and-secrets.md",
        ),
      );
    } else if (!bootstrapOk) {
      out.push(
        finding(
          "secrets.auth",
          "secrets",
          "fail",
          "Auth is enabled but no bootstrap admin is set",
          "No one can claim the first admin account, so login can be reached but never completed.",
          "set auth.bootstrapAdmin to the first admin email",
        ),
      );
    } else {
      out.push(
        finding(
          "secrets.auth",
          "secrets",
          "pass",
          "Auth is enabled and ready",
          `Login provider credential present (${emailOk ? "email" : "Google"}); bootstrap admin set.`,
        ),
      );
    }
  }

  const whisperProvider = config.whisper?.provider ?? "none";
  if (whisperProvider === "none") {
    out.push(
      finding(
        "secrets.whisper",
        "secrets",
        "pass",
        "Voice transcription disabled",
        "No provider configured.",
      ),
    );
  } else if (config.whisper?.apiKey) {
    out.push(
      finding(
        "secrets.whisper",
        "secrets",
        "pass",
        "Voice transcription configured",
        `Provider "${whisperProvider}" has a credential.`,
      ),
    );
  } else {
    out.push(
      finding(
        "secrets.whisper",
        "secrets",
        "warn",
        "Voice transcription has no credential",
        `Provider "${whisperProvider}" is set, but no credential is present — transcription will be unavailable.`,
        "see user-docs/environment-and-secrets.md",
      ),
    );
  }

  if (config.remoteValidation?.enabled) {
    const hasToken = Boolean(env.HETZNER_API_TOKEN);
    const hasSshKey = Boolean(env.REPOOS_REMOTE_SSH_KEY);
    if (hasToken && hasSshKey) {
      out.push(
        finding(
          "secrets.remote-validation",
          "secrets",
          "pass",
          "Remote validation configured",
          "Required credential variables are present.",
        ),
      );
    } else {
      out.push(
        finding(
          "secrets.remote-validation",
          "secrets",
          "warn",
          "Remote validation credentials are incomplete",
          `Missing ${!hasToken ? "an API token" : ""}${!hasToken && !hasSshKey ? " and " : ""}${!hasSshKey ? "an SSH key path" : ""}.`,
          "see user-docs/environment-and-secrets.md",
        ),
      );
    }
  } else {
    out.push(
      finding(
        "secrets.remote-validation",
        "secrets",
        "pass",
        "Remote validation disabled",
        "No credentials required.",
      ),
    );
  }

  const providerCount =
    (config.modelProviders?.openrouterApiKey ? 1 : 0) +
    (config.modelProviders?.opencodeGoApiKey ? 1 : 0);
  out.push(
    finding(
      "secrets.model-providers",
      "secrets",
      "pass",
      "Model-provider keys",
      providerCount > 0
        ? `${providerCount} provider credential(s) present.`
        : "None configured (optional — agent CLIs use their own sign-in).",
    ),
  );

  return out;
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function guard(
  category: DoctorCategory,
  id: string,
  fn: () => DoctorFinding[] | Promise<DoctorFinding[]>,
): Promise<DoctorFinding[]> {
  try {
    return await fn();
  } catch (e) {
    return [
      finding(id, category, "fail", `${category} check failed`, (e as Error).message ?? String(e)),
    ];
  }
}

/**
 * Run every readiness check and return the classified report. Never throws:
 * a check that errors becomes a `fail` finding for its category, so the rest
 * of the report still renders.
 */
export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const root = resolve(opts.root ?? findRepoRoot(cwd));
  const now = opts.now ?? new Date();
  const hasBin = opts.hasBinary ?? hasBinary;

  const config = loadConfig(root);
  const plan = resolveCheckPlan({
    check: config.check,
    markers: detectRepoMarkers(root),
    bunRunner: preferBunForDevTasks(root),
  });

  const findings: DoctorFinding[] = [
    ...(await guard("identity", "identity.error", () => checkIdentity(root, cwd, hasBin))),
    ...(await guard("config", "config.error", () => checkConfig(root, config))),
    ...(await guard("layout", "layout.error", () => checkLayout(root, config))),
    ...(await guard("runtime", "runtime.error", () => checkRuntime(root, config, hasBin, plan))),
    ...(await guard("runtime", "runtime.compatibility.error", () =>
      checkAgentCompatibility(config, hasBin),
    )),
    ...(await guard("gate", "gate.error", () => checkGate(plan))),
    ...(await guard("lifecycle", "lifecycle.error", () => checkLifecycle(root, config, opts))),
    ...(await guard("secrets", "secrets.error", () => checkSecrets(config, process.env))),
  ];

  findings.sort(
    (a, b) => DOCTOR_CATEGORIES.indexOf(a.category) - DOCTOR_CATEGORIES.indexOf(b.category),
  );

  const summary = {
    pass: findings.filter((f) => f.severity === "pass").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    fail: findings.filter((f) => f.severity === "fail").length,
    total: findings.length,
  };

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    project: {
      root,
      name: projectDisplayName(root),
      fromWorktree: mainCheckoutRoot(root) !== null,
    },
    tool: { name: "repoos", version: opts.version ?? null },
    summary,
    findings,
  };
}

/** Every remediation from a report, deduplicated, in finding order. */
export function doctorRemediations(report: DoctorReport): string[] {
  return unique(
    report.findings
      .filter((f) => f.severity !== "pass" && f.remediation)
      .map((f) => f.remediation as string),
  );
}
