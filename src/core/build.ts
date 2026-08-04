/**
 * Build-staleness detection for linked dev builds.
 *
 * When `ros` is run from a linked dev install (both `src/` and `dist/`
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
function findPackageRoot(): string | null {
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

  // Published install: dist/ exists but no src/
  if (!existsSync(srcDir)) {
    return { stale: false, message: null, code: "published" };
  }

  // No dist/ at all
  if (!existsSync(distDir)) {
    return {
      stale: true,
      message:
        "No build found — run `bun run build` before using `ros`.",
      code: "no-build",
    };
  }

  // No marker (pre-feature build)
  if (!existsSync(marker)) {
    return {
      stale: true,
      message:
        "Cannot verify build freshness (no .build-info.json).\n  You may be running old compiled code. Run `bun run build` to be safe.",
      code: "no-marker",
    };
  }

  // Read marker and compare
  let recorded: { hash: string };
  try {
    recorded = JSON.parse(readFileSync(marker, "utf8"));
  } catch {
    return {
      stale: true,
      message:
        "Build marker is corrupt. Run `bun run build` to regenerate.",
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
        "  You are running OLD compiled code, and `ros serve` serves the OLD UI.\n" +
        "  Run `bun run build` to update.",
      code: "stale",
    };
  }

  return { stale: false, message: null, code: "fresh" };
}

/** Platform path separator pattern for import.meta.url detection. */
const pathSep = process.platform === "win32" ? "\\\\" : "/";
