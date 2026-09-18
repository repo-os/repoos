/**
 * Built-in agents: pre-configured agents like Tech Debt Agent that extend RepoOS.
 * These agents are triggered on-demand or on a schedule.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, accessSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import type { BuiltInAgentConfig, RepoOSConfig } from "../core/types.js";
import { saveBuiltInAgentsConfig } from "../core/config.js";
import { commitTaskFile } from "../core/git.js";
import type { Logger } from "../core/logger.js";
import {
  runSkillGuidedAgent,
  saveLastRunAt,
  type SkillGuidedFinding,
  type SkillGuidedRunResult,
} from "./built-in-agent-runner.js";
import {
  ARCHITECTURE_SKILL_DOC,
  PERFORMANCE_SKILL_DOC,
  TECH_DEBT_SKILL_DOC,
} from "./built-in-agent-skill-docs.js";
import { isSafeToAutoCommit } from "./auto-fix-gate.js";

export type TechDebtIssueType =
  | "outdated-dependency"
  | "code-duplication"
  | "high-complexity"
  | "unused-code"
  | "deprecated-api";

export interface TechDebtIssue {
  type: TechDebtIssueType;
  file: string;
  line?: number;
  description: string;
  severity: "high" | "medium" | "low";
}

export type PerformanceIssueType =
  | "slow-function"
  | "blocking-operation"
  | "unbounded-growth"
  | "duplicated-computation";

export interface PerformanceIssue {
  type: PerformanceIssueType;
  file: string;
  line?: number;
  description: string;
  severity: "high" | "medium" | "low";
}

/** Options that let tests drive the scan deterministically (no network). */
export interface TechDebtScanOptions {
  /** Registry fetcher, defaults to the global fetch. Tests stub this. */
  fetchImpl?: typeof fetch;
}

export interface TechDebtScanResult {
  issues: TechDebtIssue[];
  /** Number of files actually read (bounded by the scan cap). */
  scannedFiles: number;
  /** Number of dependencies compared against the registry (best-effort). */
  checkedDependencies: number;
}

export interface CreateTechDebtResult {
  /** Tasks successfully written to the inbox. */
  created: number;
  /** Individual writes that failed (after the work dir was confirmed usable). */
  failed: number;
  /** Human-readable messages for every failed write. */
  errors: string[];
}

export interface TechDebtRunResult extends CreateTechDebtResult {
  issuesFound: number;
  scannedFiles: number;
}

/** Raised when the Tech Debt Agent cannot do its job at all (e.g. missing work dir). */
export class TechDebtError extends Error {}

export interface CreatePerformanceResult {
  /** Tasks successfully written to the inbox. */
  created: number;
  /** Individual writes that failed (after the work dir was confirmed usable). */
  failed: number;
  /** Human-readable messages for every failed write. */
  errors: string[];
}

export interface PerformanceRunResult extends CreatePerformanceResult {
  issuesFound: number;
  scannedFiles: number;
}

/** Raised when the Performance Agent cannot do its job at all (e.g. missing work dir). */
export class PerformanceError extends Error {}

export type ArchitectureIssueType =
  | "layer-violation"
  | "tight-coupling"
  | "missing-abstraction"
  | "over-engineering"
  | "scalability-risk";

export interface ArchitectureIssue {
  type: ArchitectureIssueType;
  file?: string;
  line?: number;
  description: string;
  severity: "high" | "medium" | "low";
  recommendation?: string;
}

export interface ArchitectureScanResult {
  issues: ArchitectureIssue[];
  scannedFiles: number;
  taskCount: number;
  insights: string[];
}

export interface ArchitectRunResult {
  reportPath: string;
  fileName: string;
  issuesFound: number;
  scannedFiles: number;
  taskCount: number;
  created: number;
  failed: number;
  errors: string[];
}

export class ArchitectureError extends Error {}

export type DesignFindingCategory = "ui-bug" | "ux-friction" | "design-recommendation";

export interface DesignFinding {
  category: DesignFindingCategory;
  file: string;
  line?: number;
  /** What stands out, phrased as the concrete observation. */
  description: string;
  /** Why this matters, grounded in a UI/UX best practice. */
  rationale: string;
  /** A concrete, actionable suggestion referencing the file/component. */
  recommendation: string;
  severity: "high" | "medium" | "low";
}

export interface DesignScanResult {
  findings: DesignFinding[];
  scannedFiles: number;
  insights: string[];
}

export interface DesignRunResult {
  reportPath: string;
  fileName: string;
  findingsFound: number;
  scannedFiles: number;
  created: number;
  failed: number;
  errors: string[];
}

export class DesignError extends Error {}

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".nuxt", ".repoos"]);
/** Scan is bounded so a huge repo can never stall the server. */
const MAX_SCAN_FILES = 400;
const MAX_FILE_BYTES = 400_000;
const HIGH_COMPLEXITY_LINES = 500;
const DUPLICATION_WINDOW = 6;
const MAX_DUPLICATION_ISSUES = 20;
const MAX_UNUSED_ISSUES = 10;
const MIN_EXPORT_NAME_LENGTH = 3;
/** Registry probes are bounded and best-effort: offline is never fatal. */
const MAX_REGISTRY_PROBES = 12;
const REGISTRY_CONCURRENCY = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Docs Debt Agent bounds (#0354): a periodic sweep, never an unbounded crawl. */
const MAX_DOCS = 120;
const MAX_DOC_BYTES = 300_000;
/** At most this many mechanical doc fixes land per run; the rest become a task. */
export const MAX_TRIVIAL_FIXES_PER_RUN = 5;

/** Walk the repo for scannable source files, bounded in count and size. */
function collectSourceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string, relPrefix: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (files.length >= MAX_SCAN_FILES) return;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        walk(abs, relPrefix ? `${relPrefix}/${name}` : name);
      } else if (st.isFile() && SOURCE_EXTS.has(extname(name)) && st.size <= MAX_FILE_BYTES) {
        files.push(abs);
      }
    }
  };
  walk(root, "");
  return files;
}

interface ScannedFile {
  rel: string;
  content: string;
  lineCount: number;
}

function readScannedFiles(root: string, files: string[]): ScannedFile[] {
  const out: ScannedFile[] = [];
  for (const abs of files) {
    try {
      const content = readFileSync(abs, "utf8");
      out.push({
        rel: abs.slice(root.length).replace(/^[/\\]/, "") || abs,
        content,
        lineCount: content.split("\n").length,
      });
    } catch {
      // Skip unreadable files
    }
  }
  return out;
}

function findLineAt(content: string, index: number): number {
  let line = 1;
  const end = Math.min(index, content.length);
  for (let i = 0; i < end; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

/**
 * Replace comments and string literals with whitespace (preserving newlines)
 * so later regexes never match code that only mentions a pattern. The returned
 * string is the same length as the input, so indexes map 1:1 to the original.
 */
export function stripCommentsAndStrings(source: string): string {
  const chars = source.split("");
  const n = chars.length;
  const blank = (start: number, end: number): void => {
    for (let j = start; j < end && j < n; j++) {
      chars[j] = chars[j] === "\n" ? "\n" : " ";
    }
  };
  let i = 0;
  while (i < n) {
    const c = chars[i];
    if (c === "/" && chars[i + 1] === "/") {
      let end = i + 2;
      while (end < n && chars[end] !== "\n") end++;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "/" && chars[i + 1] === "*") {
      let end = source.indexOf("*/", i + 2);
      end = end === -1 ? n : end + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let end = i + 1;
      while (end < n && chars[end] !== quote) {
        if (chars[end] === "\\") end++;
        end++;
      }
      end = end < n ? end + 1 : end;
      blank(i, end);
      i = end;
      continue;
    }
    i++;
  }
  return chars.join("");
}

/** Map a "1.2.3", "^1.2.3", "~1.2.3", ">=1.0.0"… specifier to its major number. */
function parseMajor(spec: string): number | null {
  const match = spec.match(/(\d+)/);
  if (!match) return null;
  const major = Number(match[1]);
  return Number.isInteger(major) ? major : null;
}

async function fetchLatestVersion(name: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function checkOutdatedDependencies(
  config: RepoOSConfig,
  fetchImpl: typeof fetch,
): Promise<{ issues: TechDebtIssue[]; checked: number }> {
  const issues: TechDebtIssue[] = [];
  const packageJsonPath = join(config.root, "package.json");
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  } catch {
    // File doesn't exist or isn't valid JSON — nothing to check.
    return { issues, checked: 0 };
  }

  const raw = {
    ...(typeof pkg.dependencies === "object" && pkg.dependencies !== null
      ? (pkg.dependencies as Record<string, unknown>)
      : {}),
    ...(typeof pkg.devDependencies === "object" && pkg.devDependencies !== null
      ? (pkg.devDependencies as Record<string, unknown>)
      : {}),
  };

  // Pre-release/wildcard pins are always suspicious, independent of the registry.
  for (const [name, version] of Object.entries(raw)) {
    const versionStr = String(version);
    if (versionStr.includes("alpha") || versionStr.includes("beta") || versionStr.includes("*")) {
      issues.push({
        type: "outdated-dependency",
        file: "package.json",
        description: `Dependency "${name}" uses pre-release or wildcard version: ${versionStr}`,
        severity: "medium",
      });
    }
  }

  // Compare exact/range pins against the registry's latest, best-effort and
  // bounded (offline registries or slow networks must never block the scan).
  const candidates = Object.entries(raw)
    .filter(([, version]) => {
      const s = String(version);
      return (
        !s.includes("alpha") && !s.includes("beta") && !s.includes("*") && parseMajor(s) !== null
      );
    })
    .slice(0, MAX_REGISTRY_PROBES);

  const results = await mapLimit(candidates, REGISTRY_CONCURRENCY, async ([name, version]) => {
    const latest = await fetchLatestVersion(name, fetchImpl);
    return { name, version: String(version), latest };
  });

  let checked = 0;
  for (const { name, version, latest } of results) {
    if (!latest) continue;
    checked++;
    const installed = parseMajor(version);
    const remote = parseMajor(latest);
    if (installed === null || remote === null || remote <= installed) continue;
    issues.push({
      type: "outdated-dependency",
      file: "package.json",
      description: `Dependency "${name}" is outdated: installed ${version}, latest is ${latest}`,
      severity: remote - installed >= 2 ? "high" : "medium",
    });
  }

  return { issues, checked };
}

/**
 * Scan the repository for tech debt patterns.
 * Returns the identified issues plus scan bounds, so callers can tell a
 * successful-but-empty scan apart from a failed one.
 */
export async function scanForTechDebt(
  config: RepoOSConfig,
  options: TechDebtScanOptions = {},
): Promise<TechDebtScanResult> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const issues: TechDebtIssue[] = [];

  const depCheck = await checkOutdatedDependencies(config, fetchImpl);
  issues.push(...depCheck.issues);

  const files = collectSourceFiles(config.root);
  const scanned = readScannedFiles(config.root, files);

  // Per-file notes: duplication windows and exported identifiers.
  interface WindowLoc {
    file: string;
    line: number;
  }
  const windowMap = new Map<string, WindowLoc[]>();
  interface ExportDecl {
    name: string;
    file: string;
    line: number;
  }
  const exported: ExportDecl[] = [];
  const EXPORT_PATTERNS: RegExp[] = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:declare\s+)?const\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:declare\s+)?let\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:declare\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g,
  ];

  for (const file of scanned) {
    // 1. High-complexity (simple heuristic: very long files).
    if (file.lineCount > HIGH_COMPLEXITY_LINES) {
      issues.push({
        type: "high-complexity",
        file: file.rel,
        line: 1,
        description: `File has ${file.lineCount} lines of code — consider breaking it into smaller modules`,
        severity: "medium",
      });
    }

    // 2. Deprecated patterns: 'var' declarations, matched on comment/string-free code.
    const cleaned = stripCommentsAndStrings(file.content);
    const varRe = /\bvar\s+[A-Za-z_$][\w$]*/g;
    let m: RegExpExecArray | null;
    while ((m = varRe.exec(cleaned)) !== null) {
      issues.push({
        type: "deprecated-api",
        file: file.rel,
        line: findLineAt(file.content, m.index),
        description: "File uses 'var' declarations — modernize to 'const' or 'let'",
        severity: "low",
      });
    }

    // 3. Duplication windows: identical blocks of >=6 non-blank lines.
    const lines = file.content.split("\n");
    const blocks: { text: string; line: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].trim();
      if (text) blocks.push({ text, line: i + 1 });
    }
    if (blocks.length >= DUPLICATION_WINDOW) {
      for (let i = 0; i + DUPLICATION_WINDOW <= blocks.length; i++) {
        let key = "";
        for (let j = 0; j < DUPLICATION_WINDOW; j++) {
          key += (j === 0 ? "" : "\u0000") + blocks[i + j].text;
        }
        const locs = windowMap.get(key);
        const loc: WindowLoc = { file: file.rel, line: blocks[i].line };
        if (locs) locs.push(loc);
        else windowMap.set(key, [loc]);
      }
    }

    // 4. Exported identifiers (for the unused-code check).
    for (const re of EXPORT_PATTERNS) {
      let em: RegExpExecArray | null;
      while ((em = re.exec(file.content)) !== null) {
        exported.push({ name: em[1], file: file.rel, line: findLineAt(file.content, em.index) });
      }
    }
  }

  // Cross-file duplication: a block that appears in >=2 different files.
  let dupCount = 0;
  for (const [key, locs] of windowMap) {
    if (dupCount >= MAX_DUPLICATION_ISSUES) break;
    if (locs.length < 2) continue;
    const filesInvolved = new Set(locs.map((l) => l.file));
    if (filesInvolved.size < 2) continue;
    const primary = locs[0];
    const duplicatedIn = locs
      .slice(1)
      .filter((l) => l.file !== primary.file)
      .map((l) => `\`${l.file}\`:${l.line}`)
      .slice(0, 3)
      .join(", ");
    const parts = key.split("\u0000");
    const snippet = parts.slice(0, 3).join(" | ");
    issues.push({
      type: "code-duplication",
      file: primary.file,
      line: primary.line,
      description: `Identical ${DUPLICATION_WINDOW}-line block also found in ${duplicatedIn} — extract it into a shared helper ("${snippet}${parts.length > 3 ? "…" : ""}")`,
      severity: "low",
    });
    dupCount++;
  }

  // Unused exports: an exported identifier that no other file references.
  let unusedCount = 0;
  for (const decl of exported) {
    if (unusedCount >= MAX_UNUSED_ISSUES) break;
    if (decl.name.length < MIN_EXPORT_NAME_LENGTH) continue;
    const nameRe = new RegExp(`\\b${decl.name}\\b`);
    const referencedElsewhere = scanned.some((f) => f.rel !== decl.file && nameRe.test(f.content));
    if (referencedElsewhere) continue;
    issues.push({
      type: "unused-code",
      file: decl.file,
      line: decl.line,
      description: `Exported "${decl.name}" is never referenced by any other file — consider removing it`,
      severity: "low",
    });
    unusedCount++;
  }

  return { issues, scannedFiles: scanned.length, checkedDependencies: depCheck.checked };
}

/**
 * Create tasks in the inbox for tech debt issues.
 * Returns counts for created and failed writes, so callers never see a
 * silently-truncated task list. Throws TechDebtError when the work dir itself
 * is unusable (missing or read-only) — the caller surfaces that to the user.
 */
export async function createTechDebtTasks(
  config: RepoOSConfig,
  issues: TechDebtIssue[],
): Promise<CreateTechDebtResult> {
  const workDir = join(config.root, config.workDir);
  let workDirStats;
  try {
    workDirStats = statSync(workDir);
  } catch {
    throw new TechDebtError(
      `Task directory "${config.workDir}" does not exist — create it (or fix workDir) before running the Tech Debt Agent`,
    );
  }
  if (!workDirStats.isDirectory()) {
    throw new TechDebtError(`Task directory "${config.workDir}" is not a directory`);
  }
  try {
    accessSync(workDir, 0o2 /* W_OK */);
  } catch {
    throw new TechDebtError(`Task directory "${config.workDir}" is not writable`);
  }

  const result: CreateTechDebtResult = { created: 0, failed: 0, errors: [] };

  if (issues.length === 0) return result;

  // Group issues by type for cleaner task creation.
  const grouped = new Map<TechDebtIssueType, TechDebtIssue[]>();
  for (const issue of issues) {
    if (!grouped.has(issue.type)) grouped.set(issue.type, []);
    grouped.get(issue.type)!.push(issue);
  }

  const now = new Date().toISOString();

  for (const [type, typeIssues] of grouped) {
    const title = getTitleForIssueType(type);
    const body = formatIssuesForTask(typeIssues);

    const taskId = findNextTaskId(workDir);
    const taskPath = join(workDir, `${taskId}-${slugify(title)}.md`);

    // The title is JSON-stringified: it always survives YAML parsing, even with
    // colons, quotes, or other metacharacters.
    const frontmatter = `---
id: "${taskId}"
title: ${JSON.stringify(title)}
type: chore
status: inbox
priority: p2
area: tech-debt
assigned_to: unassigned
created_by: tech-debt-agent
created_at: "${now}"
updated_at: "${now}"
---`;

    const taskContent = `${frontmatter}\n${body}`;

    try {
      await writeFile(taskPath, taskContent, "utf8");
      result.created++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${taskPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Whether a built-in agent is due for a scheduled run right now. Manual-only
 * agents never auto-run; a never-run enabled agent is due immediately.
 */
export function isDueForScheduledRun(
  state: BuiltInAgentConfig | undefined,
  now: Date = new Date(),
): boolean {
  if (!state?.enabled) return false;
  if (state.schedule === "manual" || state.schedule === undefined) return false;
  if (!state.lastRunAt) return true;
  const last = Date.parse(state.lastRunAt);
  if (Number.isNaN(last)) return true;
  if (state.schedule === "daily") {
    const lastD = new Date(last);
    return (
      lastD.getUTCFullYear() !== now.getUTCFullYear() ||
      lastD.getUTCMonth() !== now.getUTCMonth() ||
      lastD.getUTCDate() !== now.getUTCDate()
    );
  }
  return now.getTime() - last >= WEEK_MS;
}

/**
 * Create tasks in the inbox for performance issues.
 * Returns counts for created and failed writes, so callers never see a
 * silently-truncated task list. Throws PerformanceError when the work dir itself
 * is unusable (missing or read-only).
 */
export async function createPerformanceTasks(
  config: RepoOSConfig,
  issues: PerformanceIssue[],
): Promise<CreatePerformanceResult> {
  const workDir = join(config.root, config.workDir);
  let workDirStats;
  try {
    workDirStats = statSync(workDir);
  } catch {
    throw new PerformanceError(
      `Task directory "${config.workDir}" does not exist — create it (or fix workDir) before running the Performance Agent`,
    );
  }
  if (!workDirStats.isDirectory()) {
    throw new PerformanceError(`Task directory "${config.workDir}" is not a directory`);
  }
  try {
    accessSync(workDir, 0o2 /* W_OK */);
  } catch {
    throw new PerformanceError(`Task directory "${config.workDir}" is not writable`);
  }

  const result: CreatePerformanceResult = { created: 0, failed: 0, errors: [] };

  if (issues.length === 0) return result;

  // Group issues by type for cleaner task creation.
  const grouped = new Map<PerformanceIssueType, PerformanceIssue[]>();
  for (const issue of issues) {
    if (!grouped.has(issue.type)) grouped.set(issue.type, []);
    grouped.get(issue.type)!.push(issue);
  }

  const now = new Date().toISOString();

  for (const [type, typeIssues] of grouped) {
    const title = getTitleForPerformanceIssueType(type);
    const body = formatPerformanceIssuesForTask(typeIssues);

    const taskId = findNextTaskId(workDir);
    const taskPath = join(workDir, `${taskId}-${slugify(title)}.md`);

    const frontmatter = `---
id: "${taskId}"
title: ${JSON.stringify(title)}
type: chore
status: inbox
priority: p2
area: performance
assigned_to: unassigned
created_by: performance-agent
created_at: "${now}"
updated_at: "${now}"
---`;

    const taskContent = `${frontmatter}\n${body}`;

    try {
      await writeFile(taskPath, taskContent, "utf8");
      result.created++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${taskPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Run the Tech Debt Agent end to end: scan, create tasks, record lastRunAt.
 * The caller owns overlap protection (a single in-flight guard in server.ts).
 */
function toTechDebtIssues(findings: SkillGuidedFinding[]): TechDebtIssue[] {
  return findings.map((finding) => ({
    type: normalizeTechDebtIssueType(finding.type),
    file: finding.file ?? "(repository)",
    line: finding.line,
    description: finding.description || "Tech debt issue reported by the agent",
    severity: finding.severity,
  }));
}

export function normalizeTechDebtIssueType(type: string): TechDebtIssueType {
  const validTypes: TechDebtIssueType[] = [
    "outdated-dependency",
    "code-duplication",
    "high-complexity",
    "unused-code",
    "deprecated-api",
  ];
  if (validTypes.includes(type as TechDebtIssueType)) return type as TechDebtIssueType;
  // Keyword fallback for a non-canonical label (mirrors
  // normalizePerformanceIssueType) — bucket by what the label actually
  // describes instead of always defaulting to "unused-code", which used to
  // misfile e.g. a "stale-dependency" finding under "Remove unused code".
  const t = type.toLowerCase();
  if (/(depend|package|version|outdated|upgrade)/.test(t)) return "outdated-dependency";
  if (/(duplicat|copy-paste|repeat)/.test(t)) return "code-duplication";
  if (/(complex|nested|cyclomatic|long-function|god-)/.test(t)) return "high-complexity";
  if (/(deprecat|legacy-api|obsolete)/.test(t)) return "deprecated-api";
  return "unused-code";
}

/**
 * Run the Tech Debt Agent end to end through the shared skill-guided runner:
 * the configured CLI/model reviews the repo (in whatever language it uses) for
 * technical debt, findings become deduplicated inbox tasks, and lastRunAt
 * is recorded.
 *
 * Replaces the old `SOURCE_EXTS`-filtered deterministic scan, which silently
 * matched zero files in any non-JS/TS project. The caller owns overlap
 * protection (a single in-flight guard in server.ts).
 *
 * A model/connector failure throws {@link TechDebtError} with the agent
 * named, so the run route surfaces it on this agent's own settings card rather
 * than silently reporting "no issues found".
 */
export async function runTechDebtAgent(
  config: RepoOSConfig,
  options: TechDebtScanOptions = {},
  logger?: Logger,
): Promise<TechDebtRunResult> {
  const run = await runSkillGuidedAgent(
    "tech-debt",
    config,
    TECH_DEBT_SKILL_DOC,
    "src/server/built-in-agent-skill-docs.ts",
    logger,
  );

  if (!run.ok) {
    const message = run.error ?? "Tech Debt Agent run failed";
    logger?.agent("tech-debt", "error", message);
    throw new TechDebtError(message);
  }

  const issues = toTechDebtIssues(run.findings);
  logger?.agent("tech-debt", "info", "Tech debt review completed", {
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
  });

  const created = await createTechDebtTasks(config, issues);
  if (created.failed > 0) {
    logger?.agent("tech-debt", "error", `Failed to create ${created.failed} tech debt task(s)`, {
      errors: created.errors,
    });
  }
  if (created.created > 0) {
    logger?.agent("tech-debt", "info", `Created ${created.created} tech debt task(s)`);
  }

  saveLastRunAt(config.root, "tech-debt", config);

  return {
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
    ...created,
  };
}

/**
 * Normalize a skill-guided finding type to the Performance agent's canonical
 * issue types. The skill doc asks the model to use one of the four, but an
 * unexpected label must never drop a real finding or misfile it into the wrong
 * task bucket.
 */
export function normalizePerformanceIssueType(type: string): PerformanceIssueType {
  switch (type) {
    case "slow-function":
    case "blocking-operation":
    case "unbounded-growth":
    case "duplicated-computation":
      return type;
    default: {
      const t = type.toLowerCase();
      if (/(unbounded|memory|leak|growth|accumulat)/.test(t)) return "unbounded-growth";
      if (/(nested|block|loop|sync|io|await|contention|scan)/.test(t)) return "blocking-operation";
      if (/(duplicat|recomput|redundant|cache|memo)/.test(t)) return "duplicated-computation";
      return "slow-function";
    }
  }
}

/** Convert the shared runner's findings into the Performance agent's issue shape. */
function toPerformanceIssues(findings: SkillGuidedFinding[]): PerformanceIssue[] {
  return findings.map((finding) => ({
    type: normalizePerformanceIssueType(finding.type),
    file: finding.file ?? "(repository)",
    line: finding.line,
    description: finding.description || "Performance issue reported by the agent",
    severity: finding.severity,
  }));
}

/**
 * Normalize a skill-guided finding type to the Architect agent's canonical
 * issue types. The skill doc asks the model to use one of the five, but an
 * unexpected label must never drop a real finding or misfile it into the wrong
 * bucket.
 */
export function normalizeArchitectureIssueType(type: string): ArchitectureIssueType {
  switch (type) {
    case "layer-violation":
    case "tight-coupling":
    case "missing-abstraction":
    case "over-engineering":
    case "scalability-risk":
      return type;
    default: {
      const t = type.toLowerCase();
      // Checked before the broader "missing-abstraction" match below, which
      // would otherwise catch "over-abstraction" too (it contains the
      // substring "abstraction") and misfile it into the opposite category.
      if (/over[- ]?abstract/.test(t)) return "over-engineering";
      if (/(layer|violation|boundary|circular|depend.*wrong)/.test(t)) return "layer-violation";
      if (/(coupl|depend|import|god|orchestrat|hard.?cod)/.test(t)) return "tight-coupling";
      if (/(abstraction|duplicat|scattered|repeated|missing.*boundar)/.test(t))
        return "missing-abstraction";
      if (/(over.?engineer|abstrac|indirect|framework|factory|premature)/.test(t))
        return "over-engineering";
      return "scalability-risk";
    }
  }
}

/** Convert the shared runner's findings into the Architect agent's issue shape. */
function toArchitectureIssues(findings: SkillGuidedFinding[]): ArchitectureIssue[] {
  return findings.map((finding) => ({
    type: normalizeArchitectureIssueType(finding.type),
    file: finding.file ?? "(repository)",
    line: finding.line,
    description: finding.description || "Architecture issue reported by the agent",
    severity: finding.severity,
    recommendation: finding.recommendation,
  }));
}

/**
 * Run the Performance Agent end to end through the shared skill-guided runner:
 * the configured CLI/model reviews the repo (in whatever language it uses) for
 * performance issues, findings become deduplicated inbox tasks, and lastRunAt
 * is recorded.
 *
 * Replaces the old `SOURCE_EXTS`-filtered deterministic scan, which silently
 * matched zero files in any non-JS/TS project. The caller owns overlap
 * protection (a single in-flight guard in server.ts).
 *
 * A model/connector failure throws {@link PerformanceError} with the agent
 * named, so the run route surfaces it on this agent's own settings card rather
 * than silently reporting "no issues found".
 */
export async function runPerformanceAgent(
  config: RepoOSConfig,
  logger?: Logger,
): Promise<PerformanceRunResult> {
  const run = await runSkillGuidedAgent(
    "performance",
    config,
    PERFORMANCE_SKILL_DOC,
    "src/server/built-in-agent-skill-docs.ts",
    logger,
  );

  if (!run.ok) {
    const message = run.error ?? "Performance Agent run failed";
    logger?.agent("performance", "error", message);
    throw new PerformanceError(message);
  }

  const issues = toPerformanceIssues(run.findings);
  logger?.agent("performance", "info", "Performance review completed", {
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
  });

  const created = await createPerformanceTasks(config, issues);
  if (created.failed > 0) {
    logger?.agent(
      "performance",
      "error",
      `Failed to create ${created.failed} performance task(s)`,
      {
        errors: created.errors,
      },
    );
  }
  if (created.created > 0) {
    logger?.agent("performance", "info", `Created ${created.created} performance task(s)`);
  }

  saveLastRunAt(config.root, "performance", config);

  return {
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
    ...created,
  };
}

/**
 * Generate a markdown architecture report and save it with a timestamp.
 */
export async function generateArchitectureReport(
  config: RepoOSConfig,
  scan: ArchitectureScanResult,
): Promise<{ reportPath: string; fileName: string }> {
  const reportDir = join(config.root, "docs", "agents", "Architect");
  mkdirSync(reportDir, { recursive: true });

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const fileName = `Architect_report_${ts}.md`;
  const reportPath = join(reportDir, fileName);

  let report = `# Architecture Review Report\n\n`;
  report += `**Generated**: ${now.toISOString()}\n\n`;
  report += `## Executive Summary\n\n`;
  report += `- **Files Scanned**: ${scan.scannedFiles}\n`;
  report += `- **Tasks in Backlog**: ${scan.taskCount}\n`;
  report += `- **Issues Identified**: ${scan.issues.length}\n\n`;

  if (scan.insights.length > 0) {
    report += `## Key Insights\n\n`;
    for (const insight of scan.insights) report += `- ${insight}\n`;
    report += `\n`;
  }

  if (scan.issues.length > 0) {
    report += `## Architecture Issues & Risks\n\n`;
    for (const sev of ["high", "medium", "low"] as const) {
      const filtered = scan.issues.filter((i) => i.severity === sev);
      if (filtered.length === 0) continue;
      report += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
      for (const issue of filtered) {
        report += `**${issue.type}**: ${issue.description}\n`;
        if (issue.file) report += `- File: \`${issue.file}\`\n`;
        if (issue.line) report += `- Line: ${issue.line}\n`;
        if (issue.recommendation) report += `- **Recommendation**: ${issue.recommendation}\n`;
        report += `\n`;
      }
    }
  } else {
    report += `## Architecture Assessment\n\n`;
    report += `No significant architectural issues detected.\n\n`;
  }

  report += `## Recommendations\n\n`;
  report += `1. Schedule periodic architecture reviews (quarterly) to track progress.\n`;
  report += `2. Maintain an up-to-date architecture document reflecting actual system design.\n`;
  if (scan.issues.some((i) => i.severity === "high"))
    report += `3. Address high-severity issues first.\n`;
  if (scan.issues.some((i) => i.type === "tight-coupling"))
    report += `4. Implement dependency injection and clear module boundaries to reduce tight coupling.\n`;
  if (scan.issues.some((i) => i.type === "scalability-risk"))
    report += `5. Plan refactoring for large modules that may become bottlenecks.\n`;
  report += `\n## Next Steps\n\n`;
  report += `- Review this report with the team\n`;
  report += `- Create tasks for addressing identified issues\n`;
  report += `- Track progress through subsequent reports\n`;

  await writeFile(reportPath, report, "utf8");
  return { reportPath, fileName };
}

/**
 * Run the Architect Agent end to end through the shared skill-guided runner:
 * the configured CLI/model reviews the repo (in whatever language it uses) for
 * architecture issues, findings become a markdown report saved to
 * `docs/agents/Architect/`, and lastRunAt is recorded.
 *
 * Replaces the old `SOURCE_EXTS`-filtered deterministic scan, which silently
 * matched zero files in any non-JS/TS project. The caller owns overlap
 * protection (a single in-flight guard in server.ts).
 *
 * A model/connector failure throws {@link ArchitectureError} with the agent
 * named, so the run route surfaces it on this agent's own settings card rather
 * than silently reporting "no issues found".
 */
export async function runArchitectAgent(
  config: RepoOSConfig,
  logger?: Logger,
): Promise<ArchitectRunResult> {
  const run = await runSkillGuidedAgent(
    "architect",
    config,
    ARCHITECTURE_SKILL_DOC,
    "src/server/built-in-agent-skill-docs.ts",
    logger,
  );

  if (!run.ok) {
    const message = run.error ?? "Architect Agent run failed";
    throw new ArchitectureError(message);
  }

  const issues = toArchitectureIssues(run.findings);

  const workDir = join(config.root, config.workDir);
  let taskCount = 0;
  try {
    const taskFiles = readdirSync(workDir);
    taskCount = taskFiles.filter((f) => f.endsWith(".md")).length;
  } catch {
    /* work directory might not exist */
  }

  const insights: string[] = [];
  if (run.scannedFiles && run.scannedFiles > 0) {
    insights.push(`Analyzed ${run.scannedFiles} source files.`);
  }

  const scan: ArchitectureScanResult = {
    issues,
    scannedFiles: run.scannedFiles ?? 0,
    taskCount,
    insights,
  };
  const report = await generateArchitectureReport(config, scan);

  saveLastRunAt(config.root, "architect", config);

  return {
    reportPath: report.reportPath,
    fileName: report.fileName,
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
    taskCount,
    created: 0,
    failed: 0,
    errors: [],
  };
}

/**
 * Scan the web UI (src/ui-app/) for UI bugs, UX friction, and design
 * improvements. Each finding is grounded in a best practice with a concrete,
 * actionable recommendation that references the file/component involved.
 * The scan is heuristic, flagging signal-not-noise patterns rather than trying
 * to be a fully automated accessibility audit — it never edits UI source.
 */
export async function scanForDesignIssues(config: RepoOSConfig): Promise<DesignScanResult> {
  const findings: DesignFinding[] = [];
  const insights: string[] = [];

  const uiRoot = join(config.root, "src", "ui-app", "src");
  let files: string[] = [];
  try {
    files = collectSourceFiles(uiRoot);
  } catch {
    files = [];
  }
  const scanned = readScannedFiles(uiRoot, files);

  const components = scanned.filter(
    (f) => f.rel.startsWith("components/") && f.rel.endsWith(".vue"),
  );
  const views = scanned.filter((f) => f.rel.startsWith("views/") && f.rel.endsWith(".vue"));

  insights.push(
    `Analyzed ${scanned.length} files under \`src/ui-app/src/\` (${components.length} components, ${views.length} views).`,
  );

  if (scanned.length === 0) {
    insights.push("No web UI source found — the scan only looks under `src/ui-app/src/`.");
    return { findings, scannedFiles: 0, insights };
  }

  // 1. Inline `style="..."` attributes in templates: they break the design
  // system by bypassing CSS variables/classes and make dark-mode theming drift.
  const INLINE_STYLE_RE = /\sstyle\s*=\s*["']([^"']+)["']/g;
  for (const file of scanned) {
    let m: RegExpExecArray | null;
    while ((m = INLINE_STYLE_RE.exec(file.content)) !== null) {
      const value = m[1];
      // Skip Tailwind-style dynamic bindings (:style) — the static style attr
      // is the theme-unsafe one.
      if (value.includes("{") || value.length === 0) continue;
      findings.push({
        category:
          value.includes("color") || value.includes("background") || value.includes("border")
            ? "ui-bug"
            : "design-recommendation",
        file: file.rel,
        line: findLineAt(file.content, m.index),
        description: `Hardcoded inline style "${value}" bypasses the shared design system.`,
        rationale:
          "Inline styles ignore the centralized CSS variables and can drift from the theme, especially across dark mode.",
        recommendation: `Move this styling into a scoped class or a shared utility so it inherits the app's theme tokens (see how neighboring \`src/ui-app/src/components/*.vue\` components style via CSS variables).`,
        severity: "medium",
      });
    }
  }

  // 2. Hardcoded hex colors in templates/styles: they can't respond to theme.
  const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
  for (const file of scanned) {
    const cleaned = file.content.replace(/style\s*=\s*["'][^"']*["']/g, "");
    let m: RegExpExecArray | null;
    while ((m = HEX_COLOR_RE.exec(cleaned)) !== null) {
      findings.push({
        category: "design-recommendation",
        file: file.rel,
        line: findLineAt(cleaned, m.index),
        description: `Hardcoded hex color ${m[0]} used instead of a theme variable.`,
        rationale:
          "Hardcoded colors do not adapt to the app's light/dark theme and make palette changes require editing many files.",
        recommendation:
          "Replace with a CSS variable (e.g. `var(--text-primary)`, `var(--border)`) so it follows the active theme.",
        severity: "low",
      });
    }
  }

  // 3. Interactive elements without an accessible name: buttons with only an
  // icon or empty labels are invisible to screen readers.
  for (const file of scanned) {
    if (!/\.vue$/.test(file.rel)) continue;
    const BUTTON_RE = /<button\b([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = BUTTON_RE.exec(file.content)) !== null) {
      const attrs = m[1];
      // A button already has an accessible name via aria-label/title, or a
      // closing tag on the same line means it stays open for visible content.
      if (/aria-label\s*=|aria-labelledby\s*=|title\s*=/.test(attrs)) continue;
      const after = file.content.slice(m.index + m[0].length);
      const lineEnd = after.search(/\n/);
      const restOfLine = (lineEnd === -1 ? after : after.slice(0, lineEnd)).trim();
      // Only flag unmistakable cases: an icon/expression or an immediately-
      // closed button with no accessible name.
      const iconOnly = /^\{[^}]*\}/.test(restOfLine) || /^<\/button>/.test(restOfLine);
      if (!iconOnly) continue;
      findings.push({
        category: "ux-friction",
        file: file.rel,
        line: findLineAt(file.content, m.index),
        description: "A button appears to have no visible label or `aria-label`.",
        rationale:
          "Icon-only or label-less buttons are inaccessible to screen readers and confusing to users.",
        recommendation: "Add a visible label or an `aria-label` describing the action.",
        severity: "medium",
      });
    }
  }

  // 4. click handlers on non-interactive elements (div/span/li without
  // role="button" or a tabindex) — a common keyboard-inaccessibility bug.
  for (const file of scanned) {
    if (!/\.vue$/.test(file.rel)) continue;
    const NONINT_RE = /<(div|span|li)\b([^>]*)\s@click\s*=/g;
    let m: RegExpExecArray | null;
    while ((m = NONINT_RE.exec(file.content)) !== null) {
      const attrs = m[2] ?? "";
      const isButtonRole = /role\s*=\s*["']button["']/.test(attrs) || /tabindex\s*=/.test(attrs);
      if (isButtonRole) continue;
      findings.push({
        category: "ux-friction",
        file: file.rel,
        line: findLineAt(file.content, m.index),
        description: `A <${m[1]}> element carries a @click handler but no role="button" or tabindex.`,
        rationale:
          "Click-only handlers on non-interactive elements are unreachable by keyboard and screen readers don't announce them as actionable.",
        recommendation: `Add role="button" and tabindex="0" (plus Enter/Space handling) or use a real <button> in \`${file.rel}\`.`,
        severity: "medium",
      });
    }
  }

  // 5. v-html usage: unsanitized HTML injection risk and hard to theme/style consistently.
  const V_HTML_RE = /\bv-html\s*=/g;
  for (const file of scanned) {
    let m: RegExpExecArray | null;
    while ((m = V_HTML_RE.exec(file.content)) !== null) {
      findings.push({
        category: "ui-bug",
        file: file.rel,
        line: findLineAt(file.content, m.index),
        description: "Uses `v-html`, which injects raw HTML.",
        rationale:
          "v-html can render unsanitized HTML (XSS risk) and makes styling/consistency harder to control.",
        recommendation:
          "Prefer Vue interpolation or a dedicated render approach; if v-html is required, ensure the source is trusted and sanitized.",
        severity: "high",
      });
    }
  }

  // 6. Form inputs without an associated label (no <label> nearby or aria-label).
  for (const file of scanned) {
    if (!/\.vue$/.test(file.rel)) continue;
    const INPUT_RE = /<input\b([^>]*)\/?>/gi;
    let m: RegExpExecArray | null;
    while ((m = INPUT_RE.exec(file.content)) !== null) {
      const attrs = m[1];
      if (/type\s*=\s*["'](?:hidden|checkbox|radio)["']/i.test(attrs)) continue;
      const hasName = /aria-label\s*=|aria-labelledby\s*=|id\s*=|placeholder\s*=|v-model\s*/.test(
        attrs,
      );
      if (hasName) continue;
      const before = file.content.slice(Math.max(0, m.index - 80), m.index);
      if (/<label\b/.test(before)) continue;
      findings.push({
        category: "ux-friction",
        file: file.rel,
        line: findLineAt(file.content, m.index),
        description: "An <input> has no explicit label, aria-label, or labelled-by association.",
        rationale:
          "Inputs without accessible labels are hard to fill out for screen-reader users and can be ambiguous for everyone.",
        recommendation:
          "Wrap or associate the input with a <label>, or add aria-label/aria-labelledby.",
        severity: "medium",
      });
    }
  }

  // 7. Very large component files — a maintainability and consistency concern.
  for (const file of scanned) {
    if (!/\.vue$/.test(file.rel)) continue;
    if (file.lineCount > 600) {
      findings.push({
        category: "design-recommendation",
        file: file.rel,
        line: 1,
        description: `Component file is ${file.lineCount} lines long.`,
        rationale:
          "Very large single-file components are hard to maintain and tend to accumulate inconsistent, copy-pasted styling.",
        recommendation:
          "Break the component into smaller focused components and extract repeated markup/styling into shared primitives.",
        severity: "low",
      });
    }
  }

  // Keep the report focused: cap the number of findings per category.
  const MAX_FINDINGS_PER_CATEGORY = 8;
  const capped: DesignFinding[] = [];
  const counts: Record<DesignFindingCategory, number> = {
    "ui-bug": 0,
    "ux-friction": 0,
    "design-recommendation": 0,
  };
  for (const finding of findings) {
    if (counts[finding.category] >= MAX_FINDINGS_PER_CATEGORY) continue;
    counts[finding.category]++;
    capped.push(finding);
  }

  return { findings: capped, scannedFiles: scanned.length, insights };
}

/**
 * Generate a markdown UI/UX design report and save it with a timestamp.
 * Fallback content guarantees the report reads correctly even when the scan
 * found nothing to flag.
 */
export async function generateDesignReport(
  config: RepoOSConfig,
  scan: DesignScanResult,
): Promise<{ reportPath: string; fileName: string }> {
  const reportDir = join(config.root, "docs", "agents", "Design");
  mkdirSync(reportDir, { recursive: true });

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const fileName = `Design_report_${ts}.md`;
  const reportPath = join(reportDir, fileName);

  let report = `# UI/UX Design Review Report\n\n`;
  report += `**Generated**: ${now.toISOString()}\n\n`;
  report += `## Executive Summary\n\n`;
  report += `- **Files Scanned**: ${scan.scannedFiles}\n`;
  report += `- **Findings Identified**: ${scan.findings.length}\n`;
  const byCat = { "ui-bug": 0, "ux-friction": 0, "design-recommendation": 0 };
  for (const f of scan.findings) byCat[f.category]++;
  report += `- **UI bugs**: ${byCat["ui-bug"]}\n`;
  report += `- **UX frictions**: ${byCat["ux-friction"]}\n`;
  report += `- **Design recommendations**: ${byCat["design-recommendation"]}\n\n`;

  if (scan.insights.length > 0) {
    report += `## Scan Overview\n\n`;
    for (const insight of scan.insights) report += `- ${insight}\n`;
    report += `\n`;
  }

  if (scan.findings.length > 0) {
    const labels: Record<DesignFindingCategory, { title: string; heading: string }> = {
      "ui-bug": { title: "UI Bugs", heading: "UI Bugs" },
      "ux-friction": { title: "UX Friction", heading: "UX Friction" },
      "design-recommendation": {
        title: "Design Recommendations",
        heading: "Proposed Updates, Fixes, and New Designs",
      },
    };
    const order: DesignFindingCategory[] = ["ui-bug", "ux-friction", "design-recommendation"];
    for (const cat of order) {
      const items = scan.findings.filter((f) => f.category === cat);
      if (items.length === 0) continue;
      report += `## ${labels[cat].heading}\n\n`;
      for (const sev of ["high", "medium", "low"] as const) {
        const filtered = items.filter((i) => i.severity === sev);
        if (filtered.length === 0) continue;
        report += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
        for (const f of filtered) {
          report += `**${f.description}**\n`;
          report += `- File: \`${f.file}\`${f.line ? `:${f.line}` : ""}\n`;
          report += `- **Rationale**: ${f.rationale}\n`;
          report += `- **Suggested fix**: ${f.recommendation}\n\n`;
        }
      }
    }
  } else {
    report += `## UI/UX Assessment\n\n`;
    report += `No significant UI/UX issues detected in the current web UI.\n\n`;
  }

  report += `## Next Steps\n\n`;
  report += `- Review the findings and confirm each is worth addressing.\n`;
  report += `- Create follow-up tasks for the agreed-upon fixes/redesigns (this agent reports only; it does not edit UI source).\n`;
  report += `- Track progress through subsequent reports under \`docs/agents/Design/\`.\n`;

  await writeFile(reportPath, report, "utf8");
  return { reportPath, fileName };
}

/**
 * Run the Design Agent end to end: scan the web UI, generate a markdown
 * report saved to docs/agents/Design/, and record lastRunAt. Like the
 * Architect agent it only reports — it never edits UI source or creates tasks.
 */
export async function runDesignAgent(config: RepoOSConfig): Promise<DesignRunResult> {
  const scan = await scanForDesignIssues(config);
  const report = await generateDesignReport(config, scan);

  const agents = { ...(config.builtInAgents ?? {}) };
  agents["design"] = { ...(agents["design"] ?? {}), lastRunAt: new Date().toISOString() };
  saveBuiltInAgentsConfig(config.root, agents, config.cacheDir);
  config.builtInAgents = agents;

  return {
    reportPath: report.reportPath,
    fileName: report.fileName,
    findingsFound: scan.findings.length,
    scannedFiles: scan.scannedFiles,
    created: 0,
    failed: 0,
    errors: [],
  };
}

export type DocsDebtFindingKind =
  | "missing-path"
  | "missing-symbol"
  | "false-constraint"
  | "missing-script";

export interface DocsDebtFinding {
  kind: DocsDebtFindingKind;
  /** Repo-relative path of the doc carrying the claim. */
  doc: string;
  line: number;
  /** The exact claim text (usually the backtick span, or the sentence). */
  claim: string;
  /** What was checked and what was found — the evidence a human needs. */
  evidence: string;
  severity: "high" | "medium" | "low";
  /** A concrete, actionable suggestion for the human. */
  recommendation?: string;
}

/**
 * A single, mechanical, high-confidence correction the agent may apply to a doc
 * directly — the one place a built-in agent edits files. `src/` is never a
 * candidate: the fix list only ever contains docs under AGENTS.md/docs/user-docs.
 */
export interface DocsDebtTrivialFix {
  kind: "renamed-path";
  doc: string;
  line: number;
  /** The exact text to replace, including any `:line` suffix. */
  from: string;
  /** The unambiguous replacement. */
  to: string;
  evidence: string;
}

/** A doc correction the agent applied on its own, for the run banner. */
export interface DocsDebtAutoFixed {
  doc: string;
  from: string;
  to: string;
}

export interface DocsDebtScanResult {
  trivialFixes: DocsDebtTrivialFix[];
  needsHuman: DocsDebtFinding[];
  /** Number of doc files present (bounded by the scan cap). */
  scannedDocs: number;
  /** Number of findings + proposed fixes the agent returned. */
  claimsChecked: number;
  /** Set when the LLM run itself failed; findings are then empty. */
  error?: string;
}

export interface DocsDebtApplyResult {
  /** Fixes whose doc edit landed (and whose commit, if any, succeeded). */
  applied: number;
  /** Fixes beyond the per-run cap, downgraded to a task by the caller. */
  skipped: number;
  /** Fixes that were applied AND committed to git. */
  committed: number;
  /** The docs changed this run (doc + old→new), for the run banner. */
  fixed: DocsDebtAutoFixed[];
  errors: string[];
}

export interface CreateDocsDebtTaskResult {
  created: number;
  failed: number;
  errors: string[];
  /** The new task's id, or null when nothing was filed. */
  taskId: string | null;
}

export interface DocsDebtRunResult {
  scannedDocs: number;
  /** Alias for scannedDocs, matching the generic built-in agent response shape. */
  scannedFiles: number;
  claimsChecked: number;
  trivialFixesApplied: number;
  /** All needs-human findings, including cap-downgraded fixes. */
  findingsFound: number;
  /** 0 or 1 — a run never files more than one task. */
  taskCreated: number;
  /** The bundled finding task's id, or null when no task was filed. */
  taskId: string | null;
  /** Docs the agent corrected automatically this run. */
  autoFixed: DocsDebtAutoFixed[];
  /** Alias kept so the server's generic `taskCount` field stays accurate. */
  created: number;
  failed: number;
  errors: string[];
  /** Set when the agent run itself failed (e.g. the model was unreachable). */
  error?: string;
}

/** Raised when the Docs Debt Agent cannot do its job at all (e.g. missing work dir). */
export class DocsDebtError extends Error {}

/**
 * Skill doc that tells the model what "docs debt" means. The agent reads it as
 * its role guidance; it is what lets the concern generalize past RepoOS's own
 * language and layout instead of a hardcoded extension/path list.
 */
export const DOCS_DEBT_SKILL_PATH = "docs/agents/skills/docs-debt.md";

/**
 * Used only when the skill doc is missing (e.g. a fresh repo where the file
 * hasn't been created). Keeps the agent runnable rather than silently useful.
 */
const DOCS_DEBT_SKILL_FALLBACK = [
  "You keep this project's documentation honest.",
  "Verify concrete, checkable claims in the project's own docs (AGENTS.md,",
  "docs/, user-docs/) against the actual repository. Search the whole repo for",
  "the real source layout instead of assuming src/. Do not flag identifiers that",
  "belong to third-party tools rather than this project. Report only claims you",
  "have independently confirmed are stale, with precise evidence.",
].join("\n");

/** Read the docs-debt skill doc, falling back to embedded guidance. */
function loadDocsDebtSkill(root: string): string {
  try {
    const content = readFileSync(join(root, DOCS_DEBT_SKILL_PATH), "utf8").trim();
    return content || DOCS_DEBT_SKILL_FALLBACK;
  } catch {
    return DOCS_DEBT_SKILL_FALLBACK;
  }
}

/**
 * The runner refuses to invoke an agent with no config entry. A fresh install
 * has no docs-debt entry until the user enables it, but the old deterministic
 * agent ran anyway (the UI gates on `enabled`), so supply a default when absent
 * while still honoring an explicit `{ enabled: false }`.
 */
function configWithDocsDebtAgent(config: RepoOSConfig): RepoOSConfig {
  if (config.builtInAgents?.["docs-debt"]) return config;
  return {
    ...config,
    builtInAgents: {
      ...(config.builtInAgents ?? {}),
      "docs-debt": { enabled: true },
    },
  };
}

const DOCS_DEBT_FINDING_KINDS: readonly DocsDebtFindingKind[] = [
  "missing-path",
  "missing-symbol",
  "false-constraint",
  "missing-script",
];

/** Coerce the model's free-form issue type to the finding kinds the UI knows. */
function mapFindingKind(type: string): DocsDebtFindingKind {
  return (DOCS_DEBT_FINDING_KINDS as readonly string[]).includes(type)
    ? (type as DocsDebtFindingKind)
    : "missing-symbol";
}

/** 1-based line of the first occurrence of `needle` in a doc, or 1. */
function lineOfText(root: string, doc: string, needle: string): number {
  try {
    const content = readFileSync(join(root, doc), "utf8");
    const idx = content.indexOf(needle);
    if (idx < 0) return 1;
    return content.slice(0, idx).split("\n").length;
  } catch {
    return 1;
  }
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * The agent may only ever write to the project's own docs. `fix.doc` comes
 * straight from model output, so this allowlist (root `AGENTS.md`, any nested
 * `AGENTS.md`, and anything under `docs/`/`user-docs/`) is enforced here rather
 * than assumed — a "fix" naming `package.json` or a source file must never
 * auto-commit.
 */
function isDocsDebtDocPath(doc: string): boolean {
  if (!doc) return false;
  if (doc === "AGENTS.md" || doc.endsWith("/AGENTS.md")) return true;
  return doc.startsWith("docs/") || doc.startsWith("user-docs/");
}

/**
 * Whether a proposed fix is safe to apply mechanically and auto-commit:
 * it targets an allowed doc, clears the deterministic gate, and its `oldText`
 * appears exactly once in that doc — otherwise `split/join` would silently
 * rewrite every occurrence, not just the one the agent cited.
 */
function isSafeDocsDebtFix(
  config: RepoOSConfig,
  doc: string,
  oldText: string,
  newText: string,
): boolean {
  if (!isDocsDebtDocPath(doc)) return false;
  if (!isSafeToAutoCommit({ doc, oldText, newText }, config.root)) return false;
  let content: string;
  try {
    content = readFileSync(join(config.root, doc), "utf8");
  } catch {
    return false;
  }
  return countOccurrences(content, oldText) === 1;
}

/** Collect the docs this agent may read (and, for trivial fixes, edit). */
function collectDocFiles(root: string): string[] {
  const out: string[] = [];
  const addFile = (abs: string): void => {
    if (out.length >= MAX_DOCS) return;
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }
    if (st.isFile() && st.size <= MAX_DOC_BYTES) out.push(abs);
  };
  addFile(join(root, "AGENTS.md"));
  const walk = (dir: string): void => {
    if (out.length >= MAX_DOCS) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= MAX_DOCS) return;
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORED_DIRS.has(name) || name.startsWith(".")) continue;
        walk(abs);
      } else if (st.isFile() && name.endsWith(".md") && st.size <= MAX_DOC_BYTES) {
        out.push(abs);
      }
    }
  };
  for (const dir of ["docs", "user-docs"]) walk(join(root, dir));
  return out;
}

/**
 * Ask the skill-guided runner to verify the project's own docs against the
 * real repo, then split its output: findings the agent is confident about are
 * bundled for a human, and proposed fixes are only accepted as mechanical
 * auto-fixes when they clear the independent verification gate. A fix that
 * does not clear the gate is downgraded to a needs-human finding — the agent's
 * own confidence is never what authorizes a write to `main`.
 */
export async function scanForDocsDebt(
  config: RepoOSConfig,
  logger?: Logger,
): Promise<DocsDebtScanResult> {
  const skillDoc = loadDocsDebtSkill(config.root);
  const run = await runSkillGuidedAgent(
    "docs-debt",
    configWithDocsDebtAgent(config),
    skillDoc,
    DOCS_DEBT_SKILL_PATH,
    logger,
  );

  const scannedDocs = collectDocFiles(config.root).length;

  if (!run.ok) {
    const error = run.error ?? "Docs Debt Agent run failed";
    logger?.agent("docs-debt", "error", error);
    return { trivialFixes: [], needsHuman: [], scannedDocs, claimsChecked: 0, error };
  }

  const trivialFixes: DocsDebtTrivialFix[] = [];
  const needsHuman: DocsDebtFinding[] = [];

  for (const finding of run.findings) {
    needsHuman.push({
      kind: mapFindingKind(finding.type),
      doc: finding.file ?? "",
      line: finding.line ?? 1,
      claim: finding.claim ?? finding.description,
      evidence: finding.evidence ?? finding.description,
      severity: finding.severity,
      recommendation: finding.recommendation,
    });
  }

  for (const fix of run.fixes) {
    const line = lineOfText(config.root, fix.doc, fix.oldText);
    const safe = isSafeDocsDebtFix(config, fix.doc, fix.oldText, fix.newText);
    if (safe) {
      trivialFixes.push({
        kind: "renamed-path",
        doc: fix.doc,
        line,
        from: fix.oldText,
        to: fix.newText,
        evidence:
          fix.evidence ||
          `\`${fix.oldText}\` → \`${fix.newText}\` verified against the repo by the auto-fix gate`,
      });
    } else {
      needsHuman.push({
        kind: "missing-path",
        doc: fix.doc,
        line,
        claim: fix.oldText,
        evidence: `${fix.evidence ? `${fix.evidence} — ` : ""}the proposed fix did not clear the independent auto-fix verification gate`,
        severity: "medium",
        recommendation: `Review and apply \`${fix.oldText}\` → \`${fix.newText}\` manually.`,
      });
    }
  }

  return {
    trivialFixes,
    needsHuman,
    scannedDocs,
    claimsChecked: run.findings.length + run.fixes.length,
  };
}

/**
 * Apply the mechanical doc fixes, capped per run, committing each with its
 * evidence. Fail-soft: a missing git identity or non-git checkout never throws;
 * the doc edit still lands and the caller can see it was not committed. Never
 * touches `src/` — the fix list only names doc paths by construction.
 */
export async function applyDocsDebtFixes(
  config: RepoOSConfig,
  fixes: DocsDebtTrivialFix[],
): Promise<DocsDebtApplyResult> {
  const result: DocsDebtApplyResult = {
    applied: 0,
    skipped: 0,
    committed: 0,
    fixed: [],
    errors: [],
  };
  const toApply = fixes.slice(0, MAX_TRIVIAL_FIXES_PER_RUN);
  result.skipped = fixes.length - toApply.length;

  for (const fix of toApply) {
    const abs = join(config.root, fix.doc);
    try {
      // Defense in depth: the scan already filters through the gate, but the
      // write itself must never be reachable without a fresh, independent pass.
      if (!isSafeDocsDebtFix(config, fix.doc, fix.from, fix.to)) {
        result.errors.push(`${fix.doc}: fix did not clear the auto-fix gate`);
        result.skipped++;
        continue;
      }
      const content = readFileSync(abs, "utf8");
      if (!content.includes(fix.from)) {
        result.errors.push(`${fix.doc}: \`${fix.from}\` is no longer present`);
        result.skipped++;
        continue;
      }
      const updated = content.split(fix.from).join(fix.to);
      writeFileSync(abs, updated, "utf8");
      const message = [
        `docs: fix stale reference in ${fix.doc}`,
        "",
        fix.evidence,
        "Verified by the Docs Debt Agent.",
      ].join("\n");
      if (commitTaskFile(config.root, abs, message)) result.committed++;
      result.applied++;
      result.fixed.push({ doc: fix.doc, from: fix.from, to: fix.to });
    } catch (err) {
      result.skipped++;
      result.errors.push(`${fix.doc}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** Cap-downgraded fixes become needs-human findings so nothing is dropped. */
function fixesToFindings(fixes: DocsDebtTrivialFix[]): DocsDebtFinding[] {
  return fixes.map((fix) => ({
    kind: "missing-path",
    doc: fix.doc,
    line: fix.line,
    claim: fix.from,
    evidence: `${fix.evidence} (not auto-fixed: the per-run cap of ${MAX_TRIVIAL_FIXES_PER_RUN} was reached)`,
    severity: "low",
    recommendation: `Update \`${fix.from}\` to \`${fix.to}\`.`,
  }));
}

/**
 * Create at most ONE task bundling every needs-human finding from a run. This
 * is the deliberate departure from the other built-ins: a per-finding task
 * would flood the inbox. Zero findings means zero tasks — never an empty task.
 */
export async function createDocsDebtTask(
  config: RepoOSConfig,
  findings: DocsDebtFinding[],
): Promise<CreateDocsDebtTaskResult> {
  const workDir = join(config.root, config.workDir);
  let workDirStats;
  try {
    workDirStats = statSync(workDir);
  } catch {
    throw new DocsDebtError(
      `Task directory "${config.workDir}" does not exist — create it (or fix workDir) before running the Docs Debt Agent`,
    );
  }
  if (!workDirStats.isDirectory()) {
    throw new DocsDebtError(`Task directory "${config.workDir}" is not a directory`);
  }
  try {
    accessSync(workDir, 0o2 /* W_OK */);
  } catch {
    throw new DocsDebtError(`Task directory "${config.workDir}" is not writable`);
  }

  const result: CreateDocsDebtTaskResult = { created: 0, failed: 0, errors: [], taskId: null };
  if (findings.length === 0) return result;

  const title = "Docs debt: stale claims in AGENTS.md, docs/, and user-docs/";
  const now = new Date().toISOString();
  const taskId = findNextTaskId(workDir);
  const taskPath = join(workDir, `${taskId}-${slugify(title)}.md`);

  let body = `## Docs Debt Findings\n\n`;
  body += `The Docs Debt Agent verified concrete claims in \`AGENTS.md\`/\`docs/\`/\`user-docs/\` against the actual repo and found ${findings.length} that need a human decision.\n\n`;
  findings.forEach((finding, index) => {
    body += `### ${index + 1}. ${finding.claim}\n`;
    body += finding.doc
      ? `- **Doc**: \`${finding.doc}\`${finding.line ? `:${finding.line}` : ""}\n`
      : `- **Doc**: not specified\n`;
    body += `- **Kind**: ${finding.kind}\n`;
    body += `- **Severity**: ${finding.severity}\n`;
    body += `- **Evidence**: ${finding.evidence}\n`;
    if (finding.recommendation) body += `- **Suggested fix**: ${finding.recommendation}\n`;
    body += `\n`;
  });
  body += `## Next Steps\n\n`;
  body += `1. Confirm each finding is real drift and not a deliberate, documented difference.\n`;
  body += `2. Update the doc(s) or the code so the two agree.\n`;
  body += `3. Move this task to done when complete.\n`;

  const frontmatter = `---
id: "${taskId}"
title: ${JSON.stringify(title)}
type: chore
status: inbox
priority: p2
area: docs-debt
assigned_to: unassigned
created_by: docs-debt-agent
created_at: "${now}"
updated_at: "${now}"
---`;

  try {
    await writeFile(taskPath, `${frontmatter}\n${body}`, "utf8");
    result.created++;
    result.taskId = taskId;
  } catch (err) {
    result.failed++;
    result.errors.push(`${taskPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Run the Docs Debt Agent end to end: scan, apply capped trivial fixes, file
 * one bundled task for whatever needs a human, and record lastRunAt. The
 * caller owns overlap protection (a single in-flight guard in server.ts).
 */
export async function runDocsDebtAgent(
  config: RepoOSConfig,
  logger?: Logger,
): Promise<DocsDebtRunResult> {
  logger?.agent("docs-debt", "info", "Docs Debt Agent scan started");
  const scan = await scanForDocsDebt(config, logger);
  logger?.agent("docs-debt", "info", "Docs Debt scan completed", {
    scannedDocs: scan.scannedDocs,
    claimsChecked: scan.claimsChecked,
    trivialFixes: scan.trivialFixes.length,
    needsHuman: scan.needsHuman.length,
    error: scan.error,
  });

  const apply = await applyDocsDebtFixes(config, scan.trivialFixes);
  if (apply.applied > 0) {
    logger?.agent("docs-debt", "info", `Applied ${apply.applied} trivial doc fix(es)`, {
      committed: apply.committed,
    });
  }
  const cappedFixes = fixesToFindings(scan.trivialFixes.slice(MAX_TRIVIAL_FIXES_PER_RUN));
  const findings = [...scan.needsHuman, ...cappedFixes];

  const task = await createDocsDebtTask(config, findings);
  if (task.failed > 0) {
    logger?.agent("docs-debt", "error", `Failed to create docs debt task`, {
      errors: task.errors,
    });
  }
  if (task.created > 0) {
    logger?.agent("docs-debt", "info", `Created ${task.created} docs debt task`);
  }

  saveLastRunAt(config.root, "docs-debt", config);

  logger?.agent("docs-debt", "info", "Docs Debt Agent run completed", {
    trivialFixesApplied: apply.applied,
    findingsFound: findings.length,
    taskCreated: task.created,
  });

  return {
    scannedDocs: scan.scannedDocs,
    scannedFiles: scan.scannedDocs,
    claimsChecked: scan.claimsChecked,
    trivialFixesApplied: apply.applied,
    findingsFound: findings.length,
    taskCreated: task.created,
    taskId: task.taskId,
    autoFixed: apply.fixed,
    created: task.created,
    failed: task.failed,
    errors: [...(scan.error ? [scan.error] : []), ...apply.errors, ...task.errors],
    error: scan.error,
  };
}

/** Dispatch to the appropriate built-in agent by name. */
export async function runBuiltInAgent(
  name: string,
  config: RepoOSConfig,
  logger?: Logger,
): Promise<
  | TechDebtRunResult
  | PerformanceRunResult
  | ArchitectRunResult
  | DesignRunResult
  | DocsDebtRunResult
  | null
> {
  if (name === "tech-debt") {
    return runTechDebtAgent(config, {}, logger);
  }
  if (name === "performance") {
    return runPerformanceAgent(config, logger);
  }
  if (name === "architect") {
    return runArchitectAgent(config, logger);
  }
  if (name === "design") {
    return runDesignAgent(config);
  }
  if (name === "docs-debt") {
    return runDocsDebtAgent(config, logger);
  }
  return null;
}

function getTitleForIssueType(type: TechDebtIssueType): string {
  switch (type) {
    case "outdated-dependency":
      return "Update outdated dependencies";
    case "code-duplication":
      return "Refactor duplicated code";
    case "high-complexity":
      return "Reduce file complexity";
    case "unused-code":
      return "Remove unused code";
    case "deprecated-api":
      return "Modernize deprecated patterns";
    default:
      return "Address tech debt";
  }
}

function getTitleForPerformanceIssueType(type: PerformanceIssueType): string {
  switch (type) {
    case "slow-function":
      return "Optimize function performance";
    case "blocking-operation":
      return "Fix blocking operations";
    case "unbounded-growth":
      return "Prevent unbounded memory growth";
    case "duplicated-computation":
      return "Eliminate duplicate computations";
    default:
      return "Improve performance";
  }
}

function formatIssuesForTask(issues: TechDebtIssue[]): string {
  let body = "## Issues Identified\n\n";

  for (const issue of issues) {
    body += `### ${issue.description}\n`;
    body += `- **File**: \`${issue.file}\`\n`;
    if (issue.line) body += `- **Line**: ${issue.line}\n`;
    body += `- **Severity**: ${issue.severity}\n\n`;
  }

  body += "## Next Steps\n\n";
  body += "1. Review each issue in the files listed above\n";
  body += "2. Make the suggested improvements\n";
  body += "3. Test the changes thoroughly\n";
  body += "4. Move this task to done when complete\n";

  return body;
}

function formatPerformanceIssuesForTask(issues: PerformanceIssue[]): string {
  let body = "## Performance Issues Identified\n\n";

  for (const issue of issues) {
    body += `### ${issue.description}\n`;
    body += `- **File**: \`${issue.file}\`\n`;
    if (issue.line) body += `- **Line**: ${issue.line}\n`;
    body += `- **Severity**: ${issue.severity}\n`;
    body += `- **Type**: ${issue.type}\n\n`;
  }

  body += "## Next Steps\n\n";
  body += "1. Profile the identified performance issues with real-world data\n";
  body += "2. Optimize the code using appropriate techniques (async, streaming, caching, etc.)\n";
  body += "3. Measure the improvement with benchmarks\n";
  body += "4. Test thoroughly to ensure no regressions\n";
  body += "5. Move this task to done when optimized\n";

  return body;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function findNextTaskId(workDir: string): string {
  try {
    const files = readdirSync(workDir);
    const ids = files
      .map((f) => {
        const match = f.match(/^(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);
    const maxId = Math.max(...ids, 0);
    return String(maxId + 1).padStart(4, "0");
  } catch {
    return "0001";
  }
}
