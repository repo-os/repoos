/**
 * Build-staleness detection for linked dev builds.
 *
 * When `repoos` is run from a linked dev install (both `src/` and `dist/`
 * exist beside the running binary), compares a hash of `src/` against the
 * marker written by the build pipeline. Stale builds produce a warning or
 * error; published installs (no `src/`) are a silent no-op.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export interface BuildCheckResult {
  stale: boolean;
  /** Human-readable message, or null if no issue. */
  message: string | null;
  /**
   * Machine-readable code:
   *   'fresh'       — build is up to date
   *   'stale'       — src/ changed since last build
   *   'no-marker'   — dist/.build-info.json missing (pre-feature build)
   *   'no-build'    — dist/ does not exist
   *   'dev-mode'    — running from src/, not dist/ (node --strip-types)
   *   'published'   — no src/ directory (npm/published install)
   */
  code: "fresh" | "stale" | "no-marker" | "no-build" | "dev-mode" | "published";
}

/**
 * Resolve the package root relative to the running binary.
 * Same resolution pattern as findUiHtml in server.ts.
 */
export function findPackageRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // compiled: dist/core/build.js -> repo root is ../..
  // dev:      src/core/build.ts   -> repo root is ../..
  const parent = dirname(here);
  const grandparent = dirname(parent);
  if (existsSync(join(grandparent, "package.json"))) return grandparent;
  // fallback: try one more level up
  const great = dirname(grandparent);
  if (existsSync(join(great, "package.json"))) return great;
  return null;
}

/** Compute a sha256 hash of every file under src/. Returns null if src/ absent. */
function hashSrcDir(root: string): string | null {
  const srcDir = join(root, "src");
  if (!existsSync(srcDir)) return null;
  const hash = createHash("sha256");
  const files: string[] = [];
  function walk(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }
  walk(srcDir);
  files.sort();
  for (const f of files) {
    hash.update(f.slice(root.length + 1));
    hash.update(readFileSync(f));
  }
  return hash.digest("hex");
}

/**
 * Staleness check against an explicit repo root — used for a task's worktree
 * before previewing it. A worktree is stale when its `src/` hash no longer
 * matches its own `dist/.build-info.json` (or the marker is missing). A
 * checkout with no `src/` is treated as published (nothing to check).
 */
export function checkBuildForRoot(root: string): BuildCheckResult {
  if (!root) {
    return { stale: false, message: null, code: "published" };
  }
  const distDir = join(root, "dist");
  const srcDir = join(root, "src");
  if (!existsSync(srcDir)) {
    return { stale: false, message: null, code: "published" };
  }
  if (!existsSync(distDir)) {
    return {
      stale: true,
      message: "No build found — run `bun run build` before using `repoos`.",
      code: "no-build",
    };
  }
  const marker = join(distDir, ".build-info.json");
  if (!existsSync(marker)) {
    return {
      stale: true,
      message:
        "Cannot verify build freshness (no .build-info.json).\n  You may be running old compiled code. Run `bun run build` to be safe.",
      code: "no-marker",
    };
  }
  let recorded: { hash: string };
  try {
    recorded = JSON.parse(readFileSync(marker, "utf8"));
  } catch {
    return {
      stale: true,
      message: "Build marker is corrupt. Run `bun run build` to regenerate.",
      code: "no-marker",
    };
  }
  const currentHash = hashSrcDir(root);
  if (!currentHash) {
    return { stale: false, message: null, code: "published" };
  }
  if (recorded.hash !== currentHash) {
    return {
      stale: true,
      message:
        "Stale build: src/ has changed since the last `bun run build`.\n" +
        "  You are running OLD compiled code, and `repoos serve` serves the OLD UI.\n" +
        "  Run `bun run build` to update.",
      code: "stale",
    };
  }
  return { stale: false, message: null, code: "fresh" };
}

export function checkBuild(): BuildCheckResult {
  const root = findPackageRoot();
  if (!root) {
    return { stale: false, message: null, code: "published" };
  }

  const distDir = join(root, "dist");
  const srcDir = join(root, "src");
  const marker = join(distDir, ".build-info.json");

  // Detect dev mode: running from src/, not from compiled dist/
  const binPath = fileURLToPath(import.meta.url);
  if (binPath.includes(`${pathSep}src${pathSep}`)) {
    return { stale: false, message: null, code: "dev-mode" };
  }

  return checkBuildForRoot(root);
}

/**
 * Read the build timestamp for a checkout. The timestamp lives in
 * `dist/.build-stamp.json` (gitignored) rather than `dist/.build-info.json`,
 * so the marker that staleness and reload compare stays byte-identical across
 * rebuilds of identical source. Falls back to a legacy inline `generatedAt` in
 * the marker so installs built before the split still report a build age.
 * Best-effort: null when neither file is readable.
 */
export function readBuildStamp(root: string): string | null {
  const read = (file: string): string | null => {
    try {
      const info = JSON.parse(readFileSync(file, "utf8")) as { generatedAt?: unknown };
      return typeof info.generatedAt === "string" && info.generatedAt ? info.generatedAt : null;
    } catch {
      return null;
    }
  };
  return (
    read(join(root, "dist", ".build-stamp.json")) ?? read(join(root, "dist", ".build-info.json"))
  );
}

function readGeneratedAt(file: string): string | null {
  try {
    const info = JSON.parse(readFileSync(file, "utf8")) as { generatedAt?: unknown };
    return typeof info.generatedAt === "string" && info.generatedAt ? info.generatedAt : null;
  } catch {
    return null;
  }
}

/**
 * Build version + timestamp for the running install, resolved relative to THIS
 * module so it works for every layout:
 *
 *   - standalone (curl / `repoos upgrade`):  <installRoot>/core/build.js
 *       → `.build-info.json` + `.build-stamp.json` sit at <installRoot>
 *   - linked dev build (compiled):           <repo>/dist/core/build.js
 *       → both files sit at <repo>/dist
 *   - source run (`bun src/cli/index.ts`):   <repo>/src/core/build.ts
 *       → no marker beside it; fall back to <repo>/dist, then package.json
 *
 * The old path read `package.json` only — but the release tarball
 * (`tar -C dist .`) ships `.build-info.json` (`{ hash, version }`) and
 * `.build-stamp.json`, NOT `package.json`, so every standalone install
 * reported its version as "unknown". `.build-info.json` is the source of truth
 * here; `package.json` is just the last-resort fallback for a source checkout.
 */
export function readBuildMeta(): { version: string | null; buildAt: string | null } {
  const here = dirname(fileURLToPath(import.meta.url)); // <x>/core
  return readBuildMetaFrom(dirname(here)); // <x>: installRoot | repo/dist | repo/src
}

/**
 * The dir-relative core of {@link readBuildMeta}, split out so it can be tested
 * against synthetic layouts. `markerDir` is where `.build-info.json` /
 * `.build-stamp.json` are expected to sit (with `<markerDir>/../dist` tried as
 * the source-checkout fallback).
 */
export function readBuildMetaFrom(markerDir: string): {
  version: string | null;
  buildAt: string | null;
} {
  const dirs = [markerDir, join(markerDir, "..", "dist")];

  let version: string | null = null;
  let buildAt: string | null = null;
  for (const dir of dirs) {
    if (version === null) {
      try {
        const info = JSON.parse(readFileSync(join(dir, ".build-info.json"), "utf8")) as {
          version?: unknown;
        };
        if (typeof info.version === "string" && info.version) version = info.version;
      } catch {
        /* no marker in this dir */
      }
    }
    if (buildAt === null) {
      buildAt =
        readGeneratedAt(join(dir, ".build-stamp.json")) ??
        readGeneratedAt(join(dir, ".build-info.json"));
    }
  }

  if (version === null) {
    const root = findPackageRoot();
    if (root) {
      try {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
          version?: unknown;
        };
        if (typeof pkg.version === "string" && pkg.version) version = pkg.version;
      } catch {
        /* package.json unreadable */
      }
    }
  }

  return { version, buildAt };
}

/** Platform path separator pattern for import.meta.url detection. */
const pathSep = process.platform === "win32" ? "\\\\" : "/";
