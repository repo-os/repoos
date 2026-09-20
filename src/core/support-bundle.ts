/**
 * `repoos support bundle` — a small, inspectable, redacted diagnostic artifact
 * for failed real-world setups (#0453).
 *
 * The design rule is allowlists, not denylists. Nothing here copies a file
 * wholesale: every value is selected field-by-field from a structured source
 * (the doctor report, the resolved config, the status snapshot), free-form
 * strings are passed through `redactText`, paths are minimized, and the whole
 * thing is assembled in memory. Only after a final verification scan proves no
 * secret shape and no home/root path survived is the bundle packaged into a
 * `.tar.gz`. A verification miss aborts the write (`RedactionLeakError`).
 *
 * Everything is fail-soft: a down server, a missing agent CLI, an unparseable
 * `repoos.toml`, or an absent git repo degrade one section into an `omission`
 * with the reason, and the rest of the bundle still gets written. The structured
 * report is the source of truth; the archive is just a redacted rendering of it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { cpus, totalmem } from "node:os";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  homeDir,
  assertRedacted,
  redactText,
  redactValue,
  sanitizePathText,
  scanSecrets,
  RedactionLeakError,
  REDACTION_VERSION,
} from "./redact.js";
import {
  DEFAULT_CONFIG,
  findRepoRoot,
  isLinkedWorktreeRoot,
  loadConfig,
  mainCheckoutRoot,
  projectDisplayBranch,
  projectDisplayName,
} from "./config.js";
import { checkBuildForRoot, readBuildMeta } from "./build.js";
import { resolveCheckPlan, type CheckPlan } from "./check-plan.js";
import { detectRepoMarkers, hasBinary } from "./check-runner.js";
import { detectAgents, type DetectedAgent } from "./detect.js";
import { isBun } from "./runtime.js";
import { isGitRepo } from "./git.js";
import { runDoctor, type DoctorReport } from "./doctor.js";
import { collectStatus, type StatusSnapshot } from "../commands/status.js";
import { createLogger, type LogEntry } from "./logger.js";
import { validateToml } from "./toml-validate.js";
import type { RepoOSConfig } from "./types.js";

/** Structure version of the report/manifest. Bumped only with a migration. */
export const SUPPORT_BUNDLE_SCHEMA_VERSION = 1;

/** Default cap on recent error entries kept in the bundle. */
const MAX_ERROR_ENTRIES = 25;
/** Cap on a single redacted error/version string. */
const MAX_STRING = 500;

// ── Report shape ────────────────────────────────────────────────────────────

export interface SupportOmission {
  /** Category that could not be collected. */
  category: string;
  /** Human-readable reason, already redacted and path-minimized. */
  reason: string;
}

export interface SupportReport {
  schemaVersion: number;
  redactionVersion: number;
  generatedAt: string;
  tool: { name: "repoos"; version: string | null; buildAt: string | null };
  platform: {
    os: string;
    arch: string;
    /** RepoOS's own runtime (bun or node). */
    runtime: "bun" | "node";
    runtimeVersion: string;
    cpus: number;
    memoryBytes: number;
  };
  project: {
    name: string;
    /** Minimized (`~`, `<repo>`). */
    root: string;
    fromWorktree: boolean;
    mainCheckout: string | null;
    git: {
      isRepo: boolean;
      branch: string | null;
      clean: boolean | null;
      dirtyFiles: number | null;
      isMainBranch: boolean | null;
    } | null;
  };
  build: {
    code: string;
    stale: boolean;
    applicable: boolean;
    version: string | null;
    buildAt: string | null;
    message: string | null;
  } | null;
  config: {
    present: boolean;
    /** How `repoos.toml` was read: ok / defaults / unreadable / syntax-error. */
    parse: "ok" | "defaults" | "unreadable" | "syntax-error";
    parseDetail: string | null;
    schemaVersion: number;
    shape: Record<string, unknown>;
  };
  agents: {
    probed: boolean;
    rows: Array<{
      id: string;
      name: string;
      binary: string;
      installed: boolean;
      version: string | null;
      headless: boolean | null;
      auth: boolean | null;
    }>;
  };
  checkPlan: {
    source: string;
    version: number;
    defaultProfile: string;
    stepCount: number;
    requiredCount: number;
    steps: Array<{
      name: string;
      kind: string | null;
      hasCommand: boolean;
      required: boolean;
      profiles: string[];
    }>;
    warnings: string[];
    errors: string[];
  };
  latestOperation: {
    kind: "doctor";
    result: "pass" | "warn" | "fail";
    generatedAt: string;
    summary: { pass: number; warn: number; fail: number; total: number };
  } | null;
  doctor: {
    generatedAt: string;
    summary: { pass: number; warn: number; fail: number; total: number };
    findings: Array<{
      id: string;
      category: string;
      severity: string;
      title: string;
      detail: string;
      remediation: string | null;
    }>;
  } | null;
  lifecycle: {
    server: {
      lifecycle: string;
      running: boolean;
      port: number | null;
      health: string;
      locks: number;
    } | null;
    tunnel: { configured: boolean; running: boolean } | null;
    board: { taskCount: number; counts: Record<string, number> } | null;
    worktrees: { count: number; warnThreshold: number } | null;
  };
  recentErrors: {
    count: number;
    entries: Array<{
      timestamp: string;
      level: string;
      component: string;
      message: string;
    }>;
  };
  omissions: SupportOmission[];
}

export interface SupportBundleFile {
  /** Archive-relative POSIX path. */
  path: string;
  /** Allowlisted category this file documents. */
  category: string;
  /** One-line description shown in the plan/manifest. */
  description: string;
  /** Serialized content (UTF-8 JSON or plain text). */
  content: string;
}

export interface SupportManifest {
  schemaVersion: number;
  redactionVersion: number;
  generatedAt: string;
  tool: SupportReport["tool"];
  platform: SupportReport["platform"];
  /** The manifest is the entry point of the archive. */
  manifest: "manifest.json";
  files: Array<{
    path: string;
    category: string;
    bytes: number;
    sha256: string;
    description: string;
  }>;
  omitted: SupportOmission[];
  redaction: {
    version: number;
    rules: string[];
    paths: { homeMinimized: boolean; repoRootMinimized: boolean };
  };
}

export interface SupportBundle {
  report: SupportReport;
  manifest: SupportManifest;
  files: SupportBundleFile[];
  /** Real (unminimized) repo root — never serialized into the archive. */
  root: string;
  /** Effective cache directory name, for the default output path. */
  cacheDir: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function clip(text: string, max = MAX_STRING): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** SHA-256 of a file's name + content, used for the manifest. */
function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

// ── Config shape (allowlist) ────────────────────────────────────────────────

/**
 * The non-sensitive *shape* of the effective configuration. Every field here
 * is either a boolean, an enum, a count, or a directory name; secrets, free-form
 * commands, agent env vars, URLs, topics and email addresses are deliberately
 * absent. This is an allowlist — adding a field means deciding it is safe.
 */
export function summarizeConfigShape(
  config: RepoOSConfig,
  plan: CheckPlan,
): Record<string, unknown> {
  const check = config.check;
  const enabledAgents = (config.agents ?? []).filter((a) => a?.enabled === true);
  return {
    workDir: config.workDir,
    docsDir: config.docsDir,
    skillsDir: config.skillsDir,
    inputsDir: config.inputsDir ?? null,
    taskExtensions: config.taskExtensions,
    defaultStatus: config.defaultStatus,
    // defaultAssignee is deliberately omitted: it is a free-form value that is
    // commonly an email address, which the redaction ruleset does not (and
    // should not) treat as a secret — so it must not enter the bundle at all.
    defaultTaskMode: config.defaultTaskMode ?? null,
    cacheDir: config.cacheDir,
    strictBuild: Boolean(config.strictBuild),
    tunnelEnabled: Boolean(config.tunnelEnabled),
    ntfyEnabled: Boolean(config.ntfyEnabled),
    autoEngineeringMode: Boolean(config.autoEngineeringMode),
    skillSuggestions: Boolean(config.skillSuggestions),
    maxActiveTasks: config.maxActiveTasks ?? null,
    maxConcurrentAgents: config.maxConcurrentAgents ?? null,
    worktreeWarnThreshold: config.worktreeWarnThreshold ?? null,
    servePort: config.servePort ?? null,
    theme: config.theme ?? null,
    uiTheme: config.uiTheme ?? null,
    boardColumns: config.boardColumns ? Object.keys(config.boardColumns) : [],
    agents: {
      configured: (config.agents ?? []).length,
      enabled: enabledAgents.length,
    },
    check: {
      version: check?.version ?? plan.version,
      defaultProfile: check?.defaultProfile ?? plan.defaultProfile,
      source: plan.source,
      stepCount: plan.steps.length,
      requiredCount: plan.steps.filter((s) => s.required).length,
      stepNames: plan.steps.map((s) => s.name),
      hasUiSmoke: Boolean(check?.uiSmoke),
      bareRequireDirs: check?.bareRequireDirs?.length ?? 0,
      themeScopes: check?.themeScopes?.length ?? 0,
      contrastPairs: check?.contrastPairs?.length ?? 0,
    },
    preview: config.preview
      ? {
          configured: true,
          hasDefaultCommand: Boolean(config.preview.command),
          targetCount: config.preview.targets?.length ?? 0,
          targetNames: (config.preview.targets ?? []).map((t) => t.name),
        }
      : { configured: false, hasDefaultCommand: false, targetCount: 0, targetNames: [] },
    worktrees: { inheritEnv: Boolean(config.worktrees?.inheritEnv) },
    release: { enabled: Boolean(config.release?.enabled) },
    deployments: {
      count: config.deployments?.length ?? 0,
      providers: [
        ...new Set((config.deployments ?? []).map((d) => d.provider).filter(Boolean)),
      ] as string[],
    },
    distribution: { count: config.distribution?.length ?? 0 },
    auth: {
      enabled: Boolean(config.auth?.enabled),
      sessionMaxAge: config.auth?.sessionMaxAge ?? null,
      bootstrapAdminSet: Boolean(config.auth?.bootstrapAdmin),
      emailProviderConfigured: Boolean(config.auth?.emailProvider),
      googleConfigured: Boolean(config.auth?.google),
    },
    whisper: {
      provider: config.whisper?.provider ?? "none",
      credentialPresent: Boolean(config.whisper?.apiKey),
    },
    remoteValidation: {
      enabled: Boolean(config.remoteValidation?.enabled),
      fallbackToLocal: Boolean(config.remoteValidation?.fallbackToLocal),
    },
    modelProviders: {
      openrouterConfigured: Boolean(config.modelProviders?.openrouterApiKey),
      opencodeGoConfigured: Boolean(config.modelProviders?.opencodeGoApiKey),
    },
    watchdog: { enabled: config.watchdog?.enabled ?? null },
    supervisor: { enabled: config.supervisor?.enabled ?? null },
    builtInAgents: Object.keys(config.builtInAgents ?? {}),
  };
}

// ── Collection ──────────────────────────────────────────────────────────────

export interface BuildBundleOptions {
  /** Repo root; defaults to root discovery from `cwd`. */
  root?: string;
  cwd?: string;
  now?: Date;
  /** RepoOS version/build time; defaults to `readBuildMeta()`. */
  version?: string | null;
  buildAt?: string | null;
  /** Environment used for home-dir minimization; injectable for tests. */
  env?: NodeJS.ProcessEnv;
  /** Skip running the doctor preflight (tests / offline). */
  doctor?: () => Promise<DoctorReport>;
  /** Skip agent detection (tests / speed). */
  detectAgents?: () => Promise<DetectedAgent[]>;
  /** Skip the status snapshot (tests / down server). */
  status?: (config: RepoOSConfig) => Promise<StatusSnapshot>;
  /** Read recent log entries; injectable for tests. */
  readLogs?: (root: string, limit: number) => LogEntry[];
  /** Detection probe timeout in ms. */
  versionTimeoutMs?: number;
}

interface Collector {
  (): Promise<void> | void;
}

/**
 * Build the structured report and the redacted file set. Never throws for a
 * degraded environment — a failing section becomes an omission with its reason.
 * It *does* throw {@link RedactionLeakError} if verification finds a secret or
 * an unsanitized path, because that must never be silently packaged.
 */
export async function buildSupportBundle(opts: BuildBundleOptions = {}): Promise<SupportBundle> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const root = resolve(opts.root ?? findRepoRoot(cwd));
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const home = homeDir(env);
  const pathCtx = { root, home: home ?? undefined };
  const build = readBuildMeta();
  const version = opts.version !== undefined ? opts.version : build.version;
  const buildAt = opts.buildAt !== undefined ? opts.buildAt : build.buildAt;
  const omissions: SupportOmission[] = [];

  const omit = (category: string, reason: string): void => {
    omissions.push({
      category,
      reason: clip(sanitizePathText(redactText(reason), pathCtx)),
    });
  };

  // ── config ──
  let configParse: SupportReport["config"]["parse"] = "defaults";
  let configParseDetail: string | null = null;
  // A failed `loadConfig` must never abort the bundle: fall back to a
  // defaults-only config and record why. `loadConfig` reads `.env` (which can
  // throw on an unreadable file) before merging repoos.toml, so this is a real
  // failure mode, not just defensive shape.
  let config: RepoOSConfig;
  try {
    config = loadConfig(root);
  } catch (e) {
    omit("config", `loadConfig failed: ${(e as Error).message} — using built-in defaults`);
    config = { root, ...DEFAULT_CONFIG };
  }
  const tomlPath = join(root, "repoos.toml");
  if (existsSync(tomlPath)) {
    try {
      const text = readFileSync(tomlPath, "utf8");
      const result = validateToml(text);
      if (result.ok) {
        configParse = "ok";
      } else {
        configParse = "syntax-error";
        configParseDetail = clip(`line ${result.line}: ${result.error ?? "invalid TOML"}`);
        omit(
          "config.toml-syntax",
          `repoos.toml does not parse (line ${result.line}) — the effective shape below reflects forgiving best-effort parsing plus defaults`,
        );
      }
    } catch (e) {
      configParse = "unreadable";
      configParseDetail = clip((e as Error).message);
      omit("config.repoos-toml", `repoos.toml is unreadable: ${(e as Error).message}`);
    }
  } else {
    configParse = "defaults";
  }

  // ── build ──
  let buildSection: SupportReport["build"] = null;
  try {
    const result = checkBuildForRoot(root);
    buildSection = {
      code: result.code,
      stale: result.stale,
      applicable: result.applicable,
      version,
      buildAt,
      message: result.message ? clip(redactText(result.message)) : null,
    };
  } catch (e) {
    omit("build", `build staleness check failed: ${(e as Error).message}`);
  }

  // ── check plan ──
  const plan = resolveCheckPlan({
    check: config.check,
    markers: detectRepoMarkers(root),
    bunRunner: hasBinary("bun"),
  });

  // ── agents ──
  let agentRows: SupportReport["agents"]["rows"] = [];
  let agentsProbed = false;
  try {
    const detect =
      opts.detectAgents ?? (() => detectAgents({ versionTimeoutMs: opts.versionTimeoutMs }));
    const detected = await detect();
    agentsProbed = true;
    agentRows = detected.map((a) => ({
      id: a.id,
      name: clip(redactText(a.name)),
      binary: clip(redactText(a.binary)),
      installed: a.installed,
      version: a.version ? clip(sanitizePathText(redactText(a.version), pathCtx)) : null,
      headless: a.headless,
      auth: a.auth,
    }));
  } catch (e) {
    omit("agents", `agent detection failed: ${(e as Error).message}`);
  }

  // ── doctor ──
  let doctorSection: SupportReport["doctor"] = null;
  let latestOperation: SupportReport["latestOperation"] = null;
  try {
    const doctor = await (opts.doctor ?? (() => runDoctor({ root, now, version })))();
    const result: "pass" | "warn" | "fail" =
      doctor.summary.fail > 0 ? "fail" : doctor.summary.warn > 0 ? "warn" : "pass";
    latestOperation = {
      kind: "doctor",
      result,
      generatedAt: doctor.generatedAt,
      summary: doctor.summary,
    };
    doctorSection = {
      generatedAt: doctor.generatedAt,
      summary: doctor.summary,
      findings: doctor.findings.map((f) => ({
        id: f.id,
        category: f.category,
        severity: f.severity,
        title: clip(f.title),
        detail: clip(f.detail),
        remediation: f.remediation ? clip(f.remediation) : null,
      })),
    };
  } catch (e) {
    omit("doctor", `doctor preflight failed: ${(e as Error).message}`);
  }

  // ── lifecycle / status ──
  const lifecycle: SupportReport["lifecycle"] = {
    server: null,
    tunnel: null,
    board: null,
    worktrees: null,
  };
  let status: StatusSnapshot | null = null;
  try {
    status = await (opts.status ?? ((c: RepoOSConfig) => collectStatus(c, { now })))(config);
    lifecycle.server = {
      lifecycle: status.server.lifecycle,
      running: status.server.running,
      port: status.server.port,
      health: status.server.health,
      locks: status.server.locks,
    };
    lifecycle.tunnel = { configured: status.tunnel.configured, running: status.tunnel.running };
    lifecycle.board = { taskCount: status.board.taskCount, counts: status.board.counts };
    lifecycle.worktrees = {
      count: status.worktrees.count,
      warnThreshold: status.worktrees.warnThreshold,
    };
  } catch (e) {
    omit("lifecycle", `status snapshot failed: ${(e as Error).message}`);
  }

  // ── recent errors (bounded, redacted, no context) ──
  let recentErrors: SupportReport["recentErrors"]["entries"] = [];
  try {
    const readLogs =
      opts.readLogs ?? ((r: string, limit: number) => createLogger(r).getSystemLogs(limit));
    const logs = readLogs(root, 400);
    recentErrors = logs
      .filter((l) => l.level === "error" || l.level === "fatal" || l.level === "warn")
      .slice(0, MAX_ERROR_ENTRIES)
      .map((l) => ({
        timestamp: l.timestamp,
        level: l.level,
        component: l.component,
        message: clip(sanitizePathText(redactText(l.message), pathCtx)),
      }));
  } catch (e) {
    omit("errors", `system log read failed: ${(e as Error).message}`);
  }

  // ── git ──
  let git: SupportReport["project"]["git"] = null;
  try {
    const isRepo = isGitRepo(root);
    git = {
      isRepo,
      branch: status?.git.branch ?? projectDisplayBranch(root),
      clean: status?.git.clean ?? null,
      dirtyFiles: status?.git.dirtyFiles ?? null,
      isMainBranch: status?.git.isMainBranch ?? null,
    };
  } catch (e) {
    omit("git", `git state read failed: ${(e as Error).message}`);
  }

  const mainRoot = mainCheckoutRoot(root);

  const platform: SupportReport["platform"] = {
    os: process.platform,
    arch: process.arch,
    runtime: isBun() ? "bun" : "node",
    runtimeVersion: process.versions.bun ?? process.versions.node ?? "unknown",
    cpus: safeCpus(),
    memoryBytes: safeMemory(),
  };

  const report: SupportReport = {
    schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
    redactionVersion: REDACTION_VERSION,
    generatedAt: now.toISOString(),
    tool: { name: "repoos", version, buildAt },
    platform,
    project: {
      name: projectDisplayName(root),
      root: sanitizePathText(root, pathCtx),
      fromWorktree: isLinkedWorktreeRoot(root),
      mainCheckout: mainRoot ? sanitizePathText(mainRoot, pathCtx) : null,
      git,
    },
    build: buildSection,
    config: {
      present: existsSync(tomlPath),
      parse: configParse,
      parseDetail: configParseDetail,
      schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
      shape: summarizeConfigShape(config, plan),
    },
    agents: { probed: agentsProbed, rows: agentRows },
    checkPlan: {
      source: plan.source,
      version: plan.version,
      defaultProfile: plan.defaultProfile,
      stepCount: plan.steps.length,
      requiredCount: plan.steps.filter((s) => s.required).length,
      steps: plan.steps.map((s) => ({
        name: s.name,
        kind: s.kind ?? null,
        hasCommand: Boolean(s.command),
        required: s.required,
        profiles: s.profiles,
      })),
      warnings: plan.warnings.map((w) => clip(sanitizePathText(redactText(w), pathCtx))),
      errors: plan.errors.map((w) => clip(sanitizePathText(redactText(w), pathCtx))),
    },
    latestOperation,
    doctor: doctorSection,
    lifecycle,
    recentErrors: { count: recentErrors.length, entries: recentErrors },
    omissions,
  };

  // Sanitize every string in the report once more (defence in depth). Free-form
  // sections (doctor findings, error messages) are additionally *scrubbed*:
  // any individual string that still fails verification is neutralized to
  // `[redacted]` in place, so an exotic value in one finding cannot take down
  // the rest of the report. The verify pass shares patterns with `redactText`,
  // so this is rare — but a user hitting an exotic failure mode is exactly the
  // person who needs the bundle.
  const safeReport = scrubContaminated(sanitizeReport(report, pathCtx), pathCtx);

  // Verification runs per section, not over the whole archive at once. A
  // section that still matches a secret shape or a raw path after redaction is
  // DROPPED and recorded as an omission — never allowed to abort the bundle.
  const { files, dropped } = verifySections(buildFiles(safeReport), pathCtx);
  for (const d of dropped) {
    omit(d.category, `dropped after redaction verification found ${d.patterns.join(", ")}`);
  }

  const safeReportWithOmissions: SupportReport = { ...safeReport, omissions };

  const manifest = buildManifest(safeReportWithOmissions, files, {
    homeMinimized: home !== null,
    repoRootMinimized: true,
  });

  // The manifest itself is the last gate: a manifest that fails verification
  // would mean the redaction ruleset is broken, which is the one case where
  // refusing to write anything is correct.
  const manifestContent = stringify(manifest);
  assertRedacted(manifestContent, "manifest.json");
  assertNoRawPaths(manifestContent, pathCtx, "manifest.json");

  return {
    report: safeReportWithOmissions,
    manifest,
    files,
    root,
    cacheDir: config.cacheDir,
  };
}

/**
 * Walk the report and replace any string that still trips the secret or path
 * verifier with `[redacted]`. This is the per-field safety net beneath the
 * per-section drop: it keeps the structured shape (so counts and classifications
 * survive) while guaranteeing no offending value reaches a file.
 */
function scrubContaminated<T>(value: T, pathCtx: { root: string; home?: string }): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const contaminated = scanSecrets(v).length > 0 || rawPathLeak(v, pathCtx) !== null;
      return contaminated ? "[redacted]" : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** The raw-path leak kinds present in `text`, or null when clean. */
function rawPathLeak(text: string, ctx: { root: string; home?: string }): string | null {
  const leaks: string[] = [];
  if (ctx.root && ctx.root.length > 1 && text.includes(ctx.root)) leaks.push("repo root");
  if (ctx.home && ctx.home.length > 1 && text.includes(ctx.home)) leaks.push("home dir");
  if (RAW_USER_PATH_RE.test(text)) leaks.push("user path");
  return leaks.length ? leaks.join(", ") : null;
}

interface DroppedSection {
  category: string;
  patterns: string[];
}

/**
 * Verify every serialized file; return the clean ones plus a record of any
 * section dropped for failing verification. A `RedactionLeakError` or a raw
 * path is caught here rather than propagated — the caller turns each into an
 * omission, so the bundle still builds.
 */
function verifySections(
  files: SupportBundleFile[],
  pathCtx: { root: string; home?: string },
): { files: SupportBundleFile[]; dropped: DroppedSection[] } {
  const clean: SupportBundleFile[] = [];
  const dropped: DroppedSection[] = [];
  for (const file of files) {
    try {
      assertRedacted(file.content, file.path);
      assertNoRawPaths(file.content, pathCtx, file.path);
      clean.push(file);
    } catch (e) {
      const patterns = e instanceof RedactionLeakError ? e.patterns : ["an unsanitized path"];
      dropped.push({ category: file.category, patterns });
    }
  }
  return { files: clean, dropped };
}

function safeCpus(): number {
  try {
    return cpus().length;
  } catch {
    return 0;
  }
}

function safeMemory(): number {
  try {
    return totalmem();
  } catch {
    return 0;
  }
}

/** Recursively redact + minimize every string in the report. */
function sanitizeReport(
  report: SupportReport,
  ctx: { root: string; home?: string },
): SupportReport {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return sanitizePathText(redactText(value), ctx);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  // redactValue handles structured secret-key fields; sanitizeReport then
  // minimizes paths in whatever strings remain.
  return redactValue(walk(report)) as SupportReport;
}

/**
 * Any absolute path prefix that identifies a user, a home directory, or a
 * machine-specific temp dir. This MUST stay in step with the prefixes
 * `sanitizePathText` rewrites — a prefix it minimizes but this does not gate
 * can survive into a bundle unverified.
 */
const RAW_USER_PATH_RE =
  /\/(?:Users|home|private\/var\/folders|var\/folders)\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/;

/** Throw if a raw home directory, repo root or user/private path survived minimization. */
function assertNoRawPaths(text: string, ctx: { root: string; home?: string }, label: string): void {
  const leak = rawPathLeak(text, ctx);
  if (leak) {
    throw new Error(
      `refusing to write support bundle: ${label} still contains ${leak} after path minimization`,
    );
  }
}

// ── Files ───────────────────────────────────────────────────────────────────

function buildFiles(report: SupportReport): SupportBundleFile[] {
  const files: SupportBundleFile[] = [];

  files.push({
    path: "report.json",
    category: "report",
    description:
      "Versioned structured diagnostic report — the source of truth for every file below.",
    content: stringify(report),
  });
  files.push({
    path: "config-shape.json",
    category: "config",
    description:
      "Effective configuration shape and non-sensitive flags (secret values and free-form fields removed).",
    content: stringify(report.config),
  });
  files.push({
    path: "agents.json",
    category: "agents",
    description:
      "Coding-agent/tool detection summary: installed binaries and versions (paths excluded).",
    content: stringify(report.agents),
  });
  files.push({
    path: "check-plan.json",
    category: "gate",
    description:
      "Resolved `repoos check` plan: step names, sources and warnings (command text excluded).",
    content: stringify(report.checkPlan),
  });
  if (report.doctor) {
    files.push({
      path: "doctor.json",
      category: "doctor",
      description: "Sanitized `repoos doctor` readiness preflight findings (no credential values).",
      content: stringify(report.doctor),
    });
  }
  files.push({
    path: "build.json",
    category: "build",
    description: "RepoOS build/version staleness and platform/runtime versions.",
    content: stringify({ tool: report.tool, platform: report.platform, build: report.build }),
  });
  return files;
}

function buildManifest(
  report: SupportReport,
  files: SupportBundleFile[],
  pathFlags: { homeMinimized: boolean; repoRootMinimized: boolean },
): SupportManifest {
  // The path claims describe what actually happened, not what usually happens:
  // with no HOME in the environment there is no home directory to minimize, so
  // claiming it was would be misleading.
  const pathRules: string[] = [];
  if (pathFlags.homeMinimized) pathRules.push("Home directories minimized to ~");
  if (pathFlags.repoRootMinimized) pathRules.push("Repo root minimized to <repo>");
  pathRules.push("User-profile paths (/Users, /home, /private/var/folders) minimized to ~");
  return {
    schemaVersion: SUPPORT_BUNDLE_SCHEMA_VERSION,
    redactionVersion: REDACTION_VERSION,
    generatedAt: report.generatedAt,
    tool: report.tool,
    platform: report.platform,
    manifest: "manifest.json",
    files: files.map((f) => ({
      path: f.path,
      category: f.category,
      bytes: Buffer.byteLength(f.content, "utf8"),
      sha256: sha256(f.content),
      description: f.description,
    })),
    omitted: report.omissions,
    redaction: {
      version: REDACTION_VERSION,
      rules: [
        "Allowlist collection: only selected structured fields are read; files are never copied wholesale",
        "Known credential formats (API keys, tokens, bearer/basic auth, JWTs, private key blocks, URL credentials) replaced with [redacted]",
        "Sensitive key=value assignments and dotenv lines replaced with [redacted]",
        ...pathRules,
        "A final scan verifies no rule was missed; a miss aborts the bundle",
      ],
      paths: pathFlags,
    },
  };
}

// ── Packaging (dependency-free tar.gz) ──────────────────────────────────────

interface TarEntry {
  name: string;
  data: Buffer;
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "binary");
  header.write("0000000\0", 108, 8, "binary");
  header.write("0000000\0", 116, 8, "binary");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "binary");
  header.write("00000000000\0", 136, 12, "binary");
  header.write("        ", 148, 8, "binary"); // checksum placeholder
  header.write("0", 156, 1, "binary");
  header.write("ustar\0", 257, 6, "binary");
  header.write("00", 263, 2, "binary");
  let sum = 0;
  for (const b of header) sum += b;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "binary");
  return header;
}

/** Deterministic, dependency-free tar.gz. `mtime` is pinned to 0. */
export function packageTarGz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const { name, data } of entries) {
    parts.push(tarHeader(name, data.length));
    parts.push(data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

export interface ArchiveEntry {
  path: string;
  size: number;
  content: Buffer;
}

/** Read a tar.gz produced by {@link packageTarGz}; for `repoos support inspect`. */
export function readTarGz(buffer: Buffer): ArchiveEntry[] {
  const tar = gunzipSync(buffer);
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeText = header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText, 8) || 0;
    const content = Buffer.from(tar.subarray(offset + 512, offset + 512 + size));
    entries.push({ path: name, size, content });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

/** Serialize the bundle to a single `.tar.gz` buffer. */
export function serializeSupportBundle(bundle: SupportBundle): Buffer {
  const entries: TarEntry[] = bundle.files.map((f) => ({
    name: f.path,
    data: Buffer.from(f.content, "utf8"),
  }));
  entries.push({
    name: "manifest.json",
    data: Buffer.from(stringify(bundle.manifest), "utf8"),
  });
  return packageTarGz(entries);
}

/** Default archive path: `<root>/<cacheDir>/support/repoos-support-<ts>.tar.gz`. */
export function defaultBundlePath(root: string, cacheDir: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return join(root, cacheDir, "support", `repoos-support-${stamp}.tar.gz`);
}

/** Whether `outPath` is inside `root` (i.e. could be picked up by git). */
function isInside(outPath: string, root: string): boolean {
  const rel = relative(root, outPath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Lines of `.gitignore` at `root`, if any. */
function gitignorePatterns(root: string): string[] {
  try {
    const text = readFileSync(join(root, ".gitignore"), "utf8");
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * A warning when writing the default bundle path could commit the artifact:
 * the archive lands inside the repo, and the segment it lives under is not
 * covered by `.gitignore`. Returns null when the target is outside the repo or
 * already ignored — the safe cases.
 */
export function bundlePathWarning(outPath: string, root: string): string | null {
  if (!isInside(outPath, root)) return null;
  const rel = relative(root, outPath).split("\\").join("/");
  const first = rel.split("/")[0];
  const ignored = gitignorePatterns(root).some((raw) => {
    const pat = raw.replace(/^\/+/, "").replace(/\/+$/, "");
    return pat === first || pat === rel || pat.startsWith(`${first}/`);
  });
  if (ignored) return null;
  return (
    `the bundle is written inside the repo at ${rel} and that path is not in .gitignore — ` +
    `the archive could be committed. Use --out to write it elsewhere, or add ${first}/ to .gitignore.`
  );
}

/** Write the archive to `outPath`, creating parent directories. */
export function writeSupportBundle(
  bundle: SupportBundle,
  outPath: string,
): { path: string; bytes: number } {
  const buffer = serializeSupportBundle(bundle);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  return { path: outPath, bytes: buffer.length };
}

/** List the bundled file paths without extracting contents. */
export function enumerateBundleFiles(bundle: SupportBundle): string[] {
  return [...bundle.files.map((f) => f.path), "manifest.json"];
}

/** Read and parse the manifest from an existing archive. */
export function readBundleManifest(archivePath: string): SupportManifest {
  const entries = readTarGz(readFileSync(archivePath));
  const manifest = entries.find((e) => e.path === "manifest.json");
  if (!manifest) throw new Error(`${basename(archivePath)} has no manifest.json`);
  return JSON.parse(manifest.content.toString("utf8")) as SupportManifest;
}
