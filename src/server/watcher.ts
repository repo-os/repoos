/**
 * File watcher over the work directory. Uses Node/Bun native fs.watch — no
 * dependency. Editors and agents often emit several events for a single save
 * (write temp file, rename, chmod), so we debounce per-path before telling the
 * LiveIndex anything.
 *
 * fs.watch recursion support varies by platform (works on macOS and Windows,
 * historically not on Linux). We try recursive first and fall back to watching
 * each subdirectory individually, re-scanning when directories appear.
 *
 * fs.watch can drop events under rapid filesystem activity. To ensure the index
 * never silently diverges from disk, we layer a low-frequency poll (every 5s) as
 * a platform-proof fallback, comparing mtimes to catch missed content changes,
 * new files, and deletions. fs.watch remains the primary, low-latency path.
 */
import { watch, existsSync, readFileSync, readdirSync, statSync, type FSWatcher } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { STORIES_DIR } from "../core/story-definition-files.js";
import type { LiveIndex } from "./live-index.js";

const DEBOUNCE_MS = 60;
const DEFAULT_POLL_MS = 5000;
/** Coalesce a burst of `.git` writes (commit touches HEAD+index+refs) into one signal. */
const GIT_SIGNAL_DEBOUNCE_MS = 120;

export class WorkWatcher {
  private config: RepoOSConfig;
  private index: LiveIndex;
  private watchers: FSWatcher[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private watchedDirs = new Set<string>();
  private pathToMtime = new Map<string, number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * "The repo root checkout's git state may have changed" (#0584). Fired for
   * working-tree writes under the watched dirs and for the explicit `.git`
   * state files (HEAD, index, refs) — branch switches, commits and staging all
   * land there without touching a watched file. The subscriber debounces and
   * coalesces, so a burst costs at most one `git status`.
   */
  private gitSignal: (() => void) | null = null;
  private gitSignalTimer: ReturnType<typeof setTimeout> | null = null;
  private gitStateWatched = new Set<string>();

  constructor(config: RepoOSConfig, index: LiveIndex) {
    this.config = config;
    this.index = index;
  }

  /** Register the git-state callback (may be set after `start()`). */
  setGitSignal(fn: () => void): void {
    this.gitSignal = fn;
  }

  start(): void {
    const workPath = join(this.config.root, this.config.workDir);
    if (existsSync(workPath)) {
      if (!this.tryRecursive(workPath)) {
        this.watchTree(workPath);
      }
    }
    if (this.config.stories?.enabled === true) {
      const storiesPath = join(this.config.root, STORIES_DIR);
      if (existsSync(storiesPath)) {
        this.watchTree(storiesPath);
      }
    }
    this.watchGitState();
    // Record every task file's current mtime BEFORE the first poll. `pathToMtime`
    // starts empty, so without this the first reconcile (5s after boot) saw all
    // ~600 task files as "new" and re-applied each one — three synchronous git
    // spawns per file — freezing the event loop for 30-60s right after every
    // restart (the UI's "server did not respond in time" popup). The boot index
    // build reads the files after this point, so nothing changed since is missed:
    // a later edit shows up as an mtime difference.
    if (existsSync(workPath)) this.scanDirectory(workPath, new Set(), false);
    this.pollTimer = setInterval(() => this.reconcile(), DEFAULT_POLL_MS);
    this.pollTimer.unref?.();
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
    if (this.gitSignalTimer) {
      clearTimeout(this.gitSignalTimer);
      this.gitSignalTimer = null;
    }
    this.gitStateWatched.clear();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pathToMtime.clear();
  }

  /**
   * Watch the git state files a branch switch, commit or stage updates
   * (#0584). The working-tree walk skips dot-directories, so `.git` is never
   * reached by it and these paths are watched explicitly:
   *
   *  - `HEAD`         — checkout / branch switch
   *  - `logs/HEAD`    — appended on every commit and HEAD move, whatever the
   *                     branch name (loose refs for deep branch names live in
   *                     subdirectories a non-recursive watch would miss)
   *  - `index`        — staging, and rewritten by every commit
   *  - `refs/heads`   — loose ref updates for first-level branch names
   *  - `packed-refs`  — repack / gc moving refs
   *
   * Missing files are skipped (a fresh repo has no `logs/HEAD` yet), and a
   * non-`.git` directory root is resolved from a `gitdir:` pointer file so a
   * linked worktree still reports its own state.
   *
   * Re-signalling from our own `git status` rewriting the index is bounded,
   * not a loop: git rewrites the index only when the stat cache actually
   * changed — which is the change that triggered the recompute in the first
   * place — so the follow-up pass finds nothing new and stays quiet.
   */
  private watchGitState(): void {
    const dotGit = join(this.config.root, ".git");
    if (!existsSync(dotGit)) return;
    let gitDir = dotGit;
    try {
      if (!statSync(dotGit).isDirectory()) {
        const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim() ?? "";
        const resolved = pointer ? resolve(dirname(dotGit), pointer) : "";
        if (!resolved || !existsSync(resolved)) return;
        gitDir = resolved;
      }
    } catch {
      return;
    }
    this.watchGitPath(join(gitDir, "HEAD"));
    this.watchGitPath(join(gitDir, "index"));
    this.watchGitPath(join(gitDir, "packed-refs"));
    this.watchGitPath(join(gitDir, "logs"));
    this.watchGitPath(join(gitDir, "logs", "HEAD"));
    this.watchGitPath(join(gitDir, "refs"));
    this.watchGitPath(join(gitDir, "refs", "heads"));
    // The `.git` directory itself: catches creates/removes not listed above.
    this.watchGitPath(gitDir);
  }

  private watchGitPath(path: string): void {
    if (this.gitStateWatched.has(path)) return;
    if (!existsSync(path)) return;
    this.gitStateWatched.add(path);
    try {
      const w = watch(path, () => this.scheduleGitSignal());
      this.watchers.push(w);
    } catch {
      /* not watchable on this platform — the poll/interval backstops cover it */
    }
  }

  /** Coalesce a flurry of git state writes into one callback invocation. */
  private scheduleGitSignal(): void {
    if (!this.gitSignal) return;
    if (this.gitSignalTimer) clearTimeout(this.gitSignalTimer);
    this.gitSignalTimer = setTimeout(() => {
      this.gitSignalTimer = null;
      try {
        this.gitSignal?.();
      } catch {
        /* a subscriber must never break the watcher */
      }
    }, GIT_SIGNAL_DEBOUNCE_MS);
    this.gitSignalTimer.unref?.();
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
        this.updateMtime(absPath);
        // A write under a watched dir can make the repo root checkout dirty
        // (or clean again once RepoOS commits it) — tell the git-state
        // subscriber (#0584). Its own debounce turns a burst into one signal.
        this.scheduleGitSignal();
        if (this.isStoryDefinitionFile(absPath)) {
          this.index.notifyStoryDefinitionsChanged();
          return;
        }
        this.index.applyFileChange(absPath);
      }, DEBOUNCE_MS),
    );
  }

  private updateMtime(absPath: string): void {
    try {
      if (existsSync(absPath)) {
        const stat = statSync(absPath);
        this.pathToMtime.set(absPath, stat.mtimeMs);
      } else {
        this.pathToMtime.delete(absPath);
      }
    } catch {
      /* ignore stat errors */
    }
  }

  private reconcile(): void {
    const workPath = join(this.config.root, this.config.workDir);
    if (!existsSync(workPath)) return;

    const seenPaths = new Set<string>();
    this.scanDirectory(workPath, seenPaths);

    // Check for deletions: tracked files that no longer exist
    for (const [path] of this.pathToMtime) {
      if (!seenPaths.has(path) && !existsSync(path)) {
        this.pathToMtime.delete(path);
        this.index.applyFileDelete(path);
        this.scheduleGitSignal();
      }
    }
  }

  /** `apply: false` only records mtimes (boot seeding); true re-applies new/changed files. */
  private scanDirectory(dir: string, seenPaths: Set<string>, apply = true): void {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".")) continue;
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            this.scanDirectory(fullPath, seenPaths, apply);
          } else if (this.isTaskFile(fullPath)) {
            seenPaths.add(fullPath);
            const currentMtime = stat.mtimeMs;
            const cachedMtime = this.pathToMtime.get(fullPath);

            if (cachedMtime === undefined) {
              // New file not yet tracked
              this.pathToMtime.set(fullPath, currentMtime);
              if (apply) this.index.applyFileChange(fullPath);
            } else if (cachedMtime !== currentMtime) {
              // Content changed (mtime differs)
              this.pathToMtime.set(fullPath, currentMtime);
              if (apply) this.index.applyFileChange(fullPath);
            }
          }
        } catch {
          /* ignore stat errors on individual entries */
        }
      }
    } catch {
      /* ignore directory read errors */
    }
  }

  private isTaskFile(absPath: string): boolean {
    return this.config.taskExtensions.includes(extname(absPath));
  }

  private isStoryDefinitionFile(absPath: string): boolean {
    const storiesRoot = join(this.config.root, STORIES_DIR);
    if (!absPath.startsWith(storiesRoot)) return false;
    return extname(absPath) === ".md";
  }
}
