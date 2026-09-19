/**
 * Built-in agents: pre-configured agents like Tech Debt Agent that extend RepoOS.
 * These agents are triggered on-demand or on a schedule.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, accessSync } from "node:fs";
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
  DESIGN_SKILL_DOC,
  PERFORMANCE_SKILL_DOC,
  TECH_DEBT_SKILL_DOC,
} from "./built-in-agent-skill-docs.js";
import { isSafeToAutoCommit } from "./auto-fix-gate.js";
import { writeAgentRunDoc, type AgentRunDocResult, type AgentRunFinding } from "./agent-run-doc.js";

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

/**
 * What every built-in agent run produces (0439): a run doc under
 * the configured docs directory's `agent-runs/<agent>/` path and at most one
 * inbox task bundling the findings.
 * Shared so the server's run route and the UI's toast read the same shape no
 * matter which agent ran.
 */
export interface BuiltInAgentRunReceipt {
  /** Repo-relative path of this run's doc. */
  runDoc: string | null;
  /** Findings the run recorded, zero or more. */
  findingsFound: number;
  /** 0 or 1 — a run never files more than one task. */
  created: number;
  /** The bundled task's id, or null when the run filed nothing. */
  taskId: string | null;
}

export interface TechDebtRunResult extends BuiltInAgentRunReceipt {
  issuesFound: number;
  scannedFiles: number;
  failed: number;
  errors: string[];
}

/** Raised when the Tech Debt Agent cannot do its job at all (e.g. missing work dir). */
export class TechDebtError extends Error {}

export interface PerformanceRunResult extends BuiltInAgentRunReceipt {
  issuesFound: number;
  scannedFiles: number;
  failed: number;
  errors: string[];
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

export interface ArchitectRunResult extends BuiltInAgentRunReceipt {
  issuesFound: number;
  scannedFiles: number;
  taskCount: number;
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
  /** Files included in the bounded repo walk the skill-guided agent reviewed. */
  scannedFiles: number;
  insights: string[];
  /**
   * True when the agent found no web UI in the repository at all. Kept
   * separate from `findings.length === 0` so a no-UI result reads as a clear
   * "nothing to review" rather than a clean bill of health.
   */
  noUiDetected?: boolean;
  /** Duration/token cost of the underlying model call, for the run doc (0439). */
  elapsedMs?: number;
  totalTokens?: number;
  costUsd?: number;
}

/**
 * Finding `type` the Design skill doc asks the agent to use when the repository
 * has no detectable web UI. It is a signal, not a design finding, so it is
 * peeled off before conversion and surfaced as {@link DesignScanResult.noUiDetected}.
 */
export const DESIGN_NO_UI_TYPE = "no-ui-detected";

/**
 * Backstop cap on findings per category. The skill doc asks the model to
 * "prefer a few high-confidence findings", but that's only a suggestion —
 * this is the actual guardrail against a verbose run flooding the report.
 */
const MAX_DESIGN_FINDINGS_PER_CATEGORY = 25;

export interface DesignRunResult extends BuiltInAgentRunReceipt {
  scannedFiles: number;
  /** True when the agent found no web UI at all — nothing to review. */
  noUiDetected: boolean;
  failed: number;
  errors: string[];
}

export class DesignError extends Error {}

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".nuxt", ".repoos"]);
/**
 * Agent run docs (0439). Excluded from the Docs Debt Agent's walk: they are
 * machine-generated receipts full of timestamps and token counts, so verifying
 * them is noise, and 5 agents x 10 kept runs would eat a third of the bounded
 * doc budget this agent has to spend on prose a human actually maintains.
 */
const AGENT_RUN_DOCS_DIR = "agent-runs";
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
 * One finding as it is rendered into a bundled inbox task. Agents map their
 * own issue shape into this — the body layout is then shared, so a bundled
 * task reads the same whether it came from the Tech Debt, Performance,
 * Architect or Design agent.
 */
interface AggregatedFinding {
  /** Agent-specific kind label, e.g. "outdated-dependency". */
  kind?: string;
  file?: string;
  line?: number;
  description: string;
  severity?: "high" | "medium" | "low";
  /** Why the agent believes this — the evidence a human triages with. */
  evidence?: string;
  /** What the agent suggests doing about it. */
  recommendation?: string;
}

/**
 * Above this many findings a bundled task is too much work to land in one pass,
 * so the body says so and asks for subtasks once the human has approved the
 * direction (0439) — the human decides first, the splitting happens after.
 */
const SUBTASK_HINT_THRESHOLD = 4;

/**
 * The "this is one run's worth of findings, not one unit of work" line, added
 * to a bundled task above {@link SUBTASK_HINT_THRESHOLD} findings. The human
 * approves the direction first; only then does anything get split up (0439).
 */
function subtaskHint(count: number): string | null {
  if (count < SUBTASK_HINT_THRESHOLD) return null;
  return "Create subtasks for each of these once the human approves the direction — this task is a triage bundle, not one unit of work.";
}

/**
 * Render the shared body for a bundled inbox task: an intro, every finding
 * with its evidence, and next steps. The "this is a lot — split it up" line
 * only appears above {@link SUBTASK_HINT_THRESHOLD}, so a two-finding run
 * doesn't get instructions it doesn't need.
 */
function formatAggregatedTaskBody(
  intro: string,
  findings: AggregatedFinding[],
  nextSteps: string[],
): string {
  let body = `## Findings\n\n`;
  body += `${intro}\n\n`;

  findings.forEach((finding, index) => {
    const parts = [finding.kind ?? "finding", finding.severity ?? "unrated"];
    body += `### ${index + 1}. ${parts.join(" · ")}\n\n`;
    body += `${finding.description}\n\n`;
    if (finding.file) {
      body += `- **File**: \`${finding.file}\`${finding.line ? `:${finding.line}` : ""}\n`;
    }
    if (finding.evidence) body += `- **Evidence**: ${finding.evidence}\n`;
    if (finding.recommendation) body += `- **Recommendation**: ${finding.recommendation}\n`;
    body += `\n`;
  });

  body += `## Next Steps\n\n`;
  body += `1. Answer the open questions in this task's frontmatter (or in the PM chat) and update the body with the decisions.\n`;
  if (findings.length >= SUBTASK_HINT_THRESHOLD) {
    body += `2. ${subtaskHint(findings.length)}\n`;
    body += `3. Move this task to done once its findings are either split out or dismissed.\n`;
  } else {
    body += `2. Implement the findings the human approved.\n`;
    body += `3. Move this task to done when complete.\n`;
  }
  for (const step of nextSteps) body += `- ${step}\n`;

  return body;
}

/** Everything a run needs to record in its run doc, minus the agent identity. */
interface RunDocInput {
  startedAt: Date;
  durationMs?: number;
  totalTokens?: number;
  costUsd?: number;
  scannedFiles?: number;
  findings: AgentRunFinding[];
  taskId?: string | null;
  notes?: string[];
}

/**
 * Write this run's doc — the receipt every run leaves behind, whatever it
 * found, including a run that found nothing (0439).
 *
 * Fail-soft by design: a run doc is a record, not a transaction. If it cannot
 * be written the run still reports its findings to the caller and logs the
 * failure, rather than throwing away a successful scan over a filesystem error.
 */
function recordRunDoc(
  config: RepoOSConfig,
  agent: string,
  label: string,
  input: RunDocInput,
  logger?: Logger,
): AgentRunDocResult | null {
  try {
    const doc = writeAgentRunDoc({
      root: config.root,
      docsDir: config.docsDir,
      agent,
      label,
      startedAt: input.startedAt.toISOString(),
      durationMs: input.durationMs,
      totalTokens: input.totalTokens,
      costUsd: input.costUsd,
      scannedFiles: input.scannedFiles,
      findings: input.findings,
      taskId: input.taskId,
      notes: input.notes,
    });
    logger?.agent(agent, "info", `Run doc written — ${doc.findingsCount} finding(s) recorded`, {
      runDoc: doc.path,
      pruned: doc.pruned,
    });
    return doc;
  } catch (err) {
    logger?.agent(agent, "error", "Failed to write run doc", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Create this run's bundled task, fail-soft (0439).
 *
 * A missing or read-only work dir is an operator problem worth reporting, but
 * it must not cost the run its receipt: the run doc is written either way and
 * the failure comes back in `errors` for the run route to surface.
 */
async function createBundledTask(
  agent: string,
  logger: Logger | undefined,
  create: () => Promise<CreateBuiltInTaskResult>,
): Promise<CreateBuiltInTaskResult> {
  try {
    return await create();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.agent(agent, "error", `Failed to create the bundled task — ${message}`);
    return { created: 0, failed: 0, errors: [message], taskId: null };
  }
}

/**
 * Outcome of a built-in agent's inbox write. `created` is always 0 or 1 —
 * a run never files more than one task, however many findings it has (0439).
 */
export interface CreateBuiltInTaskResult {
  created: number;
  failed: number;
  errors: string[];
  /** The bundled task's id, or null when nothing was filed. */
  taskId: string | null;
}

interface BuiltInTaskSpec {
  config: RepoOSConfig;
  /** Inbox title for the bundled task. */
  title: string;
  /** Frontmatter `area`, e.g. "tech-debt". */
  area: string;
  /** Frontmatter `created_by`, e.g. "tech-debt-agent". */
  createdBy: string;
  /** Markdown body: findings + next steps. */
  body: string;
  /**
   * What the human has to decide before this can be implemented. Written as
   * `questions:` alongside `needs_input: true` so the board and the PM chat
   * show the task is blocked on an answer, not on work.
   */
  questions: string[];
  /** Human-facing agent name, used in the work-dir error message. */
  label: string;
  /** Error raised when the work dir is unusable — one class per agent. */
  errorClass: new (message: string) => Error;
}

/**
 * Write the ONE inbox task a built-in agent run may create.
 *
 * Every finding from the run is already aggregated into `body`, and the task
 * always lands with `needs_input: true` plus its `questions`: a scan's output
 * is a proposal, and the human decides what to do with it before anything is
 * implemented. Throws when the work dir itself is unusable — that is an
 * operator error, not something to swallow into a "ran clean" run.
 */
export async function createBuiltInAgentTask(
  spec: BuiltInTaskSpec,
): Promise<CreateBuiltInTaskResult> {
  const result: CreateBuiltInTaskResult = { created: 0, failed: 0, errors: [], taskId: null };
  const workDir = join(spec.config.root, spec.config.workDir);

  let workDirStats;
  try {
    workDirStats = statSync(workDir);
  } catch {
    throw new spec.errorClass(
      `Task directory "${spec.config.workDir}" does not exist — create it (or fix workDir) before running the ${spec.label}`,
    );
  }
  if (!workDirStats.isDirectory()) {
    throw new spec.errorClass(`Task directory "${spec.config.workDir}" is not a directory`);
  }
  try {
    accessSync(workDir, 0o2 /* W_OK */);
  } catch {
    throw new spec.errorClass(`Task directory "${spec.config.workDir}" is not writable`);
  }

  const taskId = findNextTaskId(workDir);
  const taskPath = join(workDir, `${taskId}-${slugify(spec.title)}.md`);
  const questions = spec.questions.filter((q) => q.trim().length > 0);

  // The title and every question are JSON-stringified: they always survive
  // YAML parsing, even with colons, quotes, or other metacharacters.
  const lines = [
    "---",
    `id: "${taskId}"`,
    `title: ${JSON.stringify(spec.title)}`,
    "type: chore",
    "status: inbox",
    "priority: p2",
    `area: ${spec.area}`,
    "assigned_to: unassigned",
    `created_by: ${spec.createdBy}`,
    "needs_input: true",
  ];
  if (questions.length > 0) {
    lines.push("questions:");
    for (const question of questions) lines.push(`  - ${JSON.stringify(question)}`);
  }
  const nowIso = new Date().toISOString();
  lines.push(`created_at: "${nowIso}"`, `updated_at: "${nowIso}"`, "---");

  try {
    await writeFile(taskPath, `${lines.join("\n")}\n${spec.body}`, "utf8");
    result.created++;
    result.taskId = taskId;
  } catch (err) {
    result.failed++;
    result.errors.push(`${taskPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Create the single inbox task for a Tech Debt run: every issue the scan found,
 * aggregated into one body (0439). Returns counts for created and failed
 * writes, so callers never see a silently-truncated task list. Throws
 * TechDebtError when the work dir itself is unusable (missing or read-only) —
 * the caller surfaces that to the user.
 */
export async function createTechDebtTask(
  config: RepoOSConfig,
  issues: TechDebtIssue[],
): Promise<CreateBuiltInTaskResult> {
  if (issues.length === 0) {
    return { created: 0, failed: 0, errors: [], taskId: null };
  }

  const title = `Tech Debt Agent: ${issues.length} finding${issues.length === 1 ? "" : "s"} to triage`;
  const body = formatAggregatedTaskBody(
    `The Tech Debt Agent reviewed the repository and found ${issues.length} issue${issues.length === 1 ? "" : "s"} that need a human decision. They are bundled here so one run produces one task, not one per finding.`,
    issues.map((issue) => ({
      kind: issue.type,
      file: issue.file,
      line: issue.line,
      description: issue.description,
      severity: issue.severity,
    })),
    ["Confirm each finding against the file it points at before changing anything."],
  );

  return createBuiltInAgentTask({
    config,
    title,
    area: "tech-debt",
    createdBy: "tech-debt-agent",
    body,
    questions: [
      "Which of these findings should be fixed now, and which should be deferred or dismissed?",
      "Should the accepted fixes land as one refactor pass or as one subtask per finding?",
    ],
    label: "Tech Debt Agent",
    errorClass: TechDebtError,
  });
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
 * Create the single inbox task for a Performance run: every issue the review
 * found, aggregated into one body (0439). Returns counts for created and failed
 * writes, so callers never see a silently-truncated task list. Throws
 * PerformanceError when the work dir itself is unusable.
 */
export async function createPerformanceTask(
  config: RepoOSConfig,
  issues: PerformanceIssue[],
): Promise<CreateBuiltInTaskResult> {
  if (issues.length === 0) {
    return { created: 0, failed: 0, errors: [], taskId: null };
  }

  const title = `Performance Agent: ${issues.length} finding${issues.length === 1 ? "" : "s"} to triage`;
  const body = formatAggregatedTaskBody(
    `The Performance Agent reviewed the repository and found ${issues.length} issue${issues.length === 1 ? "" : "s"} that need a human decision. They are bundled here so one run produces one task, not one per finding.`,
    issues.map((issue) => ({
      kind: issue.type,
      file: issue.file,
      line: issue.line,
      description: issue.description,
      severity: issue.severity,
    })),
    [
      "Profile the accepted findings with real-world data before optimizing — a heuristic finding is a starting point, not a measurement.",
    ],
  );

  return createBuiltInAgentTask({
    config,
    title,
    area: "performance",
    createdBy: "performance-agent",
    body,
    questions: [
      "Which of these findings is worth optimizing now, and which are acceptable as-is?",
      "What is the acceptable performance threshold for the ones we do fix?",
    ],
    label: "Performance Agent",
    errorClass: PerformanceError,
  });
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
  const startedAt = new Date();
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

  const created = await createTechDebtTask(config, issues);
  if (created.failed > 0) {
    logger?.agent("tech-debt", "error", `Failed to create ${created.failed} tech debt task(s)`, {
      errors: created.errors,
    });
  }
  if (created.created > 0) {
    logger?.agent("tech-debt", "info", `Created ${created.created} tech debt task(s)`);
  }

  const doc = recordRunDoc(
    config,
    "tech-debt",
    "Tech Debt Agent",
    {
      startedAt,
      durationMs: run.elapsedMs,
      totalTokens: run.totalTokens,
      costUsd: run.costUsd,
      scannedFiles: run.scannedFiles ?? 0,
      findings: issues.map((issue) => ({
        type: issue.type,
        file: issue.file,
        line: issue.line,
        description: issue.description,
        severity: issue.severity,
      })),
      taskId: created.taskId,
    },
    logger,
  );

  saveLastRunAt(config.root, "tech-debt", config);

  return {
    runDoc: doc?.path ?? null,
    findingsFound: issues.length,
    taskId: created.taskId,
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
    created: created.created,
    failed: created.failed,
    errors: created.errors,
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
  const startedAt = new Date();
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

  const created = await createPerformanceTask(config, issues);
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

  const doc = recordRunDoc(
    config,
    "performance",
    "Performance Agent",
    {
      startedAt,
      durationMs: run.elapsedMs,
      totalTokens: run.totalTokens,
      costUsd: run.costUsd,
      scannedFiles: run.scannedFiles ?? 0,
      findings: issues.map((issue) => ({
        type: issue.type,
        file: issue.file,
        line: issue.line,
        description: issue.description,
        severity: issue.severity,
      })),
      taskId: created.taskId,
    },
    logger,
  );

  saveLastRunAt(config.root, "performance", config);

  return {
    runDoc: doc?.path ?? null,
    findingsFound: issues.length,
    taskId: created.taskId,
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
    created: created.created,
    failed: created.failed,
    errors: created.errors,
  };
}

/**
 * Create the single inbox task for an Architect run: every issue the review
 * found, aggregated into one body (0439). The Architect used to report only —
 * its findings now reach the board the same way as any other built-in agent's,
 * bundled so one run never produces more than one task.
 */
export async function createArchitectureTask(
  config: RepoOSConfig,
  issues: ArchitectureIssue[],
): Promise<CreateBuiltInTaskResult> {
  if (issues.length === 0) {
    return { created: 0, failed: 0, errors: [], taskId: null };
  }

  const title = `Architect Agent: ${issues.length} finding${issues.length === 1 ? "" : "s"} to triage`;
  const body = formatAggregatedTaskBody(
    `The Architect Agent reviewed the repository's structure and found ${issues.length} issue${issues.length === 1 ? "" : "s"} that need a human decision. They are bundled here so one run produces one task, not one per finding.`,
    issues.map((issue) => ({
      kind: issue.type,
      file: issue.file,
      line: issue.line,
      description: issue.description,
      severity: issue.severity,
      recommendation: issue.recommendation,
    })),
    ["Confirm each finding against the code it points at before starting a refactor."],
  );

  return createBuiltInAgentTask({
    config,
    title,
    area: "architecture",
    createdBy: "architect-agent",
    body,
    questions: [
      "Do you agree with the architectural direction these findings imply, before any refactor starts?",
      "Which of these findings should be acted on now, and which are acceptable as-is?",
    ],
    label: "Architect Agent",
    errorClass: ArchitectureError,
  });
}

/**
 * Run the Architect Agent end to end through the shared skill-guided runner:
 * the configured CLI/model reviews the repo (in whatever language it uses) for
 * architecture issues, a run doc records them under `docs/agent-runs/architect/`,
 * one bundled inbox task carries whatever needs a human, and lastRunAt is
 * recorded.
 *
 * Replaces the old `SOURCE_EXTS`-filtered deterministic scan, which silently
 * matched zero files in any non-JS/TS project, and the old ad-hoc
 * `docs/agents/Architect/` report path (0439). The caller owns overlap
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
  const startedAt = new Date();
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
  if (taskCount > 0) insights.push(`${taskCount} task(s) in the backlog at the time of this run.`);

  const created = await createBundledTask("architect", logger, () =>
    createArchitectureTask(config, issues),
  );

  const doc = recordRunDoc(
    config,
    "architect",
    "Architect Agent",
    {
      startedAt,
      durationMs: run.elapsedMs,
      totalTokens: run.totalTokens,
      costUsd: run.costUsd,
      scannedFiles: run.scannedFiles ?? 0,
      findings: issues.map((issue) => ({
        type: issue.type,
        file: issue.file,
        line: issue.line,
        description: issue.description,
        severity: issue.severity,
        recommendation: issue.recommendation,
      })),
      taskId: created.taskId,
      notes: insights,
    },
    logger,
  );

  saveLastRunAt(config.root, "architect", config);

  return {
    runDoc: doc?.path ?? null,
    findingsFound: issues.length,
    taskId: created.taskId,
    issuesFound: issues.length,
    scannedFiles: run.scannedFiles ?? 0,
    taskCount,
    created: created.created,
    failed: created.failed,
    errors: created.errors,
  };
}

/**
 * Normalize the Design skill doc's free-form `type` into the three canonical
 * finding categories. The doc asks for one of the three, but an unexpected
 * label must never drop a real finding or misfile it.
 */
export function normalizeDesignFindingCategory(type: string): DesignFindingCategory {
  switch (type) {
    case "ui-bug":
    case "ux-friction":
    case "design-recommendation":
      return type;
    default: {
      const t = type.toLowerCase();
      if (
        /(access|a11y|label|keyboard|focus|contrast|nav|\bflow\b|interact|friction|disabl)/.test(t)
      ) {
        return "ux-friction";
      }
      if (/(bug|broken|overlap|overflow|clip|render|crash|theme|token|html|style)/.test(t)) {
        return "ui-bug";
      }
      return "design-recommendation";
    }
  }
}

/** Convert the shared runner's findings into the Design agent's finding shape. */
function toDesignFindings(findings: SkillGuidedFinding[]): DesignFinding[] {
  return findings.map((finding) => ({
    category: normalizeDesignFindingCategory(finding.type),
    file: finding.file ?? "(repository)",
    line: finding.line,
    description: finding.description || "UI/UX issue reported by the Design Agent",
    rationale: finding.evidence || finding.description || "Reported by the Design Agent.",
    recommendation:
      finding.recommendation ?? "Review this against the project's design system and fix it.",
    severity: finding.severity,
  }));
}

/**
 * Review the repository's web UI for UI bugs, UX friction, and design
 * improvements through the shared skill-guided runner. The agent works out
 * whether the repo has a web UI and where it lives from the repo's own
 * manifests and structure — there is no hardcoded framework or path. When the
 * repo has no web UI, {@link DesignScanResult.noUiDetected} is set instead of
 * reporting a misleading "0 files scanned".
 *
 * A model/connector failure throws {@link DesignError} with the agent named, so
 * the run route surfaces it on this agent's own settings card.
 */
export async function scanForDesignIssues(
  config: RepoOSConfig,
  logger?: Logger,
): Promise<DesignScanResult> {
  const run = await runSkillGuidedAgent(
    "design",
    config,
    DESIGN_SKILL_DOC,
    "src/server/built-in-agent-skill-docs.ts",
    logger,
  );

  if (!run.ok) {
    const message = run.error ?? "Design Agent run failed";
    logger?.agent("design", "error", message);
    throw new DesignError(message);
  }

  const noUiDetected = run.findings.some((finding) => finding.type === DESIGN_NO_UI_TYPE);
  // The "no UI" signal is not a design finding; never file it as one.
  const designFindings = run.findings.filter((finding) => finding.type !== DESIGN_NO_UI_TYPE);

  // Keep the report focused: cap findings per category. The skill doc's
  // "prefer a few high-confidence findings" is only a suggestion to the
  // model — this is the actual backstop against a verbose run flooding the
  // report (the deterministic scan this replaced had the same guardrail,
  // just at a stricter threshold appropriate to its narrower, rule-based
  // output).
  const capped: DesignFinding[] = [];
  const counts: Record<DesignFindingCategory, number> = {
    "ui-bug": 0,
    "ux-friction": 0,
    "design-recommendation": 0,
  };
  for (const finding of toDesignFindings(designFindings)) {
    if (counts[finding.category] >= MAX_DESIGN_FINDINGS_PER_CATEGORY) continue;
    counts[finding.category]++;
    capped.push(finding);
  }

  const insights: string[] = [];
  if (noUiDetected) {
    insights.push(
      "No web UI detected in this repository — looked for front-end frameworks and UI sources in the project's manifests and structure and found none.",
    );
  } else {
    insights.push(
      `Reviewed the repository for web UI sources; ${run.scannedFiles ?? 0} files were included in the bounded repo context.`,
    );
  }

  return {
    findings: capped,
    scannedFiles: run.scannedFiles ?? 0,
    insights,
    noUiDetected,
    elapsedMs: run.elapsedMs,
    totalTokens: run.totalTokens,
    costUsd: run.costUsd,
  };
}

/**
 * Create the single inbox task for a Design run: every UI/UX finding the review
 * produced, aggregated into one body (0439). The Design Agent used to report
 * only — its findings now reach the board bundled, so one run never produces
 * more than one task. It still never edits UI source itself.
 */
export async function createDesignTask(
  config: RepoOSConfig,
  scan: DesignScanResult,
): Promise<CreateBuiltInTaskResult> {
  if (scan.findings.length === 0) {
    return { created: 0, failed: 0, errors: [], taskId: null };
  }

  const count = scan.findings.length;
  const title = `Design Agent: ${count} finding${count === 1 ? "" : "s"} to triage`;
  const body = formatAggregatedTaskBody(
    `The Design Agent reviewed the repository's web UI and found ${count} finding${count === 1 ? "" : "s"} that need a human decision. They are bundled here so one run produces one task, not one per finding.`,
    scan.findings.map((finding) => ({
      kind: finding.category,
      file: finding.file,
      line: finding.line,
      description: finding.description,
      severity: finding.severity,
      evidence: finding.rationale,
      recommendation: finding.recommendation,
    })),
    ["Confirm each finding in the running UI before changing any styling or markup."],
  );

  return createBuiltInAgentTask({
    config,
    title,
    area: "design",
    createdBy: "design-agent",
    body,
    questions: [
      "Which of these UI/UX findings should be fixed, and which are acceptable as-is?",
      "Do the proposed changes match the design system this project already uses, or should the system change too?",
    ],
    label: "Design Agent",
    errorClass: DesignError,
  });
}

/**
 * Run the Design Agent end to end through the shared skill-guided runner: the
 * configured CLI/model reviews the repository's web UI (whatever its framework
 * or layout) for UI bugs, UX friction, and design improvements, a run doc
 * records what it found under `docs/agent-runs/design/`, one bundled inbox task
 * carries whatever needs a human, and lastRunAt is recorded. It still never
 * edits UI source itself.
 *
 * A model/connector failure throws {@link DesignError} so the run route
 * surfaces it on this agent's own settings card.
 */
export async function runDesignAgent(
  config: RepoOSConfig,
  logger?: Logger,
): Promise<DesignRunResult> {
  const startedAt = new Date();
  const scan = await scanForDesignIssues(config, logger);

  const created = await createBundledTask("design", logger, () => createDesignTask(config, scan));

  const doc = recordRunDoc(
    config,
    "design",
    "Design Agent",
    {
      startedAt,
      durationMs: scan.elapsedMs,
      totalTokens: scan.totalTokens,
      costUsd: scan.costUsd,
      scannedFiles: scan.scannedFiles,
      findings: scan.findings.map((finding) => ({
        type: finding.category,
        file: finding.file,
        line: finding.line,
        description: finding.description,
        severity: finding.severity,
        evidence: finding.rationale,
        recommendation: finding.recommendation,
      })),
      taskId: created.taskId,
      notes: scan.insights,
    },
    logger,
  );

  saveLastRunAt(config.root, "design", config);

  return {
    runDoc: doc?.path ?? null,
    findingsFound: scan.findings.length,
    taskId: created.taskId,
    scannedFiles: scan.scannedFiles,
    noUiDetected: scan.noUiDetected ?? false,
    created: created.created,
    failed: created.failed,
    errors: created.errors,
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
  /** Duration/token cost of the underlying model call, for the run doc (0439). */
  elapsedMs?: number;
  totalTokens?: number;
  costUsd?: number;
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

export interface DocsDebtRunResult extends BuiltInAgentRunReceipt {
  scannedDocs: number;
  /** Alias for scannedDocs, matching the generic built-in agent response shape. */
  scannedFiles: number;
  claimsChecked: number;
  trivialFixesApplied: number;
  /** Docs the agent corrected automatically this run. */
  autoFixed: DocsDebtAutoFixed[];
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
export function docsDebtSkillPath(docsDir: string): string {
  return join(docsDir, "agents", "skills", "docs-debt.md");
}

/**
 * Used only when the skill doc is missing (e.g. a fresh repo where the file
 * hasn't been created). Keeps the agent runnable rather than silently useful.
 */
function docsDebtSkillFallback(docsDir: string): string {
  return [
    "You keep this project's documentation honest.",
    `Verify concrete, checkable claims in AGENTS.md and the project's ${docsDir}/`,
    "context docs against the actual repository. Search the whole repo for",
    "the real source layout instead of assuming src/. Do not flag identifiers that",
    "belong to third-party tools rather than this project. Report only claims you",
    "have independently confirmed are stale, with precise evidence.",
  ].join("\n");
}

/** Read the docs-debt skill doc, falling back to embedded guidance. */
function loadDocsDebtSkill(root: string, docsDir: string): string {
  const skillPath = docsDebtSkillPath(docsDir);
  try {
    const content = readFileSync(join(root, skillPath), "utf8").trim();
    return content || docsDebtSkillFallback(docsDir);
  } catch {
    return docsDebtSkillFallback(docsDir);
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
 * `AGENTS.md`, and anything under the configured docs directory) is enforced here rather
 * than assumed — a "fix" naming `package.json` or a source file must never
 * auto-commit.
 */
function isDocsDebtDocPath(doc: string, docsDir: string): boolean {
  if (!doc) return false;
  if (doc === "AGENTS.md" || doc.endsWith("/AGENTS.md")) return true;
  return doc.startsWith(`${docsDir.replace(/\/+$/, "")}/`);
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
  if (!isDocsDebtDocPath(doc, config.docsDir)) return false;
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
function collectDocFiles(root: string, docsDir: string): string[] {
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
        if (IGNORED_DIRS.has(name) || name.startsWith(".") || name === AGENT_RUN_DOCS_DIR) continue;
        walk(abs);
      } else if (st.isFile() && name.endsWith(".md") && st.size <= MAX_DOC_BYTES) {
        out.push(abs);
      }
    }
  };
  walk(join(root, docsDir));
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
  const skillPath = docsDebtSkillPath(config.docsDir);
  const skillDoc = loadDocsDebtSkill(config.root, config.docsDir);
  const run = await runSkillGuidedAgent(
    "docs-debt",
    configWithDocsDebtAgent(config),
    skillDoc,
    skillPath,
    logger,
  );

  const scannedDocs = collectDocFiles(config.root, config.docsDir).length;

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
    elapsedMs: run.elapsedMs,
    totalTokens: run.totalTokens,
    costUsd: run.costUsd,
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
): Promise<CreateBuiltInTaskResult> {
  if (findings.length === 0) return { created: 0, failed: 0, errors: [], taskId: null };

  const title = "Docs debt: stale claims in agent instructions and project docs";

  let body = `## Docs Debt Findings\n\n`;
  body += `The Docs Debt Agent verified concrete claims in \`AGENTS.md\` and \`${config.docsDir}/\` against the actual repo and found ${findings.length} that need a human decision.\n\n`;
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
  body += `1. Answer the open questions in this task's frontmatter (or in the PM chat) and update the body with the decisions.\n`;
  body += `2. Confirm each finding is real drift and not a deliberate, documented difference.\n`;
  body += `3. Update the doc(s) or the code so the two agree.\n`;
  const hint = subtaskHint(findings.length);
  if (hint) body += `- ${hint}\n`;
  body += `- Move this task to done when complete.\n`;

  return createBuiltInAgentTask({
    config,
    title,
    area: "docs-debt",
    createdBy: "docs-debt-agent",
    body,
    questions: [
      "Should we fix the code issue or update the documentation?",
      "Which of these claims are deliberate, documented differences rather than drift?",
    ],
    label: "Docs Debt Agent",
    errorClass: DocsDebtError,
  });
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
  const startedAt = new Date();
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

  const task = await createBundledTask("docs-debt", logger, () =>
    createDocsDebtTask(config, findings),
  );

  const doc = recordRunDoc(
    config,
    "docs-debt",
    "Docs Debt Agent",
    {
      startedAt,
      durationMs: scan.elapsedMs,
      totalTokens: scan.totalTokens,
      costUsd: scan.costUsd,
      scannedFiles: scan.scannedDocs,
      findings: findings.map((finding) => ({
        type: finding.kind,
        file: finding.doc || undefined,
        line: finding.line,
        description: finding.claim,
        severity: finding.severity,
        evidence: finding.evidence,
        recommendation: finding.recommendation,
      })),
      taskId: task.taskId,
      notes: [
        ...(scan.error ? [`The agent run reported an error: ${scan.error}`] : []),
        ...(apply.applied > 0
          ? [`Corrected ${apply.applied} stale reference(s) automatically this run.`]
          : []),
        ...apply.fixed.map((fix) => `\`${fix.doc}\`: \`${fix.from}\` → \`${fix.to}\``),
      ],
    },
    logger,
  );

  saveLastRunAt(config.root, "docs-debt", config);

  logger?.agent("docs-debt", "info", "Docs Debt Agent run completed", {
    trivialFixesApplied: apply.applied,
    findingsFound: findings.length,
    taskCreated: task.created,
    runDoc: doc?.path ?? null,
  });

  return {
    runDoc: doc?.path ?? null,
    findingsFound: findings.length,
    taskId: task.taskId,
    scannedDocs: scan.scannedDocs,
    scannedFiles: scan.scannedDocs,
    claimsChecked: scan.claimsChecked,
    trivialFixesApplied: apply.applied,
    autoFixed: apply.fixed,
    created: task.created,
    failed: task.failed,
    errors: [...(scan.error ? [scan.error] : []), ...apply.errors, ...task.errors],
    error: scan.error,
  };
}

/** Human-facing names for the built-in agents, for run docs and notifications. */
export const BUILT_IN_AGENT_LABELS: Record<string, string> = {
  "tech-debt": "Tech Debt Agent",
  performance: "Performance Agent",
  architect: "Architect Agent",
  design: "Design Agent",
  "docs-debt": "Docs Debt Agent",
  debugger: "Debugger Agent",
};

/** Display name for a built-in agent slug; falls back to the slug itself. */
export function builtInAgentLabel(agent: string): string {
  return BUILT_IN_AGENT_LABELS[agent] ?? agent;
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
    return runDesignAgent(config, logger);
  }
  if (name === "docs-debt") {
    return runDocsDebtAgent(config, logger);
  }
  return null;
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
