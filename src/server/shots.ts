/**
 * Captured task-preview screenshots ("shots") — #0582.
 *
 * Deliberately separate from user-uploaded task screenshots
 * (`src/server/attachments.ts`, referenced from a task body's `## Screenshots`
 * section): shots live under `<workDir>/.attachments/<taskId>/shots/` and are
 * never referenced from the task `.md`. The server lists them from disk; the
 * drawer renders them in the Changes tab. The tree is gitignored
 * (`work/.attachments/`), and `repoos check`'s task-asset guard fails on any
 * tracked image under `work/`, so a captured shot can never be committed.
 *
 * Storage is behind {@link ShotStore} so a later hosted/cloud backend can be
 * added without touching callers. Metadata is kept in a `shots.json` manifest
 * next to the PNGs (target name, route, capture time); the image bytes are the
 * source of truth for existence, so a stray file still lists.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { DEFAULT_PREVIEW_TARGET } from "../core/shot-targets.js";
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_MIME } from "./attachments.js";

/** One captured shot, as returned to the CLI and the UI. */
export interface ShotMeta {
  /** File name within the task's `shots/` folder, e.g. "docs-site-1.png". */
  name: string;
  /** Resolved preview target this shot came from (#0582). */
  target: string;
  /** Requested route or URL, when the caller supplied one. */
  route?: string;
  /**
   * Human label the capture was captioned with (#0594), from the task's
   * declared shot list — e.g. "Task drawer open". Shown ahead of the target
   * name in the drawer.
   */
  label?: string;
  /** Repo-relative path, e.g. "work/.attachments/0582/shots/docs-site-1.png". */
  path: string;
  /** API URL the UI loads the image from. */
  url: string;
  size: number;
  mime: string;
  /** ISO-8601 capture time. */
  capturedAt: string;
}

/** Terminal-free manifest shape persisted in `shots.json`. */
interface ShotManifestEntry {
  name: string;
  target: string;
  route?: string;
  label?: string;
  mime: string;
  size: number;
  capturedAt: string;
}

interface ShotManifest {
  shots: ShotManifestEntry[];
}

/** The small storage interface shots go through (local today; cloud later). */
export interface ShotStore {
  list(): ShotMeta[];
  save(input: {
    target: string;
    route?: string;
    label?: string;
    mime?: string;
    name?: string;
    data: string;
  }): ShotMeta | { error: string };
  /** Absolute path for one stored file, or null when it is missing/escapes. */
  resolve(file: string): string | null;
}

export function shotsDir(root: string, workDir: string, taskId: string): string {
  return join(root, workDir, ".attachments", taskId, "shots");
}

/** API URL that serves one captured shot. */
export function shotUrl(taskId: string, file: string): string {
  return `/api/tasks/${taskId}/shots/${encodeURIComponent(file)}`;
}

/** Strip directories and hostile characters, keeping a readable target slug. */
function slug(value: string): string {
  const s = basename(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "shot";
}

/** Repo-relative `work/.attachments/<id>/shots/<file>` (forward slashes). */
function relPath(config: RepoOSConfig, taskId: string, file: string): string {
  return `${config.workDir.split("\\").join("/")}/.attachments/${taskId}/shots/${file}`;
}

function mimeForExt(ext: string): string {
  const found = Object.entries(SCREENSHOT_MIME).find(([, e]) => e === ext.toLowerCase());
  return found?.[0] ?? "image/png";
}

/** Read the manifest, tolerating a missing/corrupt file as "no metadata yet". */
function readManifest(dir: string): ShotManifestEntry[] {
  const file = join(dir, "shots.json");
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ShotManifest;
    return Array.isArray(parsed?.shots) ? parsed.shots : [];
  } catch {
    return [];
  }
}

function writeManifest(dir: string, entries: ShotManifestEntry[]): void {
  mkdirSync(dir, { recursive: true });
  const payload: ShotManifest = { shots: entries };
  writeFileSync(join(dir, "shots.json"), JSON.stringify(payload, null, 2));
}

/**
 * Local, disk-backed shot store for one task. `list()` merges the manifest with
 * whatever PNGs are actually on disk, so a file dropped in by hand still shows
 * (with target "unknown") and a manifest entry whose file vanished is dropped.
 */
export function localShotStore(config: RepoOSConfig, taskId: string): ShotStore {
  const dir = shotsDir(config.root, config.workDir, taskId);

  const list = (): ShotMeta[] => {
    if (!existsSync(dir)) return [];
    const entries = readManifest(dir);
    const byName = new Map(entries.map((e) => [e.name, e]));
    const files = readdirSync(dir)
      .filter((f) => f !== "shots.json" && /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f))
      .sort();
    const shots: ShotMeta[] = [];
    for (const file of files) {
      const abs = join(dir, file);
      let size = 0;
      try {
        size = statSync(abs).size;
      } catch {
        continue;
      }
      const meta = byName.get(file);
      shots.push({
        name: file,
        target: meta?.target ?? "unknown",
        ...(meta?.route ? { route: meta.route } : {}),
        ...(meta?.label ? { label: meta.label } : {}),
        path: relPath(config, taskId, file),
        url: shotUrl(taskId, file),
        size,
        mime: meta?.mime ?? mimeForExt(extname(file)),
        capturedAt: meta?.capturedAt ?? new Date(statSync(abs).mtimeMs).toISOString(),
      });
    }
    // Stable newest-last ordering by capture time, then name.
    shots.sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0));
    return shots;
  };

  return {
    list,
    save(input) {
      if (typeof input?.data !== "string" || input.data.length === 0) {
        return { error: "base64 image data is required" };
      }
      const mime = typeof input.mime === "string" && input.mime ? input.mime : "image/png";
      const ext = SCREENSHOT_MIME[mime];
      if (!ext) {
        return {
          error: `Unsupported image type "${mime}" — supported: ${Object.keys(SCREENSHOT_MIME).join(", ")}`,
        };
      }
      let buf: Buffer;
      try {
        buf = Buffer.from(input.data, "base64");
      } catch {
        return { error: "Invalid base64 image data" };
      }
      if (buf.length === 0) return { error: "Image data is empty" };
      if (buf.length > MAX_SCREENSHOT_BYTES) {
        return {
          error: `Image is too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB)`,
        };
      }
      mkdirSync(dir, { recursive: true });
      const target = (input.target || DEFAULT_PREVIEW_TARGET).trim() || DEFAULT_PREVIEW_TARGET;
      const taken = new Set(existsSync(dir) ? readdirSync(dir) : []);
      const prefix = slug(input.name ?? target);
      let n = 1;
      while (taken.has(`${prefix}-${n}${ext}`)) n++;
      const file = `${prefix}-${n}${ext}`;
      writeFileSync(join(dir, file), buf);

      const capturedAt = new Date().toISOString();
      const entry: ShotManifestEntry = {
        name: file,
        target,
        ...(input.route ? { route: input.route } : {}),
        ...(input.label ? { label: input.label } : {}),
        mime,
        size: buf.length,
        capturedAt,
      };
      const entries = readManifest(dir).filter((e) => e.name !== file);
      entries.push(entry);
      writeManifest(dir, entries);

      return {
        name: file,
        target,
        ...(input.route ? { route: input.route } : {}),
        ...(input.label ? { label: input.label } : {}),
        path: relPath(config, taskId, file),
        url: shotUrl(taskId, file),
        size: buf.length,
        mime,
        capturedAt,
      };
    },
    resolve(file) {
      const base = resolve(dir);
      const abs = resolve(base, decodeURIComponent(file));
      if (!abs.startsWith(base + sep)) return null;
      if (!existsSync(abs) || !statSync(abs).isFile()) return null;
      return abs;
    },
  };
}
