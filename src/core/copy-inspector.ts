/**
 * Dev-only click-to-locate UI copy (#0509): path guards and editor-command parsing.
 * Zero runtime dependencies — spawn uses argv arrays built here.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** True when this repo checkout ships editable RepoOS UI sources. */
export function hasRepoOsUiSource(root: string): boolean {
  return existsSync(join(root, "src", "ui-app", "vite.config.ts"));
}

/** True when the UI bundle was built with copy-inspector attribution (not REPOOS_SHIP). */
export function readDevUiBuild(root: string): boolean {
  try {
    const info = JSON.parse(readFileSync(join(root, "dist", ".build-info.json"), "utf8")) as {
      devUi?: unknown;
    };
    return info.devUi === true;
  } catch {
    return false;
  }
}

/** True when the managed repo has a dev UI bundle (not REPOOS_SHIP). */
export function copyInspectorUiBuildReady(root: string): boolean {
  return hasRepoOsUiSource(root) && readDevUiBuild(root);
}

/** Repo-relative display path with optional `:line` suffix. */
export function formatCopyInspectorPath(repoRel: string, line: number | null): string {
  const normalized = repoRel.replace(/\\/g, "/");
  return line != null && line >= 1 ? `${normalized}:${line}` : normalized;
}

/**
 * Resolve a repo-relative file under `src/` to an absolute path. Returns null
 * when the target escapes the repo, is outside `src/`, or is not a real file.
 */
export function resolveCopyInspectorTarget(
  root: string,
  file: string,
  line?: number | null,
): { absPath: string; repoRel: string; line: number | null } | null {
  const rel = file.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..") || rel.startsWith("/")) return null;
  const abs = resolve(root, rel);
  const back = relative(root, abs);
  if (back.startsWith("..") || isAbsolute(back)) return null;
  const srcRoot = resolve(root, "src");
  if (abs !== srcRoot && !abs.startsWith(`${srcRoot}${sep}`)) return null;
  try {
    if (!statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  const lineNum =
    typeof line === "number" && Number.isFinite(line) && line >= 1 ? Math.floor(line) : null;
  return { absPath: abs, repoRel: back.replace(/\\/g, "/"), line: lineNum };
}

/**
 * Resolve a repo-relative file without the copy-inspector's `src/` restriction,
 * so callers can open other tracked files (a task markdown under `work/`) in
 * the configured editor. Same escape guard as {@link resolveCopyInspectorTarget},
 * but hardened against symlinks: both the repo root and the target are
 * `realpath`-resolved, and the REAL target must stay inside the REAL root, so a
 * symlink pointing outside the repo cannot smuggle an external file through.
 * The returned `repoRel` is the real location (what the editor should open).
 */
export function resolveRepoFileTarget(
  root: string,
  file: string,
): { absPath: string; repoRel: string } | null {
  const rel = file.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..") || rel.startsWith("/")) return null;
  const abs = resolve(root, rel);
  let realRoot: string;
  let realAbs: string;
  try {
    realRoot = realpathSync(root);
    realAbs = realpathSync(abs);
  } catch {
    return null;
  }
  const back = relative(realRoot, realAbs);
  if (!back || back.startsWith("..") || isAbsolute(back)) return null;
  try {
    if (!statSync(realAbs).isFile()) return null;
  } catch {
    return null;
  }
  return { absPath: realAbs, repoRel: back.replace(/\\/g, "/") };
}

/** Split a configured editor command into argv (no shell). Supports " and ' quotes. */
export function tokenizeEditorCommand(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) {
        quote = null;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out.filter(Boolean);
}

/** Insert `{file}` value; quote when the path contains whitespace so tokenizing stays one argv. */
function substituteFileToken(repoRelFile: string): string {
  return /\s/.test(repoRelFile) ? `"${repoRelFile.replace(/"/g, '\\"')}"` : repoRelFile;
}

/**
 * Substitute `{file}` / `{line}` and return argv for `spawn(command, args)`.
 * `{file}` is repo-relative; run the editor with `cwd` set to the repo root.
 * When `{line}` is absent from the template, `{file}` is only the path (no `:line`).
 */
export function buildEditorSpawnArgs(
  template: string,
  repoRelFile: string,
  line: number | null,
): string[] {
  const trimmed = template.trim();
  if (!trimmed) return [];
  const hasLine = trimmed.includes("{line}");
  const fileToken = substituteFileToken(repoRelFile);
  let resolved = trimmed.replace(/\{file\}/g, fileToken);
  if (hasLine) {
    if (line != null) {
      resolved = resolved.replace(/\{line\}/g, String(line));
    } else {
      resolved = resolved.replace(/:\{line\}/g, "").replace(/\{line\}/g, "");
    }
  }
  return tokenizeEditorCommand(resolved);
}
