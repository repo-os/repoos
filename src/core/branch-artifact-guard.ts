/**
 * Guards against build output, oversized files, and secret patterns in task
 * branch diffs and engineer WIP checkpoint commits (#1096).
 */
import * as nodeZlib from "node:zlib";

const { gunzipSync, inflateSync, unzipSync } = nodeZlib;
const zstdDecompressSync = (nodeZlib as { zstdDecompressSync?: typeof gunzipSync })
  .zstdDecompressSync;
import { statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { CheckConfig } from "./types.js";

export const DEFAULT_MAX_ADDED_FILE_BYTES = 1_048_576;
export const DEFAULT_CHECKPOINT_MAX_FILES = 200;
export const DEFAULT_CHECKPOINT_MAX_BYTES = 5_242_880;
export const DEFAULT_MAX_DECOMPRESS_BYTES = 4_194_304;
export const DEFAULT_MAX_SCAN_FILES = 500;

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
}

export interface SecretHit {
  type: string;
  path: string;
  suffix: string;
}

export function resolveBranchArtifactGuardOptions(
  check: CheckConfig | undefined,
): Required<BranchArtifactGuardOptions> {
  return {
    maxAddedFileBytes: check?.branchArtifactsMaxFileBytes ?? DEFAULT_MAX_ADDED_FILE_BYTES,
    checkpointMaxFiles: check?.checkpointMaxStagedFiles ?? DEFAULT_CHECKPOINT_MAX_FILES,
    checkpointMaxBytes: check?.checkpointMaxStagedBytes ?? DEFAULT_CHECKPOINT_MAX_BYTES,
    buildOutputPatterns: check?.buildOutputPatterns?.length
      ? check.buildOutputPatterns
      : DEFAULT_BUILD_OUTPUT_PATTERNS,
    largeFileAllowlist: check?.branchArtifactsAllowlist ?? [],
    maxDecompressBytes: check?.branchArtifactsMaxDecompressBytes ?? DEFAULT_MAX_DECOMPRESS_BYTES,
    maxScanFiles: check?.branchArtifactsMaxScanFiles ?? DEFAULT_MAX_SCAN_FILES,
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

function zstdDecompress(buf: Buffer, maxOut: number): Buffer | null {
  try {
    const bun = (
      globalThis as unknown as { Bun?: { zstdDecompressSync?: (b: Buffer) => Uint8Array } }
    ).Bun;
    if (bun?.zstdDecompressSync) {
      const out = bun.zstdDecompressSync(buf);
      if (out.length > maxOut) return null;
      return Buffer.from(out);
    }
    if (typeof zstdDecompressSync === "function") {
      return zstdDecompressSync(buf, { maxOutputLength: maxOut });
    }
  } catch {
    /* unsupported or corrupt */
  }
  return null;
}

function tryGunzip(buf: Buffer, maxOut: number): Buffer | null {
  try {
    return gunzipSync(buf, { maxOutputLength: maxOut });
  } catch {
    return null;
  }
}

function tryZlibInflate(buf: Buffer, maxOut: number): Buffer | null {
  try {
    return inflateSync(buf, { maxOutputLength: maxOut });
  } catch {
    try {
      return unzipSync(buf, { maxOutputLength: maxOut });
    } catch {
      return null;
    }
  }
}

/** Collect bounded buffers to scan for secrets (raw + decompressed windows). */
export function scanBuffersForSecrets(
  buf: Buffer,
  path: string,
  maxDecompressBytes: number,
  maxAttempts = 24,
): SecretHit[] {
  const hits: SecretHit[] = [];
  const pushHits = (chunk: Buffer) => {
    const text = chunk.toString("latin1");
    for (const h of scanTextForSecrets(text, path)) {
      hits.push(h);
      if (hits.length >= 20) return;
    }
  };
  pushHits(buf.slice(0, Math.min(buf.length, maxDecompressBytes)));
  if (hits.length >= 20) return hits;

  let attempts = 0;
  const trySlice = (start: number, slice: Buffer) => {
    if (attempts >= maxAttempts || hits.length >= 20) return;
    attempts++;
    let out: Buffer | null = null;
    if (
      slice.length >= 4 &&
      slice[0] === 0x28 &&
      slice[1] === 0xb5 &&
      slice[2] === 0x2f &&
      slice[3] === 0xfd
    ) {
      out = zstdDecompress(slice, maxDecompressBytes);
    } else if (slice.length >= 2 && slice[0] === 0x1f && slice[1] === 0x8b) {
      out = tryGunzip(slice, maxDecompressBytes);
    } else if (slice[0] === 0x78) {
      out = tryZlibInflate(slice, maxDecompressBytes);
    }
    if (out && out.length > 0) pushHits(out);
  };

  if (buf.length >= 4) trySlice(0, buf);
  const step = Math.max(4096, Math.floor(buf.length / maxAttempts));
  for (let i = step; i < buf.length && attempts < maxAttempts; i += step) {
    trySlice(i, buf.subarray(i));
  }
  return hits;
}

export function readPathBytes(repoRoot: string, rel: string, maxRead: number): Buffer | null {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) return null;
  try {
    const st = statSync(abs);
    if (st.isDirectory()) return null;
    if (st.size > maxRead) {
      const fd = readFileSync(abs).subarray(0, maxRead);
      return fd;
    }
    return readFileSync(abs);
  } catch {
    return null;
  }
}

export function fileSizeAt(repoRoot: string, rel: string): number | null {
  try {
    const st = statSync(join(repoRoot, rel));
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

export function gitAddedPathsVsRef(repoRoot: string, ref: string): string[] | null {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    return null;
  }
  try {
    return execFileSync("git", ["diff", "--diff-filter=A", "--name-only", "-z", `${ref}...HEAD`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean)
      .map(normRepoPath);
  } catch {
    return null;
  }
}

export interface BranchArtifactViolation {
  kind: "build-output" | "oversize" | "secret";
  path: string;
  detail?: string;
}

export function evaluateAddedPaths(
  repoRoot: string,
  paths: string[],
  opts: BranchArtifactGuardOptions,
): { violations: BranchArtifactViolation[]; secrets: SecretHit[] } {
  const resolved = { ...resolveBranchArtifactGuardOptions({ ...opts }), ...opts };
  const violations: BranchArtifactViolation[] = [];
  const secrets: SecretHit[] = [];
  let scanned = 0;

  for (const path of paths) {
    if (isBuildOutputPath(path, resolved.buildOutputPatterns)) {
      violations.push({ kind: "build-output", path });
      continue;
    }
    const size = fileSizeAt(repoRoot, path);
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
    const buf = readPathBytes(
      repoRoot,
      path,
      resolved.maxAddedFileBytes + resolved.maxDecompressBytes,
    );
    if (!buf) continue;
    scanned++;
    for (const hit of scanBuffersForSecrets(buf, path, resolved.maxDecompressBytes)) {
      secrets.push(hit);
      violations.push({ kind: "secret", path, detail: hit.type });
      if (secrets.length >= 20) break;
    }
    if (secrets.length >= 20) break;
  }
  return { violations, secrets };
}

export interface CheckpointStagingResult {
  allowed: string[];
  unstagedBuildOutput: string[];
  unstagedOversize: string[];
  secrets: SecretHit[];
  error: string | null;
}

/** Split checkpoint paths: refuse secrets; drop build output and staged bulk. */
export function planCheckpointStaging(
  repoRoot: string,
  paths: string[],
  opts: BranchArtifactGuardOptions,
): CheckpointStagingResult {
  const resolved = { ...resolveBranchArtifactGuardOptions({ ...opts }), ...opts };
  const unstagedBuildOutput: string[] = [];
  const unstagedOversize: string[] = [];
  const allowed: string[] = [];
  const secrets: SecretHit[] = [];

  for (const path of paths) {
    if (isBuildOutputPath(path, resolved.buildOutputPatterns)) {
      unstagedBuildOutput.push(path);
      continue;
    }
    const buf = readPathBytes(
      repoRoot,
      path,
      resolved.maxAddedFileBytes + resolved.maxDecompressBytes,
    );
    if (buf) {
      for (const hit of scanBuffersForSecrets(buf, path, resolved.maxDecompressBytes)) {
        secrets.push(hit);
      }
    }
    if (secrets.length > 0) continue;
    allowed.push(path);
  }

  if (secrets.length > 0) {
    return {
      allowed: [],
      unstagedBuildOutput,
      unstagedOversize,
      secrets,
      error: formatSecretHits(secrets),
    };
  }

  let totalBytes = 0;
  const capped: string[] = [];
  for (const path of allowed) {
    const size = fileSizeAt(repoRoot, path) ?? 0;
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

  return {
    allowed: capped,
    unstagedBuildOutput,
    unstagedOversize,
    secrets: [],
    error:
      capped.length === 0 && (unstagedBuildOutput.length > 0 || unstagedOversize.length > 0)
        ? "nothing left to checkpoint after removing build output or oversized staged files"
        : null,
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
  opts: BranchArtifactGuardOptions,
): { ok: boolean; message: string } {
  const staged = gitStagedPaths(repoRoot);
  if (staged.length === 0) return { ok: true, message: "" };
  const { violations, secrets } = evaluateAddedPaths(repoRoot, staged, opts);
  if (violations.length === 0 && secrets.length === 0) return { ok: true, message: "" };
  return { ok: false, message: formatBranchArtifactFailures(violations, secrets) };
}
