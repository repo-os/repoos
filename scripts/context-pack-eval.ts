#!/usr/bin/env bun
/**
 * Context-pack recall evaluation (#0650).
 *
 * Measures how well the "Likely Implementation Files" list in a task's cached
 * context pack covers the `src/` files that task actually committed. Uses:
 *
 *   - the cached packs under `<root>/.repoos/context-<id>.json` for the "before"
 *     (whatever ranker produced them);
 *   - git history (`<id>` in the commit subject) for the ground-truth changed
 *     files;
 *   - the current worktree's ranker for the "after".
 *
 * This is a measurement tool, not part of `repoos check`. Run it from the
 * checkout whose history/caches you want to measure:
 *
 *   bun scripts/context-pack-eval.ts                 # cwd is the repo root
 *   bun scripts/context-pack-eval.ts --root /path    # explicit repo root
 *   bun scripts/context-pack-eval.ts --limit 50      # sample the first N tasks
 *
 * Caveats (same as the task write-up): the pack is the last cached one per
 * task, not necessarily the first; "files changed" is a proxy for "files the
 * agent needed" — it misses files read but not edited, and it counts every
 * file a task touched even if the pack could not have known about it.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { buildRepoMap, rankFiles, type RelevantFile } from "../src/core/context-pack.js";
import { parseTask } from "../src/core/task.js";
import type { RepoOSConfig, Task } from "../src/core/types.js";

interface Args {
  root: string;
  cacheDir: string;
  workDir: string;
  docsDir: string;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const root = resolve(gitRoot() ?? ".");
  const args: Args = {
    root,
    cacheDir: ".repoos",
    workDir: "work",
    docsDir: "docs",
    limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") args.root = resolve(argv[++i]);
    else if (a === "--cache-dir") args.cacheDir = argv[++i];
    else if (a === "--work-dir") args.workDir = argv[++i];
    else if (a === "--docs-dir") args.docsDir = argv[++i];
    else if (a === "--limit") args.limit = Number.parseInt(argv[++i] ?? "0", 10) || 0;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "Usage: bun scripts/context-pack-eval.ts [options]",
      "",
      "  --root <path>        repo root (default: git toplevel of cwd)",
      "  --cache-dir <name>   cache dir name (default: .repoos)",
      "  --work-dir <name>    task dir (default: work)",
      "  --docs-dir <name>    docs dir (default: docs)",
      "  --limit <n>          only evaluate the first N tasks (0 = all)",
    ].join("\n"),
  );
}

function gitRoot(): string | null {
  try {
    // `--git-common-dir` resolves to the canonical checkout's `.git` even when
    // run from a linked task worktree, which is where the shared pack cache
    // lives. Fall back to the plain toplevel for older git.
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return resolve(common, "..");
  } catch {
    /* fall through */
  }
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Repo-relative `src/` files changed by every commit whose subject names the task. */
function changedSrcFiles(root: string, taskId: string): string[] {
  const out = new Set<string>();
  let commits: string[];
  try {
    const log = git(root, ["log", "--all", "--format=%H", "--grep", `(${taskId})`]);
    commits = log.split("\n").filter(Boolean);
  } catch {
    return [];
  }
  for (const sha of commits) {
    let names: string[];
    try {
      names = git(root, ["show", "--name-only", "--format=", sha]).split("\n").filter(Boolean);
    } catch {
      continue;
    }
    for (const n of names) if (n.startsWith("src/")) out.add(n);
  }
  return [...out];
}

/** Paths listed under "### Likely Implementation Files" in a cached pack. */
function packedFiles(content: string): string[] {
  const start = content.indexOf("### Likely Implementation Files");
  if (start === -1) return [];
  const rest = content.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);
  const out: string[] = [];
  const re = /^- `([^`]+)`/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) out.push(m[1]);
  return out;
}

function readTaskBody(root: string, workDir: string, taskId: string): string | null {
  const dir = join(root, workDir);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find(
    (f) => f.startsWith(`${taskId}-`) && f.endsWith(".md") && !f.includes(".attachments"),
  );
  if (!file) return null;
  return readFileSync(join(dir, file), "utf8");
}

/** Task object built from the canonical work file, with only the fields the ranker reads. */
function taskForRanking(root: string, workDir: string, taskId: string): Task | null {
  const content = readTaskBody(root, workDir, taskId);
  if (content === null) return null;
  const absPath = join(root, workDir, `${taskId}-task.md`);
  return parseTask({
    content,
    absPath,
    root,
    defaultStatus: "done",
    defaultAssignee: "ai",
  });
}

interface Metrics {
  n: number;
  mean: number;
  median: number;
  zeroRate: number;
  precision: number;
}

function metrics(recalls: number[], precisions: number[]): Metrics {
  const n = recalls.length;
  if (n === 0) return { n, mean: 0, median: 0, zeroRate: 0, precision: 0 };
  const sorted = [...recalls].sort((a, b) => a - b);
  const mean = recalls.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor(n / 2)]!;
  const zeroRate = recalls.filter((r) => r === 0).length / n;
  const precision = precisions.reduce((a, b) => a + b, 0) / n;
  return { n, mean, median, zeroRate, precision };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function relevantToPaths(files: RelevantFile[]): string[] {
  return files.slice(0, 20).map((f) => f.path);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const config: RepoOSConfig = {
    root: args.root,
    workDir: args.workDir,
    docsDir: args.docsDir,
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: args.cacheDir,
  };

  const cacheDir = join(args.root, args.cacheDir);
  if (!existsSync(cacheDir)) {
    console.error(`No cache dir at ${cacheDir}`);
    process.exit(1);
  }
  let packs = readdirSync(cacheDir)
    .filter((f) => /^context-\d+\.json$/.test(f))
    .sort();
  if (args.limit > 0) packs = packs.slice(0, args.limit);
  if (packs.length === 0) {
    console.error(`No cached context packs found under ${cacheDir}`);
    process.exit(1);
  }

  console.log(`Evaluating ${packs.length} cached pack(s) against git history in ${args.root}`);
  const { map, cacheHit } = buildRepoMap(config);
  console.log(
    `Repo map: ${map.files.length} files (${cacheHit ? "cache hit" : "rebuilt"}), indexVersion ${map.indexVersion}`,
  );

  const oldRecalls: number[] = [];
  const oldPrecisions: number[] = [];
  const newRecalls: number[] = [];
  const newPrecisions: number[] = [];
  const unionRecalls: number[] = [];
  const unionPrecisions: number[] = [];
  let skippedMissingTask = 0;

  for (const packFile of packs) {
    const id = packFile.replace(/^context-/, "").replace(/\.json$/, "");
    const actual = changedSrcFiles(args.root, id);
    if (actual.length === 0) continue;

    const task = taskForRanking(args.root, args.workDir, id);
    if (!task) {
      skippedMissingTask++;
      continue;
    }

    let oldFiles: string[] = [];
    try {
      const cached = JSON.parse(readFileSync(join(cacheDir, packFile), "utf8")) as {
        content?: string;
      };
      oldFiles = packedFiles(cached.content ?? "");
    } catch {
      continue;
    }

    const newFiles = relevantToPaths(rankFiles(config, task, map));

    const actualSet = new Set(actual);
    const oldHits = oldFiles.filter((f) => actualSet.has(f)).length;
    const newHits = newFiles.filter((f) => actualSet.has(f)).length;
    const unionSet = new Set([...oldFiles, ...newFiles]);
    const unionHits = [...unionSet].filter((f) => actualSet.has(f)).length;

    oldRecalls.push(oldHits / actual.length);
    newRecalls.push(newHits / actual.length);
    unionRecalls.push(unionHits / actual.length);
    oldPrecisions.push(oldHits / Math.max(oldFiles.length, 1));
    newPrecisions.push(newHits / Math.max(newFiles.length, 1));
    unionPrecisions.push(unionHits / Math.max(unionSet.size, 1));
  }

  const oldM = metrics(oldRecalls, oldPrecisions);
  const newM = metrics(newRecalls, newPrecisions);
  const unionM = metrics(unionRecalls, unionPrecisions);

  console.log("");
  console.log(`Tasks evaluated:        ${oldM.n}`);
  console.log(`Skipped (no task file): ${skippedMissingTask}`);
  console.log("");
  console.log("method          | mean recall | median | zero-hit | precision");
  console.log("----------------|-------------|--------|----------|----------");
  const row = (name: string, m: Metrics) =>
    `${name.padEnd(15)} | ${pct(m.mean).padStart(11)} | ${pct(m.median).padStart(6)} | ${pct(m.zeroRate).padStart(8)} | ${pct(m.precision)}`;
  console.log(row("cached pack", oldM));
  console.log(row("new ranker", newM));
  console.log(row("union", unionM));

  const meanDelta = newM.mean - oldM.mean;
  const zeroDelta = newM.zeroRate - oldM.zeroRate;
  console.log("");
  console.log(
    `New vs cached: mean recall ${meanDelta >= 0 ? "+" : ""}${pct(meanDelta)}, zero-hit ${zeroDelta >= 0 ? "+" : ""}${pct(zeroDelta)}`,
  );
  if (meanDelta < 0) {
    console.error("REGRESSION: the new ranker has lower mean recall than the cached packs.");
    process.exit(1);
  }
}

main();
