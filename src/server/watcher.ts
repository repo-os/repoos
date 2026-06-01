/**
 * File watcher over the work directory. Uses Node/Bun native fs.watch — no
 * dependency. Editors and agents often emit several events for a single save
 * (write temp file, rename, chmod), so we debounce per-path before telling the
 * LiveIndex anything.
 *
 * fs.watch recursion support varies by platform (works on macOS and Windows,
 * historically not on Linux). We try recursive first and fall back to watching
 * each subdirectory individually, re-scanning when directories appear.
 */
import {
  watch,
  existsSync,
  readdirSync,
  statSync,
  type FSWatcher,
} from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import type { LiveIndex } from "./live-index.js";

const DEBOUNCE_MS = 60;

export class WorkWatcher {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private watchers: FSWatcher[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private watchedDirs = new Set<string>();

  constructor(config: RepoOSConfig, index: LiveIndex) {
    this.config = config;
    this.index = index;
  }

  start(): void {
    const workPath = join(this.config.root, this.config.workDir);
    if (!existsSync(workPath)) return;
    if (!this.tryRecursive(workPath)) {
      this.watchTree(workPath);
    }
  }

  stop(): void {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    this.watchers = [];
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.watchedDirs.clear();
  }

  private tryRecursive(dir: string): boolean {
    try {
      const w = watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        this.schedule(join(dir, filename.toString()));
      });
      this.watchers.push(w);
      return true;
    } catch {
      return false; // ENOSYS / EINVAL on platforms without recursive support
    }
  }

  private watchTree(dir: string): void {
    if (this.watchedDirs.has(dir)) return;
    let w: FSWatcher;
    try {
      w = watch(dir, (_event, filename) => {
        if (!filename) return;
        const full = join(dir, filename.toString());
        // a new subdirectory may need its own watcher
        try {
          if (existsSync(full) && statSync(full).isDirectory()) {
            this.watchTree(full);
            return;
          }
        } catch {
          /* fall through to schedule */
        }
        this.schedule(full);
      });
    } catch {
      return;
    }
    this.watchers.push(w);
    this.watchedDirs.add(dir);
    // recurse into existing subdirs
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".")) continue;
        const sub = join(dir, entry);
        if (statSync(sub).isDirectory()) this.watchTree(sub);
      }
    } catch {
      /* ignore */
    }
  }

  private schedule(absPath: string): void {
    const existing = this.timers.get(absPath);
    if (existing) clearTimeout(existing);
    this.timers.set(
      absPath,
      setTimeout(() => {
        this.timers.delete(absPath);
        this.index.applyFileChange(absPath);
      }, DEBOUNCE_MS),
    );
  }
}
