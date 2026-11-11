/**
 * Guards against build output, oversized files, and secret patterns in task
 * branch diffs and engineer WIP checkpoint commits (#1096).
 */
import * as nodeZlib from "node:zlib";
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { CheckConfig } from "./types.js";

const { gunzipSync, inflateSync, unzipSync } = nodeZlib;
const zstdDecompressSync = (nodeZlib as { zstdDecompressSync?: typeof gunzipSync })
  .zstdDecompressSync;

export const DEFAULT_MAX_ADDED_FILE_BYTES = 1_048_576;
export const DEFAULT_CHECKPOINT_MAX_FILES = 200;
export const DEFAULT_CHECKPOINT_MAX_BYTES = 5_242_880;
export const DEFAULT_MAX_DECOMPRESS_BYTES = 4_194_304;
export const DEFAULT_MAX_SCAN_FILES = 500;
export const DEFAULT_MAX_COMPRESSED_PROBE_OFFSETS = 512;
/** Refuse decompression when compressed size × ratio could exceed the output cap (#1096 r3). */
export const MAX_COMPRESSION_EXPANSION_RATIO = 32;

/** Built-in path segments / suffixes that must never enter git (#1096). */
export const DEFAULT_BUILD_OUTPUT_PATTERNS = [
  "**/.derived-data/**",
  "**/.derived-data*/**",
  "**/DerivedData/**",
  "**/.build/**",
  "**/*.xcresult/**",
];

export interface BranchArtifactGuardOptions {
  maxAddedFileBytes?: number;
  checkpointMaxFiles?: number;
  checkpointMaxBytes?: number;
  buildOutputPatterns?: string[];
  largeFileAllowlist?: string[];
  maxDecompressBytes?: number;
  maxScanFiles?: number;
  maxCompressedProbeOffsets?: number;
}

export interface SecretHit {
  type: string;
  path: string;
  suffix: string;
}

export interface ScanIncomplete {
  path: string;
  reason: string;
}

export type BranchArtifactGuardConfig = CheckConfig | BranchArtifactGuardOptions | undefined;

const CHECK_CONFIG_ARTIFACT_KEYS = [
  "branchArtifactsMaxFileBytes",
  "branchArtifactsAllowlist",
  "branchArtifactsMaxDecompressBytes",
  "branchArtifactsMaxScanFiles",
  "checkpointMaxStagedFiles",
  "checkpointMaxStagedBytes",
  "buildOutputPatterns",
] as const;

function isCheckConfigArtifactSource(check: BranchArtifactGuardConfig): check is CheckConfig {
  if (!check || typeof check !== "object") return false;
  return CHECK_CONFIG_ARTIFACT_KEYS.some((k) => k in check);
}

export function resolveBranchArtifactGuardOptions(
  check: BranchArtifactGuardConfig,
): Required<BranchArtifactGuardOptions> {
  const c = isCheckConfigArtifactSource(check) ? check : undefined;
  const o = check && !c ? (check as BranchArtifactGuardOptions) : {};
  return {
    maxAddedFileBytes:
      c?.branchArtifactsMaxFileBytes ?? o.maxAddedFileBytes ?? DEFAULT_MAX_ADDED_FILE_BYTES,
    checkpointMaxFiles:
      c?.checkpointMaxStagedFiles ?? o.checkpointMaxFiles ?? DEFAULT_CHECKPOINT_MAX_FILES,
    checkpointMaxBytes:
      c?.checkpointMaxStagedBytes ?? o.checkpointMaxBytes ?? DEFAULT_CHECKPOINT_MAX_BYTES,
    buildOutputPatterns: c?.buildOutputPatterns?.length
      ? c.buildOutputPatterns
      : o.buildOutputPatterns?.length
        ? o.buildOutputPatterns
        : DEFAULT_BUILD_OUTPUT_PATTERNS,
    largeFileAllowlist: c?.branchArtifactsAllowlist ?? o.largeFileAllowlist ?? [],
    maxDecompressBytes:
      c?.branchArtifactsMaxDecompressBytes ?? o.maxDecompressBytes ?? DEFAULT_MAX_DECOMPRESS_BYTES,
    maxScanFiles: c?.branchArtifactsMaxScanFiles ?? o.maxScanFiles ?? DEFAULT_MAX_SCAN_FILES,
    maxCompressedProbeOffsets: o.maxCompressedProbeOffsets ?? DEFAULT_MAX_COMPRESSED_PROBE_OFFSETS,
  };
}

function normRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Simple glob: `**`, `*`, and `?` only; patterns are repo-relative. */
export function pathMatchesGlob(path: string, pattern: string): boolean {
  const p = normRepoPath(path);
  const pat = normRepoPath(pattern);
  const re = globToRegExp(pat);
  return re.test(p);
}

function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.+/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
      continue;
    }
    if (ch === "*") {
      re += "[^/]*";
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    if (/[+^${}()|[\]\\.]/.test(ch)) re += `\\${ch}`;
    else re += ch;
  }
  re += "$";
  return new RegExp(re);
}

const BUILTIN_BUILD_SEGMENTS = [
  /(^|\/)\.derived-data[^/]*(\/|$)/,
  /(^|\/)DerivedData(\/|$)/,
  /(^|\/)\.build(\/|$)/,
  /\.xcresult(\/|$)/,
];

export function isBuildOutputPath(path: string, patterns: string[]): boolean {
  const p = normRepoPath(path);
  if (BUILTIN_BUILD_SEGMENTS.some((re) => re.test(p))) return true;
  return patterns.some((pat) => pathMatchesGlob(p, pat));
}

export function isAllowlistedLargePath(path: string, allowlist: string[]): boolean {
  const p = normRepoPath(path);
  return allowlist.some((entry) => {
    const e = normRepoPath(entry);
    return p === e || p.startsWith(e.endsWith("/") ? e : `${e}/`);
  });
}

const SECRET_RULES: { type: string; re: RegExp }[] = [
  { type: "stripe_secret", re: /\bsk_(?:live|test)_[0-9a-zA-Z]{16,}\b/ },
  { type: "stripe_restricted", re: /\brk_(?:live|test)_[0-9a-zA-Z]{16,}\b/ },
  { type: "stripe_webhook", re: /\bwhsec_[0-9a-zA-Z]{16,}\b/ },
  { type: "google_api", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { type: "aws_access", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { type: "github_pat", re: /\b(?:ghp_|github_pat_)[0-9a-zA-Z_]{20,}\b/ },
  { type: "anthropic", re: /\bsk-ant-[0-9a-zA-Z\-_]{20,}\b/ },
  { type: "slack", re: /\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b/ },
];

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

function lastFourOfMatch(buf: Buffer, match: RegExpExecArray): string {
  const raw = match[0] ?? "";
  const tail = raw.slice(-4);
  return tail.length === 4 ? tail : "????";
}

export function scanTextForSecrets(text: string, path: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const rule of SECRET_RULES) {
    const re = new RegExp(
      rule.re.source,
      rule.re.flags.includes("g") ? rule.re.flags : `${rule.re.flags}g`,
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({
        type: rule.type,
        path,
        suffix: lastFourOfMatch(Buffer.from(m[0] ?? "", "utf8"), m),
      });
      if (hits.length >= 20) return hits;
    }
  }
  return hits;
}

function zstdAvailable(): boolean {
  const bun = (
    globalThis as unknown as { Bun?: { zstdDecompressSync?: (b: Buffer) => Uint8Array } }
  ).Bun;
  return Boolean(bun?.zstdDecompressSync) || typeof zstdDecompressSync === "function";
}

function compressionWouldExceedCap(compressedLen: number, maxOut: number): boolean {
  return compressedLen > maxOut / MAX_COMPRESSION_EXPANSION_RATIO;
}

/** Node's `zstdDecompressSync` caps output during inflation; never uncapped Bun (#1096 r3). */
function decompressZstd(buf: Buffer, maxOut: number): Buffer | "too_large" | "missing" | "error" {
  if (compressionWouldExceedCap(buf.length, maxOut)) return "too_large";
  if (typeof zstdDecompressSync !== "function") return "missing";
  try {
    return zstdDecompressSync(buf, { maxOutputLength: maxOut });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("maxOutputLength") || msg.includes("Buffer") || msg.includes("invalid"))
      return "too_large";
    return "error";
  }
}

function tryGunzip(buf: Buffer, maxOut: number): Buffer | "too_large" | null {
  if (compressionWouldExceedCap(buf.length, maxOut)) return "too_large";
  try {
    return gunzipSync(buf, { maxOutputLength: maxOut });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("maxOutputLength") || msg.includes("Buffer")) return "too_large";
    return null;
  }
}

function tryZlibInflate(buf: Buffer, maxOut: number): Buffer | "too_large" | null {
  if (compressionWouldExceedCap(buf.length, maxOut)) return "too_large";
  try {
    return inflateSync(buf, { maxOutputLength: maxOut });
  } catch {
    try {
      return unzipSync(buf, { maxOutputLength: maxOut });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("maxOutputLength") || msg.includes("Buffer")) return "too_large";
      return null;
    }
  }
}

function indexOfAll(buf: Buffer, needle: Buffer, max: number): number[] {
  const out: number[] = [];
  let start = 0;
  while (out.length < max && start <= buf.length - needle.length) {
    const i = buf.indexOf(needle, start);
    if (i === -1) break;
    out.push(i);
    start = i + 1;
  }
  return out;
}

export interface BufferSecretScan {
  secrets: SecretHit[];
  incomplete: ScanIncomplete[];
}

/** Collect bounded buffers to scan for secrets (raw + decompressed windows). */
export function scanBuffersForSecrets(
  buf: Buffer,
  path: string,
  maxDecompressBytes: number,
  maxOffsets = DEFAULT_MAX_COMPRESSED_PROBE_OFFSETS,
): BufferSecretScan {
  const secrets: SecretHit[] = [];
  const incomplete: ScanIncomplete[] = [];
  const pushHits = (chunk: Buffer) => {
    const text = chunk.toString("latin1");
    for (const h of scanTextForSecrets(text, path)) {
      secrets.push(h);
      if (secrets.length >= 20) return;
    }
  };

  pushHits(buf.slice(0, Math.min(buf.length, maxDecompressBytes)));
  if (secrets.length >= 20) return { secrets, incomplete };

  const gzipHits = indexOfAll(buf, GZIP_MAGIC, buf.length);
  const zstdHits = indexOfAll(buf, ZSTD_MAGIC, buf.length);
  if (gzipHits.length + zstdHits.length > maxOffsets) {
    incomplete.push({
      path,
      reason: `more than ${maxOffsets} gzip/zstd regions — cannot exhaustively scan`,
    });
  }
  const prioritized = [...new Set<number>([0, ...gzipHits, ...zstdHits])].sort((a, b) => a - b);
  const sorted = prioritized.slice(0, maxOffsets);
  for (const start of sorted) {
    if (secrets.length >= 20) break;
    const slice = buf.subarray(start);
    if (slice.length < 2) continue;

    if (
      slice.length >= 4 &&
      slice[0] === 0x28 &&
      slice[1] === 0xb5 &&
      slice[2] === 0x2f &&
      slice[3] === 0xfd
    ) {
      const out = decompressZstd(slice, maxDecompressBytes);
      if (out === "missing") {
        incomplete.push({
          path,
          reason: "zstd payload present but no zstd decompressor is available in this runtime",
        });
        pushHits(slice);
        continue;
      }
      if (out === "too_large") {
        incomplete.push({
          path,
          reason: `zstd payload expands past the ${maxDecompressBytes}-byte scan limit`,
        });
        pushHits(slice);
        continue;
      }
      if (out === "error") {
        pushHits(slice);
        continue;
      }
      if (out.length > 0) pushHits(out);
      continue;
    }

    if (slice.length >= 2 && slice[0] === 0x1f && slice[1] === 0x8b) {
      const out = tryGunzip(slice, maxDecompressBytes);
      if (out === "too_large") {
        incomplete.push({
          path,
          reason: `gzip payload expands past the ${maxDecompressBytes}-byte scan limit`,
        });
        pushHits(slice);
        continue;
      }
      if (out) pushHits(out);
      else pushHits(slice);
      continue;
    }

    if (slice[0] === 0x78) {
      const out = tryZlibInflate(slice, maxDecompressBytes);
      if (out === "too_large") {
        incomplete.push({
          path,
          reason: `zlib payload expands past the ${maxDecompressBytes}-byte scan limit`,
        });
        pushHits(slice);
        continue;
      }
      if (out) pushHits(out);
    }
  }

  return { secrets, incomplete };
}

export interface BoundedBlobRead {
  buf: Buffer;
  size: number;
  truncated: boolean;
}

export function readPathBytes(repoRoot: string, rel: string, maxRead: number): Buffer | null {
  const blob = readBoundedWorktreeFile(join(repoRoot, normRepoPath(rel)), maxRead);
  return blob?.buf ?? null;
}

function readBoundedWorktreeFile(abs: string, maxRead: number): BoundedBlobRead | null {
  if (!existsSync(abs)) return null;
  let fd: number | undefined;
  try {
    const st = statSync(abs);
    if (st.isDirectory()) return null;
    fd = openSync(abs, "r");
    const stFd = fstatSync(fd);
    const toRead = Math.min(stFd.size, maxRead);
    const buf = Buffer.alloc(toRead);
    readSync(fd, buf, 0, toRead, 0);
    return { buf, size: stFd.size, truncated: stFd.size > maxRead };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readGitBlobBounded(
  repoRoot: string,
  spec: string,
  maxRead: number,
): BoundedBlobRead | null {
  try {
    const size = Number(
      execFileSync("git", ["cat-file", "-s", spec], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim(),
    );
    if (!Number.isFinite(size) || size < 0) return null;
    const toRead = Math.min(size, maxRead);
    const out = execFileSync("git", ["show", spec], {
      cwd: repoRoot,
      maxBuffer: toRead + 64,
      stdio: ["pipe", "pipe", "pipe"],
    }) as Buffer;
    return {
      buf: out.subarray(0, Math.min(out.length, toRead)),
      size,
      truncated: size > maxRead,
    };
  } catch {
    return null;
  }
}

export function gitAddingCommitForPath(repoRoot: string, rel: string): string | null {
  try {
    const rev = execFileSync(
      "git",
      ["log", "--diff-filter=A", "-n", "1", "--format=%H", "HEAD", "--", normRepoPath(rel)],
      { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    return rev || null;
  } catch {
    return null;
  }
}

/** Bytes as introduced on the branch (`<adding-commit>:path`), not the worktree. */
export function readBranchIntroducedBlob(
  repoRoot: string,
  rel: string,
  maxRead: number,
): BoundedBlobRead | null {
  const rev = gitAddingCommitForPath(repoRoot, rel);
  if (!rev) return null;
  return readGitBlobBounded(repoRoot, `${rev}:${normRepoPath(rel)}`, maxRead);
}

/** Staged index blob only — never the worktree (#1096 scope freeze). */
export function readStagedIndexBlob(
  repoRoot: string,
  rel: string,
  maxRead: number,
): BoundedBlobRead | null {
  return readGitBlobBounded(repoRoot, `:${normRepoPath(rel)}`, maxRead);
}

function fileSizeAtBranchIntroduced(repoRoot: string, rel: string): number | null {
  const rev = gitAddingCommitForPath(repoRoot, rel);
  if (!rev) return null;
  try {
    const size = Number(
      execFileSync("git", ["cat-file", "-s", `${rev}:${normRepoPath(rel)}`], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim(),
    );
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

function fileSizeAtStagedIndex(repoRoot: string, rel: string): number | null {
  try {
    const size = Number(
      execFileSync("git", ["cat-file", "-s", `:${normRepoPath(rel)}`], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim(),
    );
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

/** Staged index object bytes (`:path`) — not the working tree. */
export function readStagedPathBytes(repoRoot: string, rel: string, maxRead: number): Buffer | null {
  const blob = readGitBlobBounded(repoRoot, `:${normRepoPath(rel)}`, maxRead);
  return blob?.buf ?? null;
}

function refResolvable(repoRoot: string, ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/** Paths introduced on the branch (including adds later removed from HEAD). */
export function gitAddedPathsOnBranch(repoRoot: string, ref: string): string[] | null {
  if (!refResolvable(repoRoot, ref)) return null;
  try {
    const raw = execFileSync(
      "git",
      ["log", "--pretty=format:", "--name-only", "--diff-filter=A", `${ref}..HEAD`],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      },
    );
    const paths = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normRepoPath);
    return [...new Set(paths)].sort();
  } catch {
    return null;
  }
}

/** @deprecated Prefer {@link gitAddedPathsOnBranch}. */
export function gitAddedPathsVsRef(repoRoot: string, ref: string): string[] | null {
  return gitAddedPathsOnBranch(repoRoot, ref);
}

export interface BranchArtifactViolation {
  kind: "build-output" | "oversize" | "secret" | "scan-incomplete" | "scan-limit";
  path: string;
  detail?: string;
}

export interface EvaluateAddedPathsOptions extends BranchArtifactGuardOptions {
  /** Read staged index blobs when present (pre-commit). */
  preferStaged?: boolean;
}

export function evaluateAddedPaths(
  repoRoot: string,
  paths: string[],
  opts: EvaluateAddedPathsOptions = {},
): { violations: BranchArtifactViolation[]; secrets: SecretHit[] } {
  const resolved = resolveBranchArtifactGuardOptions(opts);
  const violations: BranchArtifactViolation[] = [];
  const secrets: SecretHit[] = [];
  let scanned = 0;

  if (paths.length > resolved.maxScanFiles) {
    violations.push({
      kind: "scan-limit",
      path: "(branch)",
      detail: `${paths.length} added paths exceed scan cap ${resolved.maxScanFiles}`,
    });
  }

  for (const path of paths) {
    if (isBuildOutputPath(path, resolved.buildOutputPatterns)) {
      violations.push({ kind: "build-output", path });
      continue;
    }
    const size = opts.preferStaged
      ? (() => {
          try {
            const n = Number(
              execFileSync("git", ["cat-file", "-s", `:${normRepoPath(path)}`], {
                cwd: repoRoot,
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
              }).trim(),
            );
            return Number.isFinite(n) ? n : null;
          } catch {
            return null;
          }
        })()
      : fileSizeAtBranchIntroduced(repoRoot, path);
    if (
      size != null &&
      size > resolved.maxAddedFileBytes &&
      !isAllowlistedLargePath(path, resolved.largeFileAllowlist)
    ) {
      violations.push({
        kind: "oversize",
        path,
        detail: `${size} bytes (limit ${resolved.maxAddedFileBytes})`,
      });
    }
    if (scanned >= resolved.maxScanFiles) continue;
    const maxRead = resolved.maxAddedFileBytes + resolved.maxDecompressBytes;
    const blob = opts.preferStaged
      ? readGitBlobBounded(repoRoot, `:${normRepoPath(path)}`, maxRead)
      : readBranchIntroducedBlob(repoRoot, path, maxRead);
    if (!blob) {
      violations.push({
        kind: "scan-incomplete",
        path,
        detail: opts.preferStaged
          ? "no staged index blob to scan"
          : "could not read blob at adding commit",
      });
      continue;
    }
    scanned++;
    const scanIncomplete: ScanIncomplete[] = [];
    if (blob.truncated) {
      scanIncomplete.push({
        path,
        reason: `file is ${blob.size} bytes but only the first ${maxRead} bytes were scanned`,
      });
    }
    const { secrets: found, incomplete } = scanBuffersForSecrets(
      blob.buf,
      path,
      resolved.maxDecompressBytes,
      resolved.maxCompressedProbeOffsets,
    );
    scanIncomplete.push(...incomplete);
    for (const hit of found) {
      secrets.push(hit);
      violations.push({ kind: "secret", path, detail: hit.type });
      if (secrets.length >= 20) break;
    }
    for (const inc of scanIncomplete) {
      violations.push({
        kind: "scan-incomplete",
        path: inc.path,
        detail: inc.reason,
      });
    }
    if (secrets.length >= 20) break;
  }
  return { violations, secrets };
}

function walkDirFiles(repoRoot: string, dir: string, budget: number, out: string[]): void {
  if (budget <= 0) return;
  const abs = join(repoRoot, dir);
  let names: string[];
  try {
    names = readdirSync(abs);
  } catch {
    return;
  }
  for (const name of names) {
    if (budget <= 0) return;
    const rel = normRepoPath(join(dir, name));
    const full = join(repoRoot, rel);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walkDirFiles(repoRoot, rel, budget - out.length, out);
      else {
        out.push(rel);
        budget--;
      }
    } catch {
      /* skip */
    }
  }
}

export interface ExpandedCheckpointPaths {
  paths: string[];
  /** True when expansion hit `maxFiles` before listing every file. */
  capped: boolean;
}

/** Expand directory porcelain entries into file paths for checkpoint staging. */
export function expandCheckpointPaths(
  repoRoot: string,
  paths: string[],
  maxFiles: number,
): ExpandedCheckpointPaths {
  const out: string[] = [];
  let capped = false;
  for (const raw of paths) {
    if (out.length >= maxFiles) {
      capped = true;
      break;
    }
    const p = normRepoPath(raw);
    const abs = join(repoRoot, p);
    if (!existsSync(abs)) {
      out.push(p);
      continue;
    }
    try {
      const st = statSync(abs);
      if (st.isFile()) out.push(p);
      else if (st.isDirectory()) walkDirFiles(repoRoot, p, maxFiles - out.length, out);
      else out.push(p);
    } catch {
      out.push(p);
    }
  }
  return { paths: [...new Set(out)], capped };
}

export interface CheckpointStagingResult {
  allowed: string[];
  unstagedBuildOutput: string[];
  unstagedOversize: string[];
  /** Paths removed from the index when a checkpoint is refused. */
  refusedPaths: string[];
  secrets: SecretHit[];
  error: string | null;
  report: string | null;
}

export function formatCheckpointUnstagedReport(staging: CheckpointStagingResult): string | null {
  const lines: string[] = [];
  if (staging.unstagedBuildOutput.length) {
    lines.push(
      `Unstaged build-output paths (not checkpointed):\n    ${staging.unstagedBuildOutput.slice(0, 15).join("\n    ")}`,
    );
  }
  if (staging.unstagedOversize.length) {
    lines.push(
      `Unstaged oversized / excess staged paths:\n    ${staging.unstagedOversize.slice(0, 15).join("\n    ")}`,
    );
  }
  return lines.length ? lines.join("\n\n") : null;
}

/** Split checkpoint paths: refuse secrets; drop build output and staged bulk. */
export function planCheckpointStaging(
  repoRoot: string,
  paths: string[],
  opts: BranchArtifactGuardConfig = {},
): CheckpointStagingResult {
  const resolved = resolveBranchArtifactGuardOptions(opts);
  const expanded = expandCheckpointPaths(repoRoot, paths, resolved.maxScanFiles);
  const unstagedBuildOutput: string[] = [];
  const unstagedOversize: string[] = [];
  const allowed: string[] = [];
  const secrets: SecretHit[] = [];
  const incomplete: ScanIncomplete[] = [];
  const refusedPaths: string[] = [];

  if (expanded.capped) {
    incomplete.push({
      path: "(checkpoint)",
      reason: `more than ${resolved.maxScanFiles} files after expanding directories — refusing to checkpoint`,
    });
  }

  for (const path of expanded.paths) {
    if (isBuildOutputPath(path, resolved.buildOutputPatterns)) {
      unstagedBuildOutput.push(path);
      continue;
    }
    const maxRead = resolved.maxAddedFileBytes + resolved.maxDecompressBytes;
    const blob = readStagedIndexBlob(repoRoot, path, maxRead);
    if (!blob) {
      incomplete.push({ path, reason: "no staged index blob to scan" });
      refusedPaths.push(path);
      continue;
    }
    if (blob.truncated) {
      incomplete.push({
        path,
        reason: `file is ${blob.size} bytes but only the first ${maxRead} bytes were scanned`,
      });
    }
    const scan = scanBuffersForSecrets(
      blob.buf,
      path,
      resolved.maxDecompressBytes,
      resolved.maxCompressedProbeOffsets,
    );
    secrets.push(...scan.secrets);
    incomplete.push(...scan.incomplete);
    if (scan.secrets.length > 0 || scan.incomplete.length > 0) {
      refusedPaths.push(path);
      continue;
    }
    if (secrets.length > 0) continue;
    if (incomplete.length > 0) continue;
    allowed.push(path);
  }

  if (incomplete.length > 0) {
    const detail = incomplete
      .slice(0, 5)
      .map((i) => `${i.path}: ${i.reason}`)
      .join("; ");
    return {
      allowed: [],
      unstagedBuildOutput,
      unstagedOversize,
      refusedPaths,
      secrets,
      error: `Could not fully scan staged content — refusing to checkpoint (${detail})`,
      report: formatCheckpointUnstagedReport({
        allowed: [],
        unstagedBuildOutput,
        unstagedOversize,
        refusedPaths,
        secrets,
        error: null,
        report: null,
      }),
    };
  }

  if (secrets.length > 0) {
    return {
      allowed: [],
      unstagedBuildOutput,
      unstagedOversize,
      refusedPaths,
      secrets,
      error: formatSecretHits(secrets),
      report: formatCheckpointUnstagedReport({
        allowed: [],
        unstagedBuildOutput,
        unstagedOversize,
        refusedPaths,
        secrets,
        error: null,
        report: null,
      }),
    };
  }

  let totalBytes = 0;
  const capped: string[] = [];
  for (const path of allowed) {
    const size = fileSizeAtStagedIndex(repoRoot, path) ?? 0;
    if (
      capped.length >= resolved.checkpointMaxFiles ||
      totalBytes + size > resolved.checkpointMaxBytes
    ) {
      unstagedOversize.push(path);
      continue;
    }
    totalBytes += size;
    capped.push(path);
  }

  const report = formatCheckpointUnstagedReport({
    allowed: capped,
    unstagedBuildOutput,
    unstagedOversize,
    refusedPaths: [],
    secrets: [],
    error: null,
    report: null,
  });

  return {
    allowed: capped,
    unstagedBuildOutput,
    unstagedOversize,
    refusedPaths: [],
    secrets: [],
    error:
      capped.length === 0 && (unstagedBuildOutput.length > 0 || unstagedOversize.length > 0)
        ? "nothing left to checkpoint after removing build output or oversized staged files"
        : null,
    report,
  };
}

export function formatSecretHits(hits: SecretHit[]): string {
  const lines = hits.slice(0, 10).map((h) => `  ${h.type} in ${h.path} (…${h.suffix})`);
  return `Secret pattern(s) in staged content — refusing to commit:\n${lines.join("\n")}`;
}

export function formatBranchArtifactFailures(
  violations: BranchArtifactViolation[],
  secrets: SecretHit[],
): string {
  const parts: string[] = [];
  const build = violations.filter((v) => v.kind === "build-output");
  if (build.length) {
    parts.push(
      `Build-output paths must not be added on this branch:\n    ${build
        .slice(0, 15)
        .map((v) => v.path)
        .join("\n    ")}`,
    );
  }
  const big = violations.filter((v) => v.kind === "oversize");
  if (big.length) {
    parts.push(
      `Files over the size limit (add to [check] branchArtifactsAllowlist if deliberate):\n    ${big
        .slice(0, 10)
        .map((v) => `${v.path} (${v.detail})`)
        .join("\n    ")}`,
    );
  }
  const inc = violations.filter((v) => v.kind === "scan-incomplete" || v.kind === "scan-limit");
  if (inc.length) {
    parts.push(
      `Secret scan did not finish (fail-closed):\n    ${inc
        .slice(0, 10)
        .map((v) => (v.detail ? `${v.path}: ${v.detail}` : v.path))
        .join("\n    ")}`,
    );
  }
  if (secrets.length) parts.push(formatSecretHits(secrets));
  return parts.join("\n\n");
}

/** Staged paths from the index (porcelain name-only). */
export function gitStagedPaths(repoRoot: string): string[] {
  try {
    return execFileSync("git", ["diff", "--cached", "--name-only", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean)
      .map(normRepoPath);
  } catch {
    return [];
  }
}

export function evaluateStagedForPreCommit(
  repoRoot: string,
  opts: BranchArtifactGuardConfig = {},
): { ok: boolean; message: string } {
  const staged = gitStagedPaths(repoRoot);
  if (staged.length === 0) return { ok: true, message: "" };
  const resolved = resolveBranchArtifactGuardOptions(opts);
  const { violations, secrets } = evaluateAddedPaths(repoRoot, staged, {
    ...resolved,
    preferStaged: true,
  });
  if (violations.length === 0 && secrets.length === 0) return { ok: true, message: "" };
  return { ok: false, message: formatBranchArtifactFailures(violations, secrets) };
}

export { zstdAvailable };
