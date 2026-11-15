/**
 * Reload `repoos.toml` when it changes on disk (#0681).
 *
 * A long-lived `repoos serve` process loads config once at boot. Editing
 * `repoos.toml` by hand — or, more commonly, a close-out merging a task branch
 * that added a `[[preview.targets]]` block to the primary branch — used to
 * leave the running server on the old config until something else happened to
 * force a reload (an unrelated Settings PATCH). The field report hit exactly
 * that: a merged preview target was invisible (`"No usable [preview] config"`)
 * until a config write nudged the server.
 *
 * This watcher closes the gap with the same mechanism `ReloadManager` uses for
 * the build hash: an `fs.watch` on the repo root filtered to `repoos.toml`,
 * plus a low-frequency mtime poll as a platform-proof fallback (fs.watch can
 * drop events, and a merge writes the file through git, not an editor save).
 * A change is debounced, the file is re-read via `loadConfig`, and the result
 * is adopted in place on the live config object so every manager that captured
 * a reference (notably `PreviewManager`) sees it without a restart.
 *
 * It deliberately does NOT reload `.env` secrets beyond what `loadConfig`
 * already does, and it does not touch the build hash: this is config, not code.
 *
 * Zero runtime deps: node:fs only.
 */
import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { loadConfig, applyReloadedConfig } from "../core/config.js";
import { allowlistGroupPath } from "../core/allowlist-groups.js";
import type { RepoOSConfig } from "../core/types.js";

const DEBOUNCE_MS = 80;
const DEFAULT_POLL_MS = 3000;

export interface ConfigWatcherOptions {
  /** Repo root holding `repoos.toml`. */
  root: string;
  /** The live config holder to reconcile on change (usually `repoos`). */
  holder: { config: RepoOSConfig };
  /**
   * Called after a changed file is adopted, with the fresh and previous
   * configs, so the server can refresh derived state (index, SSE notice) and
   * log the reload. Never called when the parsed config is unchanged.
   */
  onChange?: (fresh: RepoOSConfig, prev: RepoOSConfig) => void;
  /** Low-frequency fallback poll interval in ms. */
  pollMs?: number;
  log?: (msg: string) => void;
}

/**
 * A stable signature of the config that matters: the raw file content. A
 * formatting-only rewrite (same parse) still counts as a change, which is fine
 * — the callback is cheap and idempotent, and a merge to main can rewrite the
 * file without semantically changing it. Comparing raw bytes keeps this
 * dependency-free and exact.
 */
function readConfigContent(root: string): string | null {
  const path = join(root, "repoos.toml");
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The machine-local allowlist group file's content, when this project is in a
 * group (#1132). A pause written by another member on this machine, or by a
 * tailnet peer over SSH, lands here — outside the repo root — so it has to be
 * part of the change signature or a running server would keep enforcing the
 * stale pause until restart.
 */
function groupFileContent(holder: { config: RepoOSConfig }): string {
  const name = holder.config.budget?.allowlistGroup;
  if (!name) return "";
  try {
    return readFileSync(allowlistGroupPath(name), "utf8");
  } catch {
    return "";
  }
}

/** `repoos.toml` plus the group file, so either can trigger a reload. */
function readConfigSignature(root: string, holder: { config: RepoOSConfig }): string {
  return `${readConfigContent(root) ?? ""}\u0000${groupFileContent(holder)}`;
}

export class ConfigWatcher {
  private readonly options: ConfigWatcherOptions;
  private fsWatcher: FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastContent: string | null;
  private stopped = false;

  constructor(options: ConfigWatcherOptions) {
    this.options = options;
    this.lastContent = readConfigSignature(options.root, options.holder);
  }

  /** Begin watching `repoos.toml` (fs.watch on the root dir + mtime poll). */
  start(): void {
    if (this.stopped) return;
    const dir = this.options.root;
    if (existsSync(dir)) {
      try {
        this.fsWatcher = watch(dir, (_event, filename) => {
          // fs.watch filenames are unreliable on some platforms; when absent we
          // cannot filter, so fall through and let the content compare decide.
          if (filename && filename.toString() !== "repoos.toml") return;
          this.schedule();
        });
      } catch {
        // fs.watch unavailable — the mtime poll covers us.
        this.fsWatcher = null;
      }
    }
    this.pollTimer = setInterval(() => this.onPoll(), this.options.pollMs ?? DEFAULT_POLL_MS);
    this.pollTimer.unref?.();
  }

  /** Stop watching and cancel timers. Idempotent. */
  stop(): void {
    this.stopped = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.fsWatcher) {
      try {
        this.fsWatcher.close();
      } catch {
        /* ignore */
      }
      this.fsWatcher = null;
    }
  }

  /**
   * Re-read and adopt the config if the on-disk file differs from what this
   * watcher last saw. Public so a server can force a check (and tests can drive
   * it without waiting for a timer).
   */
  reloadIfChanged(): boolean {
    if (this.stopped) return false;
    const content = readConfigSignature(this.options.root, this.options.holder);
    if (content === this.lastContent) return false;
    this.lastContent = content;
    if (content === null) return false; // the file was deleted; keep the last good config

    const prev = this.options.holder.config;
    let fresh: RepoOSConfig;
    try {
      fresh = loadConfig(this.options.root);
    } catch (err) {
      // A malformed half-written file (an editor mid-save, a bad hand edit)
      // must not crash the server or drop the working config. The next change
      // re-reads.
      this.log(`repoos.toml reload skipped — ${(err as Error).message}`);
      return false;
    }
    applyReloadedConfig(this.options.holder, fresh);
    this.log("repoos.toml changed on disk — reloaded config");
    this.options.onChange?.(fresh, prev);
    return true;
  }

  private schedule(): void {
    if (this.stopped) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.reloadIfChanged();
    }, DEBOUNCE_MS);
    this.debounceTimer.unref?.();
  }

  private onPoll(): void {
    if (this.stopped) return;
    // A group file lives outside the repo root, so `fs.watch` cannot see it.
    // The poll compares the full signature (repoos.toml + group file) and is
    // cheap: two small text reads at most once per poll interval.
    this.reloadIfChanged();
  }

  private log(msg: string): void {
    this.options.log?.(msg);
  }
}
