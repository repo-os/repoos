/**
 * Install a working `localStorage` / `sessionStorage` when the host runtime
 * leaves them undefined.
 *
 * Node >= 25 ships the Web Storage API and defines `localStorage` as an
 * accessor on `globalThis` — but it resolves to `undefined` unless the process
 * was started with `--localstorage-file`. vitest's jsdom environment installs
 * jsdom's globals only for keys not already present on `globalThis`, so it sees
 * `"localStorage" in globalThis === true`, skips it, and every test that
 * touches storage crashes on `Cannot read properties of undefined`.
 *
 * This is runtime-dependent, not flaky: under Node 24 the key is absent, jsdom
 * installs its own Storage, and the same tests pass. It bit RepoOS because the
 * close-out gate runs `repoos check` via `process.execPath` — the serving
 * process's runtime (Homebrew Node 26 under launchd) — while a developer
 * running `bun run test` by hand gets a different, older Node and never sees it.
 *
 * jsdom's `Storage` constructor is not publicly constructible, so this installs
 * a small spec-shaped in-memory implementation instead. It covers the Storage
 * interface the app uses (getItem/setItem/removeItem/clear/key/length).
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  clear(): void {
    this.store.clear();
  }

  [name: string]: unknown;
}

/**
 * Only defines the global when it is missing or broken — a runtime that already
 * provides a real Storage (a browser, or Node with --localstorage-file) keeps it.
 * The Node 25+ accessor is `configurable: true`, so redefining it is allowed.
 */
function ensureStorage(name: "localStorage" | "sessionStorage"): void {
  const existing = (globalThis as Record<string, unknown>)[name];
  if (existing && typeof (existing as Storage).getItem === "function") return;
  Object.defineProperty(globalThis, name, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
    enumerable: false,
  });
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
