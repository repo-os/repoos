/**
 * Built-in agents: pre-configured agents like Tech Debt Agent that extend RepoOS.
 * These agents are triggered on-demand or on a schedule.
 */

import { readdirSync, readFileSync, statSync, accessSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import type { BuiltInAgentConfig, RepoOSConfig } from "../core/types.js";
import { saveBuiltInAgentsConfig } from "../core/config.js";

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
  | "large-bundle"
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

export interface PerformanceScanResult {
  issues: PerformanceIssue[];
  /** Number of files actually read (bounded by the scan cap). */
  scannedFiles: number;
}

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
/** Performance thresholds */
const SLOW_FUNCTION_LINES = 300;
const NESTED_LOOP_DEPTH = 3;
const MAX_PERF_SCAN_FILES = 500;
const MAX_PERF_ISSUES = 30;

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

async function fetchLatestVersion(
  name: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
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
      return !s.includes("alpha") && !s.includes("beta") && !s.includes("*") && parseMajor(s) !== null;
    })
    .slice(0, MAX_REGISTRY_PROBES);

  const results = await mapLimit(
    candidates,
    REGISTRY_CONCURRENCY,
    async ([name, version]) => {
      const latest = await fetchLatestVersion(name, fetchImpl);
      return { name, version: String(version), latest };
    },
  );

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
    const referencedElsewhere = scanned.some(
      (f) => f.rel !== decl.file && nameRe.test(f.content),
    );
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
      result.errors.push(
        `${taskPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
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
 * Scan the repository for performance issues.
 * Returns the identified issues plus scan bounds, so callers can tell a
 * successful-but-empty scan apart from a failed one.
 */
export async function scanForPerformanceIssues(
  config: RepoOSConfig,
): Promise<PerformanceScanResult> {
  const issues: PerformanceIssue[] = [];

  const files = collectSourceFiles(config.root);
  const scanned = readScannedFiles(config.root, files);

  let perfIssuesCount = 0;

  for (const file of scanned) {
    if (perfIssuesCount >= MAX_PERF_ISSUES) break;

    const lines = file.content.split("\n");

    // 1. Functions that are too long (likely doing too much).
    if (file.lineCount > SLOW_FUNCTION_LINES) {
      issues.push({
        type: "slow-function",
        file: file.rel,
        line: 1,
        description: `Function/file is ${file.lineCount} lines long — consider breaking it into smaller functions for better performance and readability`,
        severity: "medium",
      });
      perfIssuesCount++;
    }

    // 2. Detect deeply nested loops (N² or worse performance).
    const cleaned = stripCommentsAndStrings(file.content);
    let maxDepth = 0;
    let currentDepth = 0;
    let lineNum = 1;
    let maxDepthLine = 1;

    for (const char of cleaned) {
      if (char === "\n") lineNum++;
      if (char === "{" && cleaned.substring(Math.max(0, cleaned.indexOf(char) - 20), cleaned.indexOf(char)).match(/for\s*\(|while\s*\(|forEach/)) {
        currentDepth++;
        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
          maxDepthLine = lineNum;
        }
      }
      if (char === "}") currentDepth = Math.max(0, currentDepth - 1);
    }

    if (maxDepth >= NESTED_LOOP_DEPTH) {
      issues.push({
        type: "blocking-operation",
        file: file.rel,
        line: maxDepthLine,
        description: `Nested loops detected (depth ${maxDepth}) — this could cause O(n²) or worse performance; consider refactoring`,
        severity: maxDepth > 4 ? "high" : "medium",
      });
      perfIssuesCount++;
    }

    // 3. Look for synchronous operations that should be async.
    const syncPatterns = [
      { pattern: /\bfs\.readFileSync\b/, desc: "Synchronous file read blocks the event loop" },
      { pattern: /\bfs\.writeFileSync\b/, desc: "Synchronous file write blocks the event loop" },
      { pattern: /\bJSON\.stringify\(.*\)\s*;/, desc: "Large object serialization could block; consider streaming" },
    ];

    for (const { pattern, desc } of syncPatterns) {
      if (pattern.test(cleaned)) {
        let m: RegExpExecArray | null;
        const globalPattern = new RegExp(pattern.source, "g");
        while ((m = globalPattern.exec(cleaned)) !== null) {
          if (perfIssuesCount >= MAX_PERF_ISSUES) break;
          issues.push({
            type: "blocking-operation",
            file: file.rel,
            line: findLineAt(file.content, m.index),
            description: `${desc}`,
            severity: "high",
          });
          perfIssuesCount++;
        }
      }
    }

    // 4. Detect potential unbounded growth (array/object accumulation without cleanup).
    const unboundedPatterns = [
      { pattern: /\w+\.push\s*\(/, label: "array push" },
      { pattern: /Map\s*\(/, label: "Map construction" },
    ];

    for (const { pattern, label } of unboundedPatterns) {
      if (perfIssuesCount >= MAX_PERF_ISSUES) break;
      const matches = (cleaned.match(pattern) || []).length;
      if (matches > 10) {
        issues.push({
          type: "unbounded-growth",
          file: file.rel,
          line: 1,
          description: `File uses "${label}" frequently (${matches} times) — ensure proper cleanup to prevent memory leaks`,
          severity: "low",
        });
        perfIssuesCount++;
        break;
      }
    }

    // 5. Detect duplicate computations (expensive operations inside loops).
    const lines_trimmed = lines.map((l) => l.trim()).filter((l) => l);
    for (let i = 0; i < lines_trimmed.length - 2; i++) {
      if (perfIssuesCount >= MAX_PERF_ISSUES) break;
      const line = lines_trimmed[i];
      if ((line.includes("for ") || line.includes("while ")) && !line.includes("const ")) {
        // Look for expensive operations in the next few lines
        const loopBody = lines_trimmed.slice(i + 1, Math.min(i + 5)).join(" ");
        if (
          loopBody.includes("JSON.parse") ||
          loopBody.includes("JSON.stringify") ||
          loopBody.includes("fetch") ||
          loopBody.includes("database") ||
          loopBody.includes("query")
        ) {
          issues.push({
            type: "duplicated-computation",
            file: file.rel,
            line: findLineAt(file.content, file.content.indexOf(line)),
            description: `Potentially expensive operation detected inside loop — move it outside the loop if possible`,
            severity: "medium",
          });
          perfIssuesCount++;
        }
      }
    }
  }

  return { issues, scannedFiles: scanned.length };
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
      result.errors.push(
        `${taskPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

/**
 * Run the Tech Debt Agent end to end: scan, create tasks, record lastRunAt.
 * The caller owns overlap protection (a single in-flight guard in server.ts).
 */
export async function runTechDebtAgent(
  config: RepoOSConfig,
  options: TechDebtScanOptions = {},
): Promise<TechDebtRunResult> {
  const scan = await scanForTechDebt(config, options);
  const created = await createTechDebtTasks(config, scan.issues);

  const agents = { ...(config.builtInAgents ?? {}) };
  agents["tech-debt"] = { ...(agents["tech-debt"] ?? {}), lastRunAt: new Date().toISOString() };
  saveBuiltInAgentsConfig(config.root, agents, config.cacheDir);
  config.builtInAgents = agents;

  return {
    issuesFound: scan.issues.length,
    scannedFiles: scan.scannedFiles,
    ...created,
  };
}

/**
 * Run the Performance Agent end to end: scan, create tasks, record lastRunAt.
 * The caller owns overlap protection (a single in-flight guard in server.ts).
 */
export async function runPerformanceAgent(
  config: RepoOSConfig,
): Promise<PerformanceRunResult> {
  const scan = await scanForPerformanceIssues(config);
  const created = await createPerformanceTasks(config, scan.issues);

  const agents = { ...(config.builtInAgents ?? {}) };
  agents["performance"] = { ...(agents["performance"] ?? {}), lastRunAt: new Date().toISOString() };
  saveBuiltInAgentsConfig(config.root, agents, config.cacheDir);
  config.builtInAgents = agents;

  return {
    issuesFound: scan.issues.length,
    scannedFiles: scan.scannedFiles,
    ...created,
  };
}

/** Dispatch to the appropriate built-in agent by name. */
export async function runBuiltInAgent(
  name: string,
  config: RepoOSConfig,
): Promise<TechDebtRunResult | PerformanceRunResult | null> {
  if (name === "tech-debt") {
    return runTechDebtAgent(config);
  }
  if (name === "performance") {
    return runPerformanceAgent(config);
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
    case "large-bundle":
      return "Reduce bundle size";
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
