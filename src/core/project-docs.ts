/**
 * Opt-in project docs: import an existing doc set (`repoos init --docs-from`,
 * `repoos docs import`), scaffold a minimal starter skeleton, and the pure
 * predicates behind `repoos doctor`'s docs-wiring check (#0673).
 *
 * Design intent (owner guidance): never prescriptive. Nothing here runs unless
 * the user passes a flag or answers yes to a prompt. Import preserves the
 * source tree, refuses to clobber without `force`, and reports what it did.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────

/** One file the import considered, relative to the destination docsDir. */
export interface DocsImportEntry {
  /** Path relative to docsDir, using forward slashes. */
  path: string;
  /** Where the content came from — a file path, or `zip: <entry>` for archives. */
  source: string;
}

export interface DocsImportResult {
  /** Files copied (or that would be copied, in a dry run). */
  created: DocsImportEntry[];
  /** Files already present and left untouched (no `force`). */
  skipped: DocsImportEntry[];
  /** Overwrites performed (only with `force`). */
  overwritten: DocsImportEntry[];
  /** Human note about how the source was resolved (used by the CLI). */
  note: string | null;
}

export interface DocsImportOptions {
  /** Overwrite existing files in the destination. Default false. */
  force?: boolean;
  /** Resolve and report the plan without writing anything. Default false. */
  dryRun?: boolean;
}

/** Guards against absurd archives — counts and uncompressed bytes. */
const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_BYTES = 200 * 1024 * 1024; // 200 MiB

// ── Import ──────────────────────────────────────────────────────────────────

/**
 * Copy an existing doc set into `docsDir`.
 *
 * `source` may be a directory (its contents are copied, structure preserved), a
 * single file (copied into docsDir root), or a `.zip` archive (extracted to a
 * temp dir first; a lone top-level folder is unwrapped so a typical browser
 * download doesn't nest one extra level). macOS junk is ignored, zip-slip paths
 * and symlinks are refused, and the temp dir is always cleaned up.
 *
 * Throws on an unusable source or a rejected archive; callers render the
 * message. Collisions are reported, not thrown.
 */
export function importProjectDocs(
  source: string,
  docsDirAbs: string,
  opts: DocsImportOptions = {},
): DocsImportResult {
  const force = opts.force === true;
  const dryRun = opts.dryRun === true;
  const src = resolve(source);

  if (!existsSync(src)) {
    throw new Error(`source not found: ${source}`);
  }

  let staging = src;
  let note: string | null = null;
  let cleanup: string | null = null;

  const st = statSync(src);
  if (st.isFile() && extname(src).toLowerCase() === ".zip") {
    const extracted = extractZipToTemp(src);
    staging = extracted.dir;
    cleanup = extracted.dir;
    note = `unpacked ${basename(src)}`;
  } else if (st.isFile()) {
    // A single loose file imports to the docsDir root.
    return copyOneFile(src, basename(src), docsDirAbs, { force, dryRun });
  } else if (!st.isDirectory()) {
    throw new Error(`source is neither a directory, a file, nor a .zip: ${source}`);
  }

  try {
    const root = resolveUnwrappedRoot(staging);
    if (root !== staging) note = (note ? note + ", " : "") + "unwrapped single top-level folder";
    return copyTree(root, docsDirAbs, { force, dryRun, note });
  } finally {
    if (cleanup) rmSync(cleanup, { recursive: true, force: true });
  }
}

function copyOneFile(
  absFile: string,
  relName: string,
  docsDirAbs: string,
  opts: { force: boolean; dryRun: boolean },
): DocsImportResult {
  const result: DocsImportResult = { created: [], skipped: [], overwritten: [], note: null };
  const dest = join(docsDirAbs, relName);
  const entry: DocsImportEntry = { path: relName, source: absFile };
  if (existsSync(dest) && !opts.force) {
    result.skipped.push(entry);
    return result;
  }
  if (existsSync(dest)) result.overwritten.push(entry);
  else result.created.push(entry);
  if (!opts.dryRun) {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(absFile));
  }
  return result;
}

function copyTree(
  srcRoot: string,
  docsDirAbs: string,
  opts: { force: boolean; dryRun: boolean; note: string | null },
): DocsImportResult {
  const result: DocsImportResult = { created: [], skipped: [], overwritten: [], note: opts.note };
  for (const rel of walkFiles(srcRoot)) {
    const from = join(srcRoot, rel);
    const entry: DocsImportEntry = { path: rel.split(sep).join("/"), source: from };
    const dest = join(docsDirAbs, rel);
    if (existsSync(dest) && !opts.force) {
      result.skipped.push(entry);
      continue;
    }
    if (existsSync(dest)) result.overwritten.push(entry);
    else result.created.push(entry);
    if (opts.dryRun) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(from));
  }
  return result;
}

/** Relative file paths under `root`, skipping macOS junk. Directories are not returned. */
function walkFiles(root: string, base = ""): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(root, base));
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (isJunkName(entry)) continue;
    const rel = base ? join(base, entry) : entry;
    const full = join(root, rel);
    let lst;
    try {
      lst = lstatSync(full);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) {
      throw new Error(`refusing to import symlink: ${rel}`);
    }
    if (lst.isDirectory()) {
      out.push(...walkFiles(root, rel));
    } else if (lst.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/** macOS metadata that browser/`zip` downloads routinely carry. */
function isJunkName(name: string): boolean {
  return name === "__MACOSX" || name === ".DS_Store" || name.startsWith("._");
}

/**
 * When a source dir holds exactly one directory and nothing else, descend into
 * it so a `docs/` folder inside a `.zip` doesn't become `docs/docs/`.
 */
function resolveUnwrappedRoot(dir: string): string {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((n) => !isJunkName(n));
  } catch {
    return dir;
  }
  if (entries.length !== 1) return dir;
  const only = join(dir, entries[0]);
  try {
    if (lstatSync(only).isDirectory()) return only;
  } catch {
    /* fall through */
  }
  return dir;
}

// ── Zip extraction ──────────────────────────────────────────────────────────

interface ExtractedZip {
  dir: string;
}

/**
 * Extract a zip into a fresh temp dir, validating entries first. Prefers
 * Info-ZIP `unzip` and falls back to `bsdtar`. Zero runtime dependencies: both
 * are system tools. A clear error is thrown when neither exists.
 */
function extractZipToTemp(zipPath: string): ExtractedZip {
  const dir = mkdtempSync(join(tmpdir(), "repoos-docs-"));
  const entries = listZipEntries(zipPath);
  if (entries.length === 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`${basename(zipPath)} is empty or not a readable zip archive`);
  }
  if (entries.length > MAX_ZIP_ENTRIES) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `refusing ${basename(zipPath)}: ${entries.length} entries exceeds the ${MAX_ZIP_ENTRIES} limit`,
    );
  }
  for (const e of entries) {
    validateZipEntry(e.name);
  }

  const run = unzipInto(zipPath, dir);
  if (!run.ok) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `could not extract ${basename(zipPath)}: ${run.error ?? "no unzip/bsdtar on PATH"}`,
    );
  }

  // Post-extraction safety nets: symlinks, zip-slip escapes, and size caps.
  let total = 0;
  for (const rel of walkEntries(dir)) {
    const full = join(dir, rel);
    let lst;
    try {
      lst = lstatSync(full);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`refusing ${basename(zipPath)}: it contains a symlink (${rel})`);
    }
    const outside = !insideDir(full, dir);
    if (outside) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`refusing ${basename(zipPath)}: entry escapes the archive (${rel})`);
    }
    if (lst.isFile()) total += lst.size;
  }
  if (total > MAX_ZIP_BYTES) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(
      `refusing ${basename(zipPath)}: ${Math.round(total / 1024 / 1024)} MiB exceeds the ${MAX_ZIP_BYTES / 1024 / 1024} MiB limit`,
    );
  }
  return { dir };
}

/** Raw entry names from the archive, including directory entries. */
function listZipEntries(zipPath: string): { name: string }[] {
  const unzip = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  if (unzip.status === 0 && typeof unzip.stdout === "string") {
    return unzip.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== "./")
      .map((name) => ({ name }));
  }
  const tar = spawnSync("bsdtar", ["-tf", zipPath], { encoding: "utf8" });
  if (tar.status === 0 && typeof tar.stdout === "string") {
    return tar.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== "./")
      .map((name) => ({ name }));
  }
  throw new Error(
    `${basename(zipPath)} is not a readable zip, and neither \`unzip\` nor \`bsdtar\` is installed`,
  );
}

/** Reject absolute paths, `..` traversal, and Windows drive escapes (zip-slip). */
function validateZipEntry(name: string): void {
  const normalized = name.replace(/\\/g, "/");
  if (isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized.startsWith("//")) {
    throw new Error(`refusing zip entry with an absolute path: ${name}`);
  }
  const parts = normalized.split("/").filter((p) => p.length > 0 && p !== ".");
  if (parts.some((p) => p === "..")) {
    throw new Error(`refusing zip entry that escapes the archive: ${name}`);
  }
}

function unzipInto(zipPath: string, dir: string): { ok: boolean; error?: string } {
  const unzip = spawnSync("unzip", ["-q", "-o", zipPath, "-d", dir], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!unzip.error && unzip.status === 0) return { ok: true };
  if (unzip.error && (unzip.error as NodeJS.ErrnoException).code === "ENOENT") {
    const tar = spawnSync("bsdtar", ["-xf", zipPath, "-C", dir], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (!tar.error && tar.status === 0) return { ok: true };
    return { ok: false, error: tar.stderr?.trim() || "bsdtar could not extract the archive" };
  }
  return { ok: false, error: unzip.stderr?.trim() || "unzip failed" };
}

/** All entry paths (files and dirs) under `dir`, relative. */
function walkEntries(dir: string, base = ""): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(dir, base));
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = base ? join(base, entry) : entry;
    const full = join(dir, rel);
    let lst;
    try {
      lst = lstatSync(full);
    } catch {
      continue;
    }
    out.push(rel);
    if (lst.isDirectory() && !lst.isSymbolicLink()) out.push(...walkEntries(dir, rel));
  }
  return out;
}

function insideDir(abs: string, dir: string): boolean {
  const normDir = resolve(dir);
  const normAbs = resolve(abs);
  return normAbs === normDir || normAbs.startsWith(normDir + sep);
}

// ── Starter skeleton ────────────────────────────────────────────────────────

export interface StarterDocsResult {
  created: string[];
  skipped: string[];
}

/**
 * Write a minimal, opt-in docs skeleton into `docsDir`: an index README with a
 * reading order, plus product/architecture/conventions/glossary stubs with
 * prompts. Never overwrites an existing file. The README links every sibling,
 * so the result passes the doctor docs-wiring check out of the box.
 */
export function scaffoldStarterDocs(docsDirAbs: string): StarterDocsResult {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of Object.entries(STARTER_DOCS)) {
    const dest = join(docsDirAbs, rel);
    if (existsSync(dest)) {
      skipped.push(rel);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content, "utf8");
    created.push(rel);
  }
  return { created, skipped };
}

/**
 * The starter files, keyed by path relative to docsDir. Kept as a named export
 * so tests assert the generated set and the doctor check agree.
 */
export const STARTER_DOCS: Record<string, string> = {
  "README.md": `# Project docs

This is the index for this project's documentation. Agents and new
contributors read these in order — keep the reading order short and current.

## Reading order

1. [product.md](./product.md) — what this is and who it is for
2. [architecture.md](./architecture.md) — how it is built
3. [conventions.md](./conventions.md) — rules to follow when changing it
4. [glossary.md](./glossary.md) — terms used across the project

## If you learn something durable, write it here

A decision, a hard-won lesson, a rule that keeps repeating — write it into the
right file above and link it here, so the next person (or agent) does not have
to rediscover it. Docs that describe how things actually work beat docs that
describe how you'd expect them to.
`,
  "product.md": `# Product

_What is this project, and who is it for?_

- Problem it solves:
- Who uses it:
- What "done" looks like for the first useful release:
- Explicitly out of scope for now:
`,
  "architecture.md": `# Architecture

_How is this built, and why those choices?_

- Stack and hosting:
- The main pieces and how they talk to each other:
- Where state lives:
- Known constraints and trade-offs:
`,
  "conventions.md": `# Conventions

_Rules anyone — human or agent — must follow when changing this project._

- Build / test / run commands:
- Code style and formatting:
- Branching and review:
- Things never to do here:
`,
  "glossary.md": `# Glossary

_Terms used across this project, so everyone means the same thing._

- **Term** — what it means here.
`,
};

// ── Doctor docs-wiring checks ───────────────────────────────────────────────

export type DocsWiringLevel = "pass" | "warn";

export interface DocsWiringFinding {
  /** Stable finding id, e.g. `layout.docs-index-unlinked`. */
  id: string;
  level: DocsWiringLevel;
  title: string;
  detail: string;
  /** One-line fix hint, or null when nothing is wrong. */
  fix: string | null;
}

export interface DocsWiringInput {
  /** Repo-relative docsDir, e.g. "docs" or "repoos/docs". */
  docsDir: string;
  /** AGENTS.md text, or null when the file does not exist. */
  agentsMd: string | null;
  /** Relative paths (forward slashes) of markdown files under docsDir. */
  docsFiles: string[];
  /** Number of task files on the board. */
  taskCount: number;
  /**
   * Text of `<docsDir>/README.md`, or null when it could not be read. When
   * given, check (b) can tell which docs the index links to.
   */
  indexText?: string | null;
}

/**
 * (a) AGENTS.md must point at the docs index; (b) every doc should be reachable
 * from that index; (c) an empty docsDir is a warning once tasks exist. Pure, so
 * the rules are unit-tested directly. Advisory only — never a failure.
 */
export function checkDocsWiring(input: DocsWiringInput): DocsWiringFinding[] {
  const out: DocsWiringFinding[] = [];
  const docsDir = input.docsDir.replace(/\/+$/, "") || "docs";
  const indexRel = `${docsDir}/README.md`;
  const files = input.docsFiles.map((f) => f.replace(/\\/g, "/"));

  // (c) Empty docs dir while tasks exist.
  const markdownCount = files.filter((f) => isMarkdown(f)).length;
  if (markdownCount === 0 && input.taskCount > 0) {
    out.push({
      id: "layout.docs-empty",
      level: "warn",
      title: "Docs directory is empty while tasks exist",
      detail: `There are ${input.taskCount} task${input.taskCount === 1 ? "" : "s"} but no project docs, so agents have nothing durable to read.`,
      fix: `scaffold starter docs with \`repoos docs scaffold\`, or import your own with \`repoos docs import <path>\``,
    });
    return out;
  }

  // (a) AGENTS.md must mention the docs index.
  const agents = input.agentsMd;
  if (agents !== null) {
    const mentionsIndex =
      agents.includes(indexRel) ||
      (docsDir === "docs" && (agents.includes("docs/README.md") || agents.includes("docs/README")));
    if (!mentionsIndex && markdownCount > 0) {
      out.push({
        id: "layout.docs-index-unlinked",
        level: "warn",
        title: "AGENTS.md does not point at the docs index",
        detail: `Docs exist under ${docsDir}/ but AGENTS.md never mentions ${indexRel}, so agents are not told to read them.`,
        fix: `add a line to AGENTS.md pointing at ${indexRel} (e.g. under an "Operating loop" section)`,
      });
    }
  }

  // (b) Docs that no index links to.
  const indexFile = files.find((f) => f.toLowerCase() === "readme.md");
  const indexText = input.indexText ?? null;
  if (indexFile && markdownCount > 1 && indexText !== null) {
    const linked = linkedTargets(indexText, docsDir);
    const orphans = files.filter((f) => {
      if (!isMarkdown(f) || f === indexFile) return false;
      const normalized = f.replace(/^\.\//, "");
      return !linked.has(normalized) && !linked.has(basename(normalized));
    });
    if (orphans.length > 0) {
      out.push({
        id: "layout.docs-orphaned",
        level: "warn",
        title: `${orphans.length} doc${orphans.length === 1 ? "" : "s"} not linked from the docs index`,
        detail: `These files under ${docsDir}/ are not reachable from ${indexRel}: ${orphans.join(", ")}.`,
        fix: `link each doc from ${indexRel}'s reading order, or remove it if it is stale`,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      id: "layout.docs-wiring",
      level: "pass",
      title: "Project docs are wired for agents",
      detail:
        input.agentsMd === null
          ? `${docsDir}/ has docs; AGENTS.md was not found to check the index link.`
          : `AGENTS.md points at ${indexRel} and the index links the docs it needs.`,
      fix: null,
    });
  }
  return out;
}

function linkedTargets(indexText: string, docsDir: string): Set<string> {
  const out = new Set<string>();
  const base = docsDir.replace(/\/+$/, "");
  for (const m of indexText.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    let target = m[1];
    if (target.startsWith("#") || /^[a-z]+:/i.test(target)) continue;
    target = target.replace(/[?#].*$/, "");
    target = target.replace(/^\.\//, "");
    const norm = target.split("\\").join("/");
    out.add(norm);
    if (base && norm.startsWith(base + "/")) out.add(norm.slice(base.length + 1));
    else out.add(`${base}/${norm}`);
    out.add(basename(norm));
  }
  return out;
}

function isMarkdown(rel: string): boolean {
  const lower = rel.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".mdx");
}

/**
 * Backticked paths in AGENTS.md that look like repo files but are missing on
 * disk. Advisory only (#0704).
 */
export function findMissingAgentsMdPaths(root: string, agentsMd: string): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  const re = /`([^`\n]+)`/g;
  for (const m of agentsMd.matchAll(re)) {
    let raw = m[1].trim();
    if (!raw || /\s/.test(raw)) continue;
    if (/^https?:/i.test(raw) || /^[a-z]+:/i.test(raw)) continue;
    if (raw.startsWith("#")) continue;
    if (/[$<>|]/.test(raw)) continue;
    raw = raw.replace(/[?#].*$/, "").replace(/^\.\//, "");
    if (!raw || raw === "." || raw === "..") continue;
    const looksLikePath =
      raw.includes("/") ||
      /^[A-Za-z0-9_.-]+$/.test(raw) &&
        (raw.includes(".") ||
          raw.endsWith("/") ||
          ["justfile", "Makefile", "AGENTS.md", "CLAUDE.md"].includes(raw));
    if (!looksLikePath) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    const abs = resolve(root, raw);
    if (!existsSync(abs)) missing.push(raw);
  }
  return missing;
}

/**
 * Gather the filesystem inputs the pure `checkDocsWiring` predicate needs, then
 * run it. Split out so the CLI/doctor can call one function.
 */
export function checkDocsWiringAt(
  root: string,
  docsDir: string,
  taskCount: number,
): DocsWiringFinding[] {
  const docsAbs = resolve(root, docsDir);
  const files: string[] = [];
  if (existsSync(docsAbs) && statSync(docsAbs).isDirectory()) {
    for (const rel of safeWalkFiles(docsAbs)) files.push(rel.split(sep).join("/"));
  }
  const agentsPath = join(root, "AGENTS.md");
  const agentsMd = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : null;
  const indexText = readDocsIndex(root, docsDir);
  return checkDocsWiring({ docsDir, agentsMd, docsFiles: files, taskCount, indexText });
}

/** Like walkFiles but never throws on a symlink (checks just skip them). */
function safeWalkFiles(root: string, base = ""): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(join(root, base));
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const rel = base ? join(base, entry) : entry;
    const full = join(root, rel);
    let lst;
    try {
      lst = lstatSync(full);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) continue;
    if (lst.isDirectory()) out.push(...safeWalkFiles(root, rel));
    else if (lst.isFile()) out.push(rel);
  }
  return out;
}

/** Present for callers that want the docs index text read on demand. */
export function readDocsIndex(root: string, docsDir: string): string | null {
  const p = join(resolve(root, docsDir), "README.md");
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** The index-relative path used in messages, e.g. `docs/README.md`. */
export function docsIndexPath(docsDir: string): string {
  return `${docsDir.replace(/\/+$/, "")}/README.md`;
}

/** True when `source` looks like a zip archive (used for prompts/messages). */
export function isZipSource(source: string): boolean {
  return extname(source).toLowerCase() === ".zip";
}

/** Resolve a possibly `~`-prefixed user path against the home directory. */
export function expandHome(input: string, home = process.env.HOME ?? ""): string {
  if (input === "~") return home;
  if (input.startsWith("~/")) return join(home, input.slice(2));
  return input;
}
