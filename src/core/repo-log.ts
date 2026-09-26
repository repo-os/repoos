/**
 * Read-only git history for the Context page History tab.
 *
 * Every git invocation is argv (never a shell string). Inputs are validated
 * before they reach `git`. Output is a machine format with unit-separator
 * fields and a NUL record terminator — never parsed from human `git log`
 * pretty-print.
 */
import { isGitRepo, runGit, type DiffResult } from "./git.js";

export const DEFAULT_LOG_LIMIT = 50;
export const MAX_LOG_LIMIT = 100;
const LOG_TIMEOUT_MS = 15_000;
const DIFF_TIMEOUT_MS = 15_000;
const MAX_DIFF_BYTES = 256_000;

/** Unit separator between log fields. Body is last so it may contain the rest. */
const US = "\x1f";
const RECORD_NUL = "\0";

/**
 * Hash, short, subject, author, email, ISO date, decorate, parents, then body.
 * Body last so newlines (and stray unit separators) do not shift earlier fields.
 */
const LOG_FORMAT = `${["%H", "%h", "%s", "%an", "%ae", "%aI", "%D", "%P", "%b"].join("%x1f")}%x00`;

const SHA_RE = /^[0-9a-f]{4,40}$/i;
const BRANCH_RE = /^(?!-)[A-Za-z0-9._/-]+$/;

export interface RepoCommit {
  sha: string;
  shortSha: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  date: string;
  refs: string[];
  parents: string[];
  taskId: string | null;
}

export interface RepoCommitFile {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "deleted" | "modified" | "binary";
}

export interface RepoCommitDetail extends RepoCommit {
  files: RepoCommitFile[];
  patch: string;
  truncated: boolean;
}

export interface RepoLogPage {
  ok: true;
  commits: RepoCommit[];
  nextCursor: string | null;
  branch: string;
  defaultBranch: string;
}

export interface RepoBranchList {
  ok: true;
  defaultBranch: string;
  branches: string[];
}

export type RepoLogError = { ok: false; error: string; code: "not-git" | "invalid" | "missing" };

export function isValidSha(value: string): boolean {
  return SHA_RE.test(value);
}

export function isValidBranch(value: string): boolean {
  if (!value || value.length > 255) return false;
  if (value.includes("..") || value.includes("//") || value.includes("@{")) return false;
  if (value.endsWith("/") || value.endsWith(".")) return false;
  return BRANCH_RE.test(value);
}

export function isValidPathFilter(value: string): boolean {
  if (!value || value.length > 1024) return false;
  if (value.startsWith("/") || value.startsWith("~")) return false;
  if (value.includes("\0") || value.includes("\\")) return false;
  const parts = value.split("/");
  if (parts.some((p) => p === ".." || p === "")) return false;
  return true;
}

/** `type(NNNN): subject` — the RepoOS commit-message convention. */
export function extractTaskId(subject: string): string | null {
  const m = subject.match(/^[A-Za-z][\w-]*\((\d{4,})\):/);
  return m?.[1] ?? null;
}

export function parseDecorations(raw: string): string[] {
  if (!raw.trim()) return [];
  const refs: string[] = [];
  for (const piece of raw.split(",")) {
    const token = piece.trim();
    if (!token) continue;
    if (token === "HEAD") {
      refs.push("HEAD");
      continue;
    }
    const head = token.match(/^HEAD -> (.+)$/);
    if (head?.[1]) {
      refs.push("HEAD", head[1]);
      continue;
    }
    const tag = token.match(/^tag: (.+)$/);
    if (tag?.[1]) {
      refs.push(tag[1]);
      continue;
    }
    refs.push(token);
  }
  return [...new Set(refs)];
}

function splitFields(record: string, count: number): string[] {
  const out: string[] = [];
  let rest = record;
  for (let i = 0; i < count - 1; i++) {
    const idx = rest.indexOf(US);
    if (idx < 0) {
      out.push(rest);
      return out;
    }
    out.push(rest.slice(0, idx));
    rest = rest.slice(idx + 1);
  }
  out.push(rest);
  return out;
}

/** Parse NUL-terminated `--format` records from `git log`. Exported for tests. */
export function parseGitLogOutput(stdout: string): RepoCommit[] {
  const commits: RepoCommit[] = [];
  const records = stdout.split(RECORD_NUL);
  for (const raw of records) {
    const record = raw.replace(/^\n+/, "");
    if (!record.trim()) continue;
    const parts = splitFields(record, 9);
    if (parts.length < 8 || !parts[0]) continue;
    const sha = parts[0]!.trim();
    const shortSha = (parts[1] || sha.slice(0, 7)).trim();
    const subject = parts[2] ?? "";
    commits.push({
      sha,
      shortSha,
      subject,
      authorName: parts[3] ?? "",
      authorEmail: parts[4] ?? "",
      date: parts[5] ?? "",
      refs: parseDecorations(parts[6] ?? ""),
      parents: (parts[7] ?? "").trim() ? (parts[7] ?? "").trim().split(/\s+/) : [],
      body: (parts[8] ?? "").replace(/\n+$/, ""),
      taskId: extractTaskId(subject),
    });
  }
  return commits;
}

function clampLimit(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw)) return DEFAULT_LOG_LIMIT;
  return Math.min(MAX_LOG_LIMIT, Math.max(1, Math.floor(raw)));
}

async function gitOk(root: string, args: string[], timeout = 4000): Promise<string | null> {
  const run = await runGit(root, args, timeout);
  if (run.status !== 0 || run.timedOut) return null;
  return run.stdout.trim();
}

export async function resolveDefaultBranch(root: string): Promise<string> {
  const mainRun = await runGit(root, ["show-ref", "--verify", "--quiet", "refs/heads/main"], 4000);
  if (mainRun.status === 0 && !mainRun.timedOut) return "main";
  const master = await runGit(root, ["show-ref", "--verify", "--quiet", "refs/heads/master"], 4000);
  if (master.status === 0 && !master.timedOut) return "master";
  const current = await gitOk(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current && current !== "HEAD") return current;
  return "HEAD";
}

export async function listRepoBranches(root: string): Promise<RepoBranchList | RepoLogError> {
  if (!isGitRepo(root)) return { ok: false, error: "not a git repository", code: "not-git" };
  const defaultBranch = await resolveDefaultBranch(root);
  const out = await gitOk(root, ["branch", "--format=%(refname:short)"], 8000);
  const names = (out ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(names)];
  unique.sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.localeCompare(b);
  });
  return { ok: true, defaultBranch, branches: unique };
}

export async function listRepoLog(
  root: string,
  opts: { branch?: string; path?: string; limit?: number; before?: string } = {},
): Promise<RepoLogPage | RepoLogError> {
  if (!isGitRepo(root)) return { ok: false, error: "not a git repository", code: "not-git" };

  const defaultBranch = await resolveDefaultBranch(root);
  const branch = opts.branch?.trim() || defaultBranch;
  if (!isValidBranch(branch) && branch !== "HEAD") {
    return { ok: false, error: "invalid branch", code: "invalid" };
  }
  if (opts.path && !isValidPathFilter(opts.path)) {
    return { ok: false, error: "invalid path", code: "invalid" };
  }
  if (opts.before && !isValidSha(opts.before)) {
    return { ok: false, error: "invalid before cursor", code: "invalid" };
  }

  const limit = clampLimit(opts.limit);
  const revision = opts.before ?? branch;
  const fetchCount = opts.before ? limit + 2 : limit + 1;
  const args = [
    "log",
    `--max-count=${fetchCount}`,
    `--pretty=format:${LOG_FORMAT}`,
    "--decorate=short",
    revision,
  ];
  if (opts.path) args.push("--", opts.path);

  const run = await runGit(root, args, LOG_TIMEOUT_MS);
  if (run.timedOut) return { ok: false, error: "git log timed out", code: "missing" };
  if (run.status !== 0) {
    const err = run.stderr.trim() || "git log failed";
    if (/not a git|not a valid object|unknown revision|bad revision/i.test(err)) {
      return { ok: false, error: err, code: "missing" };
    }
    return { ok: false, error: err, code: "invalid" };
  }

  let commits = parseGitLogOutput(run.stdout);
  if (opts.before) {
    const cursor = opts.before.toLowerCase();
    const idx = commits.findIndex(
      (c) => c.sha.toLowerCase() === cursor || c.sha.toLowerCase().startsWith(cursor),
    );
    commits = idx >= 0 ? commits.slice(idx + 1) : commits;
  }
  const hasMore = commits.length > limit;
  commits = commits.slice(0, limit);
  const nextCursor = hasMore ? (commits[commits.length - 1]?.sha ?? null) : null;
  return { ok: true, commits, nextCursor, branch, defaultBranch };
}

function parseCommitNumstat(statOutput: string): RepoCommitFile[] {
  const files: RepoCommitFile[] = [];
  for (const line of statOutput.split("\n")) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;
    const path = match[3]!.replace(/^.*\t/, ""); // rename: "old\tnew"
    const binary = match[1] === "-" || match[2] === "-";
    const additions = binary ? 0 : parseInt(match[1]!, 10);
    const deletions = binary ? 0 : parseInt(match[2]!, 10);
    let status: RepoCommitFile["status"] = "modified";
    if (binary) status = "binary";
    else if (additions > 0 && deletions === 0) status = "added";
    else if (deletions > 0 && additions === 0) status = "deleted";
    files.push({ path, additions, deletions, status });
  }
  return files;
}

function truncatePatch(stdout: string): DiffResult {
  const buf = Buffer.from(stdout, "utf8");
  if (buf.byteLength <= MAX_DIFF_BYTES) return { patch: stdout, truncated: false };
  let truncated = stdout;
  while (Buffer.from(truncated, "utf8").byteLength > MAX_DIFF_BYTES) {
    truncated = truncated.slice(0, -1024);
  }
  truncated += `\n\n--- diff truncated (${(buf.byteLength / 1024).toFixed(0)} kB total) ---`;
  return { patch: truncated, truncated: true };
}

export async function getRepoCommit(
  root: string,
  sha: string,
): Promise<RepoCommitDetail | RepoLogError> {
  if (!isGitRepo(root)) return { ok: false, error: "not a git repository", code: "not-git" };
  if (!isValidSha(sha)) return { ok: false, error: "invalid sha", code: "invalid" };

  const metaRun = await runGit(root, ["log", "-1", `--pretty=format:${LOG_FORMAT}`, sha], 8000);
  if (metaRun.status !== 0 || metaRun.timedOut) {
    return { ok: false, error: "commit not found", code: "missing" };
  }
  const [commit] = parseGitLogOutput(metaRun.stdout);
  if (!commit) return { ok: false, error: "commit not found", code: "missing" };

  const statRun = await runGit(
    root,
    ["diff-tree", "--no-commit-id", "--root", "-r", "--numstat", sha],
    DIFF_TIMEOUT_MS,
  );
  const files =
    statRun.status === 0 && !statRun.timedOut ? parseCommitNumstat(statRun.stdout.trim()) : [];

  const patchRun = await runGit(
    root,
    ["diff-tree", "--no-commit-id", "--root", "-r", "--patch", sha],
    DIFF_TIMEOUT_MS,
  );
  const patchOut = patchRun.status === 0 || patchRun.stdout ? patchRun.stdout : "";
  const { patch, truncated } = truncatePatch(patchOut);

  return { ...commit, files, patch, truncated };
}

export async function getCommitFileContents(
  root: string,
  sha: string,
  filePath: string,
): Promise<
  | { ok: true; before: string; after: string; existsBefore: boolean; existsAfter: boolean }
  | RepoLogError
> {
  if (!isGitRepo(root)) return { ok: false, error: "not a git repository", code: "not-git" };
  if (!isValidSha(sha)) return { ok: false, error: "invalid sha", code: "invalid" };
  if (!isValidPathFilter(filePath)) return { ok: false, error: "invalid path", code: "invalid" };

  const afterRun = await runGit(root, ["show", `${sha}:${filePath}`], 10_000);
  const beforeRun = await runGit(root, ["show", `${sha}^:${filePath}`], 10_000);
  return {
    ok: true,
    after: afterRun.status === 0 && !afterRun.timedOut ? afterRun.stdout : "",
    before: beforeRun.status === 0 && !beforeRun.timedOut ? beforeRun.stdout : "",
    existsAfter: afterRun.status === 0 && !afterRun.timedOut,
    existsBefore: beforeRun.status === 0 && !beforeRun.timedOut,
  };
}
