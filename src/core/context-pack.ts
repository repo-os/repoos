/**
 * Task context pack generation.
 *
 * Deterministically builds a concise, bounded, human-inspectable summary of
 * everything an agent needs to know before its first tool call: the task spec,
 * applicable constraints, worktree state, likely implementation files, relevant
 * tests, verification commands, and bootstrap telemetry. The pack is
 * driver-neutral (plain markdown), path-guarded, and cached against
 * authoritative repository state so repeated turns on the same task skip the
 * generation cost.
 *
 * Zero runtime deps — `node:fs`, `node:path`, `node:crypto` only. File
 * relevance uses deterministic rules (area mapping, symbol references, import
 * graph, test proximity) rather than an extra LLM call.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import type { RepoOSConfig, Task } from "./types.js";
import type { BootstrapResult } from "./bootstrap.js";

/** Maximum byte size of a context pack before relevance-ranked truncation. */
const PACK_BYTE_BUDGET = 24 * 1024;

/** File extensions we consider source code for relevance ranking. */
const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".less",
  ".rs",
  ".go",
  ".py",
  ".rb",
  ".json",
  ".toml",
  ".yaml",
  ".yml",
  ".md",
  ".mdx",
]);

/** File extensions that are tests. */
const TEST_EXTS = new Set([
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  ".test.js",
  ".test.jsx",
  ".spec.js",
  ".spec.jsx",
  ".test.py",
  ".test.rs",
  ".test.go",
]);

/** Directories we skip altogether when scanning source files. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".repoos",
  "dist",
  ".next",
  ".nuxt",
  "build",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
]);

/** Context pack — the product handed to the agent. */
export interface ContextPack {
  /** Task id. */
  taskId: string;
  /** Generation timestamp (ISO). */
  generatedAt: string;
  /** Hash of all inputs, for cache validation. */
  cacheKey: string;
  /** Whether this pack was served from cache. */
  cacheHit: boolean;
  /** Generation duration in ms. */
  generationMs: number;
  /** The pack content (markdown). */
  content: string;
  /** Byte size of the content. */
  size: number;
  /** Bootstrap telemetry, when available. */
  bootstrap?: {
    ok: boolean;
    durationMs: number;
    steps: { name: string; ok: boolean; durationMs: number }[];
  };
}

/** A single file entry in the repo map. */
interface MapEntry {
  /** Repo-relative path. */
  path: string;
  /** File size in bytes. */
  size: number;
  /** Imports found in the file (best-effort string scan). */
  imports: string[];
  /** Last modification time (ms since epoch). */
  mtimeMs: number;
}

/** Cached file map for the whole repository. */
interface RepoMap {
  /** Hash that produced this map. */
  headHash: string;
  /** Generation timestamp. */
  generatedAt: string;
  /** All source files mapped. */
  files: MapEntry[];
  /** Source root directories tracked. */
  roots: string[];
}

/** Inputs that determine the context pack content. */
interface CacheInputs {
  headHash: string;
  taskContent: string;
  agentsContent: string;
  docsContent: string;
  /** Concatenated dependency manifest content for invalidation. */
  depHash: string;
  worktreeDirty: boolean;
  worktreeUntracked: string[];
  worktreeDiffSummary: string;
}

/** Relevance-ranked file entry in the pack. */
interface RelevantFile {
  path: string;
  reason: string;
  rank: number;
  /** Whether this file is a test. */
  isTest: boolean;
}

// ---- Repo map (stable across tasks) ----

function cacheDir(root: string, cacheDirName: string): string {
  return join(root, cacheDirName);
}

function repoMapPath(config: RepoOSConfig): string {
  return join(config.root, config.cacheDir, "repo-map.json");
}

/**
 * Best-effort HEAD hash. Returns "unknown" when git is missing or no commits
 * exist, so the cache still functions but invalidates on every run.
 */
function headHash(root: string): string {
  try {
    const run = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      timeout: 4000,
    });
    return run.status === 0 ? run.stdout.trim() : "unknown";
  } catch {
    return "unknown";
  }
}

function isTestFile(name: string): boolean {
  for (const ext of TEST_EXTS) {
    if (name.endsWith(ext)) return true;
  }
  // Also match `tests/` directory convention
  return false;
}

function isSourceFile(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return (
    SOURCE_EXTS.has(ext) ||
    // Also include files in test directories with test patterns
    isTestFile(name)
  );
}

/**
 * Extract import paths from source content using a simple regex. Handles:
 *   import ... from "./foo"
 *   import ... from "../bar"
 *   import "./side-effect"
 *   require("./x")
 * Not exhaustive, but fast and works for the vast majority of TS/JS.
 */
function extractImports(content: string): string[] {
  const out: string[] = [];
  const re = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|require\s*\()["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const spec = m[1];
    // Only keep local imports (relative paths), not package imports.
    if (spec.startsWith(".")) out.push(spec);
  }
  return out;
}

/** Walk a directory tree for source files and return map entries. */
function walkSourceFiles(dir: string, root: string, skip: Set<string>, acc: MapEntry[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || skip.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkSourceFiles(full, root, skip, acc);
    } else if (st.isFile() && isSourceFile(entry)) {
      let content = "";
      let imports: string[] = [];
      try {
        content = readFileSync(full, "utf8");
        imports = extractImports(content);
      } catch {
        /* unreadable — skip */
      }
      acc.push({
        path: relative(root, full).split("\\").join("/"),
        size: st.size,
        imports,
        mtimeMs: st.mtimeMs,
      });
    }
  }
}

/**
 * Build or load the cached repository file map. The map is stable across
 * tasks: it changes only when HEAD moves or the source tree changes. A cache
 * miss walks the source directories and caches the result keyed by HEAD hash.
 */
export function buildRepoMap(config: RepoOSConfig): { map: RepoMap; cacheHit: boolean } {
  const path = repoMapPath(config);
  const hash = headHash(config.root);
  if (existsSync(path)) {
    try {
      const cached: RepoMap = JSON.parse(readFileSync(path, "utf8"));
      if (cached.headHash === hash) return { map: cached, cacheHit: true };
    } catch {
      /* corrupt cache — rebuild */
    }
  }

  const files: MapEntry[] = [];
  const roots = ["src"];
  for (const r of roots) {
    walkSourceFiles(join(config.root, r), config.root, SKIP_DIRS, files);
  }

  const map: RepoMap = {
    headHash: hash,
    generatedAt: new Date().toISOString(),
    files,
    roots,
  };

  const dir = cacheDir(config.root, config.cacheDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(path, JSON.stringify(map));
  } catch {
    /* best-effort — cache write failure is not fatal */
  }

  return { map, cacheHit: false };
}

// ---- Cache-key building ----

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Read AGENTS.md content (or CLAUDE.md as fallback). Returns empty string
 * when neither exists.
 */
function readAgentsContent(root: string): string {
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const p = join(root, name);
    if (existsSync(p)) {
      try {
        return readFileSync(p, "utf8");
      } catch {
        /* unreadable */
      }
    }
  }
  return "";
}

/**
 * Concatenate relevant docs (docs/ dir markdown files) for cache invalidation.
 * Only includes the first 64KB to keep hashing fast.
 */
function readDocsContent(root: string, docsDir: string): string {
  const docsPath = join(root, docsDir);
  if (!existsSync(docsPath)) return "";
  let out = "";
  const walk = (dir: string) => {
    if (out.length > 64 * 1024) return;
    try {
      for (const e of readdirSync(dir)) {
        if (e.startsWith(".")) continue;
        const full = join(dir, e);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (extname(e) === ".md") {
          try {
            out += readFileSync(full, "utf8");
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip */
    }
  };
  walk(docsPath);
  return out.slice(0, 64 * 1024);
}

/** Hash of dependency manifests for cache invalidation. */
function depManifestHash(root: string): string {
  const manifests = ["package.json", "package-lock.json", "bun.lock", "bun.lockb"];
  let combined = "";
  for (const m of manifests) {
    const p = join(root, m);
    if (existsSync(p)) {
      try {
        combined += readFileSync(p, "utf8");
      } catch {
        /* skip */
      }
    }
  }
  return combined ? contentHash(combined) : "no-manifests";
}

/** Build cache inputs from the current state. */
function buildCacheInputs(
  config: RepoOSConfig,
  task: Task,
  head: string,
  worktreeDirty: boolean,
  worktreeUntracked: string[],
  worktreeDiffSummary: string,
): CacheInputs {
  return {
    headHash: head,
    taskContent: task.body,
    agentsContent: readAgentsContent(config.root),
    docsContent: readDocsContent(config.root, config.docsDir),
    depHash: depManifestHash(config.root),
    worktreeDirty,
    worktreeUntracked,
    worktreeDiffSummary,
  };
}

function inputsHash(inputs: CacheInputs): string {
  const serialized = [
    inputs.headHash,
    contentHash(inputs.taskContent),
    contentHash(inputs.agentsContent),
    contentHash(inputs.docsContent),
    inputs.depHash,
    String(inputs.worktreeDirty),
    inputs.worktreeUntracked.join(","),
    contentHash(inputs.worktreeDiffSummary),
  ].join("|");
  return contentHash(serialized);
}

function contextCachePath(config: RepoOSConfig, taskId: string): string {
  return join(config.root, config.cacheDir, `context-${taskId}.json`);
}

/**
 * Cached context pack envelope. Only the content and metadata are persisted;
 * the cache key is the filename hash trigger.
 */
interface CachedPack {
  cacheKey: string;
  generatedAt: string;
  content: string;
  size: number;
  generationMs: number;
}

// ---- Worktree state helpers ----

/**
 * Get worktree dirt summary: dirty/clean, untracked files (capped), and a
 * summary of the first 15 changed lines.
 */
function worktreeState(
  config: RepoOSConfig,
  _branch: string,
  cwd: string,
): { dirty: boolean; untracked: string[]; diffSummary: string } {
  let dirty = false;
  let untracked: string[] = [];
  let diffSummary = "";

  try {
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      timeout: 4000,
    });
    if (status.status === 0 && status.stdout.trim()) {
      dirty = true;
      const lines = status.stdout.trim().split("\n");
      const untrackedLines = lines.filter((l: string) => l.startsWith("??"));
      untracked = untrackedLines.slice(0, 20).map((l: string) => l.slice(3).trim());
    }
  } catch {
    /* best-effort */
  }

  try {
    if (dirty) {
      // Get a compact diff summary: first 15 changed files with +/- counts
      const diff = spawnSync("git", ["diff", "--stat"], { cwd, encoding: "utf8", timeout: 4000 });
      if (diff.status === 0 && diff.stdout.trim()) {
        const lines = diff.stdout.trim().split("\n");
        // The last line is the summary (e.g. "3 files changed, 12 insertions(+), 5 deletions(-)")
        // The preceding lines are per-file stats
        const fileLines = lines.slice(0, -1).slice(0, 25);
        diffSummary = fileLines.join("\n");
        const summaryLine = lines[lines.length - 1] ?? "";
        if (diffSummary) diffSummary += "\n" + summaryLine;
        else diffSummary = summaryLine;
      }
    }
  } catch {
    /* best-effort */
  }

  return { dirty, untracked, diffSummary };
}

// ---- File relevance ranking ----

/**
 * Map a task area to likely source directories. Extended as conventions grow;
 * currently covers the self-hosted RepoOS layout.
 */
function areaToDirs(area: string): string[] {
  const map: Record<string, string[]> = {
    agent: ["src/server/agents.ts", "src/server/server.ts", "src/core/git.ts"],
    server: ["src/server/"],
    core: ["src/core/"],
    cli: ["src/cli/", "src/commands/"],
    ui: ["src/ui-app/"],
    build: ["src/core/build.ts", "scripts/", "tsconfig.json"],
    config: ["src/core/config.ts", "repoos.toml"],
    git: ["src/core/git.ts"],
    tasks: [
      "src/core/task.ts",
      "src/server/write.ts",
      "src/core/indexer.ts",
      "src/core/frontmatter.ts",
    ],
    checks: ["src/commands/check.ts"],
    tests: ["src/ui-app/tests/"],
    docs: ["docs/"],
    review: ["src/server/done.ts", "src/server/write.ts"],
  };
  return map[area] ?? map[area.toLowerCase()] ?? [];
}

/**
 * Scan task body for file path references (e.g. "src/server/agents.ts").
 * Matches repo-relative paths that look like source files.
 */
function extractFileReferences(body: string): string[] {
  const out: string[] = [];
  const re = /(`|["'\s])(src\/[\w\/.-]+\.(?:ts|tsx|js|vue|css|json|md|toml))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[2]);
  }
  return [...new Set(out)];
}

/**
 * Rank files by relevance to a task using deterministic signals:
 * 1. Area → directory mapping (strong signal)
 * 2. File references in task body (strong signal)
 * 3. Import proximity (files that import or are imported by signaled files)
 * 4. Recent modification (files changed in the same areas)
 *
 * Each file gets a relevance rank (higher = more relevant). The pack includes
 * files sorted by rank, capped by the byte budget.
 */
function rankFiles(config: RepoOSConfig, task: Task, repoMap: RepoMap): RelevantFile[] {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const add = (path: string, score: number, reason: string) => {
    if (!scores.has(path)) {
      scores.set(path, { score: 0, reasons: [] });
    }
    const entry = scores.get(path)!;
    entry.score += score;
    if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
  };

  // 1. Area-based: files in mapped directories
  const areaDirs = areaToDirs(task.area);
  for (const ad of areaDirs) {
    for (const f of repoMap.files) {
      if (f.path === ad || f.path.startsWith(ad)) {
        add(f.path, 10, `area match: "${task.area}"`);
      }
    }
  }

  // 2. File references in task body
  const refs = extractFileReferences(task.body);
  for (const ref of refs) {
    const exact = repoMap.files.find((f) => f.path === ref);
    if (exact) {
      add(exact.path, 20, "task body reference");
    }
    // Partial match: file name fragment
    for (const f of repoMap.files) {
      if (f.path.includes(ref.replace(/^src\//, ""))) {
        add(f.path, 5, `partial body reference: ${ref}`);
      }
    }
  }

  // 3. Import proximity: files connected to already-scored files
  const scoredPaths = new Set(scores.keys());
  let pendingPaths = new Set(scoredPaths);
  for (let hop = 0; hop < 2; hop++) {
    const next = new Set<string>();
    for (const sp of pendingPaths) {
      const entry = repoMap.files.find((f) => f.path === sp);
      if (!entry) continue;
      for (const imp of entry.imports) {
        // Resolve relative import to an absolute repo path (best-effort)
        for (const f of repoMap.files) {
          if (f.path.endsWith(imp.replace(/^\.\//, "").replace(/\.\.\//g, ""))) {
            if (!scoredPaths.has(f.path)) {
              next.add(f.path);
              add(f.path, 4 - hop, `imported by ${sp}`);
            }
          }
        }
      }
    }
    pendingPaths = next;
  }

  // 4. Recent modifications: files with newer mtimes in scored directories
  const now = Date.now();
  const recentThreshold = now - 7 * 24 * 60 * 60 * 1000; // 7 days
  for (const f of repoMap.files) {
    if (f.mtimeMs >= recentThreshold) {
      add(f.path, 2, "recently modified (≤7 days)");
    }
  }

  // 5. Test files near relevant areas
  for (const f of repoMap.files) {
    if (isTestFile(f.path)) {
      // Check if the test path corresponds to a scored source file
      const sourcePath = f.path
        .replace(/\/tests\//, "/src/")
        .replace(/\.test\./, ".")
        .replace(/\.spec\./, ".");
      for (const sp of scoredPaths) {
        if (
          sp.includes(sourcePath.replace(/^src\//, "")) ||
          sourcePath.includes(sp.replace(/^src\//, ""))
        ) {
          add(f.path, 3, `test for relevant area`);
          break;
        }
      }
    }
  }

  // Convert to sorted array
  const result: RelevantFile[] = [];
  for (const [path, { score, reasons }] of scores) {
    if (SKIP_DIRS.has(path.split("/")[0] ?? "")) continue;
    result.push({
      path,
      reason: reasons.slice(0, 3).join("; "),
      rank: score,
      isTest: isTestFile(path),
    });
  }

  result.sort((a, b) => b.rank - a.rank);
  return result;
}

// ---- Context pack generation ----

/**
 * Render a bounded context pack as markdown. Files are included up to the
 * byte budget, with relevance-ranked truncation.
 */
function renderPack(
  config: RepoOSConfig,
  task: Task,
  branch: string,
  cwd: string,
  cacheHit: boolean,
  bootstrapResult: BootstrapResult | null,
  relevantFiles: RelevantFile[],
  worktreeInfo: { dirty: boolean; untracked: string[]; diffSummary: string },
): string {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push("## Task Context Pack");
  push("");
  push(`**Task:** #${task.id} — ${task.title}`);
  push(`**Area:** ${task.area || "unset"}`);
  push(`**Type:** ${task.type}`);
  push(`**Priority:** ${task.priority}`);
  push(`**Cache:** ${cacheHit ? "hit" : "miss"}`);
  push("");

  push("### Task Specification");
  push("");
  // Include the task body (up to 3KB to leave budget for other sections)
  const bodyMax = 3 * 1024;
  const body =
    task.body.length > bodyMax ? task.body.slice(0, bodyMax) + "\n\n... (truncated)" : task.body;
  push(body || "(no task body)");
  push("");

  // ---- Worktree State ----
  push("### Worktree State");
  push("");
  push(`**Root:** ${config.root}`);
  push(`**Branch:** ${branch}`);
  push(`**Worktree:** ${cwd}`);
  push(
    `**Dirty:** ${worktreeInfo.dirty ? "YES — uncommitted changes or untracked files" : "clean"}`,
  );
  if (worktreeInfo.untracked.length > 0) {
    push("**Untracked files:**");
    for (const u of worktreeInfo.untracked.slice(0, 10)) {
      push(`  - ${u}`);
    }
    if (worktreeInfo.untracked.length > 10) {
      push(`  ... and ${worktreeInfo.untracked.length - 10} more`);
    }
  }
  if (worktreeInfo.diffSummary) {
    push("");
    push("**Dirty diff summary:**");
    push("```");
    push(worktreeInfo.diffSummary);
    push("```");
  }
  push("");

  // ---- AGENTS Constraints ----
  const agentsContent = readAgentsContent(config.root);
  if (agentsContent) {
    push("### Applicable Constraints (AGENTS.md)");
    push("");
    // Include the first 2KB of AGENTS.md — enough for the operating loop
    // and rules without ballooning the pack.
    const agentsMax = 2 * 1024;
    const agents =
      agentsContent.length > agentsMax
        ? agentsContent.slice(0, agentsMax) +
          "\n\n... (AGENTS.md truncated — read the full file when needed)"
        : agentsContent;
    push(agents);
    push("");
  }

  // ---- Likely Implementation Files ----
  push("### Likely Implementation Files");
  push("");
  let fileBudget = PACK_BYTE_BUDGET;
  // Estimate current size
  let currentSize = lines.join("\n").length;
  fileBudget = Math.max(fileBudget - currentSize, 4 * 1024);

  let fileBytes = 0;
  const maxFiles = 20;
  const included: RelevantFile[] = [];

  for (const f of relevantFiles) {
    if (included.length >= maxFiles) break;
    const line = `- \`${f.path}\``;
    const reasonLine = `  ${f.isTest ? "[TEST] " : ""}${f.reason} (rank=${f.rank})`;
    const entryBytes = line.length + reasonLine.length + 2;
    if (fileBytes + entryBytes > fileBudget) break;
    included.push(f);
    fileBytes += entryBytes;
  }

  // Group by source vs test
  const sources = included.filter((f) => !f.isTest);
  const tests = included.filter((f) => f.isTest);

  if (sources.length > 0) {
    push("**Source files:**");
    for (const f of sources) {
      push(`- \`${f.path}\`  \n  ${f.reason} (rank=${f.rank})`);
    }
    push("");
  }

  if (tests.length > 0) {
    push("**Test files:**");
    for (const f of tests) {
      push(`- \`${f.path}\`  \n  [TEST] ${f.reason} (rank=${f.rank})`);
    }
    push("");
  }

  if (sources.length === 0 && tests.length === 0) {
    push("_(no high-relevance files identified — scan the source tree)_");
    push("");
  }

  // ---- Verification Commands ----
  push("### Verification Commands");
  push("");
  push("```bash");
  push("repoos check         # full check: build, typecheck, tests, UI smoke test");
  push("bun run build        # compile (or `npm run build`)");
  push("bun run test         # test suite (or `npm test`)");
  push("bun run build:ui     # UI-only build");
  push("```");
  push("");

  // ---- Managed Preview ----
  push("### Managed Preview");
  push("");
  push("RepoOS serves a read-only preview of the worktree — you never need localhost or a port:");
  push(
    "- Preview requests are the human's to make — the human requests one manually from the UI when they want to see a change. Do NOT auto-request one before handoff.",
  );
  push(
    "- Request (only if the human explicitly asks you to verify a change the way a browser would see it): emit the exact signal line `::repoos-preview-request::` in your response",
  );
  push(
    "- RepoOS validates your live run, starts the preview from your worktree, probes it server-side, and records the preview URL + result in your transcript",
  );
  push("- View: the recorded preview URL (or the UI's Preview button)");
  push("- Stop: `POST /api/tasks/:id/preview/stop` or close via UI");
  push("- Previews are ephemeral: they stop when the task leaves active/review");
  push("");

  // ---- Bootstrap Telemetry ----
  if (bootstrapResult) {
    push("### Bootstrap Telemetry");
    push("");
    push(`**Outcome:** ${bootstrapResult.ok ? "PASSED" : "FAILED"}`);
    push(`**Duration:** ${bootstrapResult.durationMs}ms`);
    if (!bootstrapResult.ok && bootstrapResult.reason) {
      push(`**Failure:** ${bootstrapResult.reason}`);
    }
    push("**Steps:**");
    for (const step of bootstrapResult.steps) {
      const icon = step.ok ? "✓" : "✗";
      push(
        `  ${icon} ${step.name} (${step.durationMs}ms)${step.detail ? ` — ${step.detail}` : ""}`,
      );
    }
    push("");
  }

  // ---- Git Workflow ----
  push("### Git Workflow");
  push("");
  push(`- Work on branch \`${branch}\` in \`${cwd}\``);
  push(`- The main checkout is at \`${config.root}\``);
  push("- Commit to the branch; never force-push");

  return lines.join("\n");
}

/**
 * Generate a task context pack. Uses a two-layer cache:
 * 1. Repo map (file structure + imports) — stable across tasks, keyed by HEAD
 * 2. Context pack — task-specific, keyed by all inputs that affect it
 *
 * Returns the pack with metadata including cache hit/miss and timing.
 */
export function generateContextPack(
  config: RepoOSConfig,
  task: Task,
  branch: string,
  cwd: string,
  bootstrapResult: BootstrapResult | null,
): ContextPack {
  const start = Date.now();
  const head = headHash(config.root);

  // Worktree state
  const wtState = worktreeState(config, branch, cwd);

  // Build cache inputs
  const inputs = buildCacheInputs(
    config,
    task,
    head,
    wtState.dirty,
    wtState.untracked,
    wtState.diffSummary,
  );
  const key = inputsHash(inputs);

  // Check task-specific cache
  const cachePath = contextCachePath(config, task.id);
  if (existsSync(cachePath)) {
    try {
      const cached: CachedPack = JSON.parse(readFileSync(cachePath, "utf8"));
      if (cached.cacheKey === key) {
        return {
          taskId: task.id,
          generatedAt: cached.generatedAt,
          cacheKey: key,
          cacheHit: true,
          generationMs: Date.now() - start,
          content: cached.content,
          size: cached.size,
          bootstrap: bootstrapResult
            ? {
                ok: bootstrapResult.ok,
                durationMs: bootstrapResult.durationMs,
                steps: bootstrapResult.steps.map((s) => ({
                  name: s.name,
                  ok: s.ok,
                  durationMs: s.durationMs,
                })),
              }
            : undefined,
        };
      }
    } catch {
      /* corrupt — rebuild */
    }
  }

  // Build repo map (its own cache layer)
  const { map: repoMap } = buildRepoMap(config);

  // Rank relevant files
  const relevantFiles = rankFiles(config, task, repoMap);

  // Render the pack
  const content = renderPack(
    config,
    task,
    branch,
    cwd,
    false,
    bootstrapResult,
    relevantFiles,
    wtState,
  );
  const size = content.length;

  // Persist in task cache
  const cached: CachedPack = {
    cacheKey: key,
    generatedAt: new Date().toISOString(),
    content,
    size,
    generationMs: Date.now() - start,
  };

  const dir = cacheDir(config.root, config.cacheDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(cachePath, JSON.stringify(cached));
  } catch {
    /* best-effort */
  }

  return {
    taskId: task.id,
    generatedAt: cached.generatedAt,
    cacheKey: key,
    cacheHit: false,
    generationMs: cached.generationMs,
    content,
    size,
    bootstrap: bootstrapResult
      ? {
          ok: bootstrapResult.ok,
          durationMs: bootstrapResult.durationMs,
          steps: bootstrapResult.steps.map((s) => ({
            name: s.name,
            ok: s.ok,
            durationMs: s.durationMs,
          })),
        }
      : undefined,
  };
}

/**
 * Build a compact resume preamble for a dirty worktree — surfaces existing
 * partial changes so a resumed agent doesn't rediscover them from scratch.
 */
export function resumePreamble(
  config: RepoOSConfig,
  _task: Task,
  branch: string,
  cwd: string,
): string {
  const wtState = worktreeState(config, branch, cwd);
  if (!wtState.dirty) return "";

  const lines: string[] = [];
  lines.push("## Resume State");
  lines.push("");
  lines.push("The worktree has existing changes from a previous turn:");
  lines.push("");

  if (wtState.untracked.length > 0) {
    lines.push("**Untracked files (not yet committed):**");
    for (const u of wtState.untracked.slice(0, 15)) {
      lines.push(`  - ${u}`);
    }
    lines.push("");
  }

  if (wtState.diffSummary) {
    lines.push("**Changes from prior turn:**");
    lines.push("```");
    lines.push(wtState.diffSummary);
    lines.push("```");
    lines.push("");
  }

  lines.push("Review these changes before editing — you are continuing prior work.");
  return lines.join("\n");
}
