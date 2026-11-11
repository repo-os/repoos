import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Release } from "../commands/upgrade.js";
import {
  UPDATE_CHECK_FAILURE_CACHE_MS,
  UPDATE_CHECK_TTL_MS,
  emitCliUpdateNoticeOnExit,
  formatCliUpdateNotice,
  isUpdateCheckEnvDisabled,
  prefetchCliUpdateCheck,
  readUpdateCheckCache,
  refreshUpdateCheckCache,
  shouldRefreshUpdateCheckCache,
  shouldRunCliUpdateCheck,
  updateCheckCachePath,
  writeUpdateCheckCache,
} from "./update-check.js";

describe("shouldRunCliUpdateCheck", () => {
  it("honours env opt-out, config off, CI, --json, non-TTY, and skip commands", () => {
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        env: { REPOOS_NO_UPDATE_CHECK: "1" },
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        config: { updates: { check: false } },
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        env: { CI: "true" },
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: ["--json"],
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "upgrade",
        argv: [],
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "api",
        argv: ["GET", "/api/tasks"],
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        stderrIsTTY: false,
        stdoutIsTTY: true,
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        stderrIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(true);
  });
});

describe("refreshUpdateCheckCache", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "repoos-update-check-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const standaloneRoot = "/opt/standalone/repoos";
  const stableRelease: Release = {
    tag_name: "v0.5.79",
    assets: [],
    prerelease: false,
    html_url: "https://github.com/repo-os/repoos/releases/tag/v0.5.79",
  };

  it("stores a successful stable lookup", async () => {
    const path = updateCheckCachePath(home);
    await refreshUpdateCheckCache(path, {
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease: async () => stableRelease,
    });
    const cache = readUpdateCheckCache(path);
    expect(cache?.latestVersion).toBe("0.5.79");
    expect(cache?.channel).toBe("");
    expect(cache?.fetchSucceeded).toBe(true);
  });

  it("does not nag source checkouts", async () => {
    const checkout = mkdtempSync(join(tmpdir(), "repoos-src-"));
    mkdirSync(join(checkout, "src"), { recursive: true });
    writeFileSync(join(checkout, "package.json"), "{}", "utf8");
    mkdirSync(join(checkout, "dist"), { recursive: true });
    const path = updateCheckCachePath(home);
    const result = await refreshUpdateCheckCache(path, {
      home: () => home,
      installRoot: () => join(checkout, "dist"),
      readInstallVersion: () => "9.9.9-dev",
      readVersion: () => "9.9.9-dev",
      fetchRelease: async () => stableRelease,
    });
    expect(result).toBeNull();
    rmSync(checkout, { recursive: true, force: true });
  });

  it("caches fetch failures and backs off refetch for 60s", async () => {
    const fetchRelease = vi.fn(async () => {
      throw new Error("GitHub API returned 429");
    });
    const path = updateCheckCachePath(home);
    const base = 1_700_000_000_000;
    await refreshUpdateCheckCache(path, {
      home: () => home,
      now: () => base,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease,
    });
    expect(fetchRelease).toHaveBeenCalledTimes(1);
    const afterFail = readUpdateCheckCache(path);
    expect(afterFail?.lastCheckedAt).toBe(base);
    expect(afterFail?.fetchSucceeded).toBe(false);

    fetchRelease.mockClear();
    expect(
      shouldRefreshUpdateCheckCache(afterFail, null, base + UPDATE_CHECK_FAILURE_CACHE_MS - 1),
    ).toBe(false);
    prefetchCliUpdateCheck({
      home: () => home,
      now: () => base + 1000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchRelease).not.toHaveBeenCalled();
  });

  it("reuses a successful cache within the 24h TTL without calling fetch", async () => {
    const fetchRelease = vi.fn(async () => stableRelease);
    const path = updateCheckCachePath(home);
    writeUpdateCheckCache(path, {
      lastCheckedAt: 1_700_000_000_000,
      latestVersion: "0.5.79",
      url: stableRelease.html_url!,
      dismissedVersion: null,
      channel: "",
      fetchSucceeded: true,
    });
    expect(
      shouldRefreshUpdateCheckCache(
        readUpdateCheckCache(path),
        null,
        1_700_000_000_000 + 60_000,
      ),
    ).toBe(false);
    prefetchCliUpdateCheck({
      home: () => home,
      now: () => 1_700_000_000_000 + 60_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchRelease).not.toHaveBeenCalled();
  });

  it("ignores cached channel data after the install channel changes", async () => {
    const path = updateCheckCachePath(home);
    writeUpdateCheckCache(path, {
      lastCheckedAt: 1_700_000_000_000,
      latestVersion: "0.5.83-beta.2",
      url: "https://github.com/repo-os/repoos/releases/tag/v0.5.83-beta.2",
      dismissedVersion: null,
      channel: "beta",
      fetchSucceeded: true,
    });
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    emitCliUpdateNoticeOnExit({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
    });
    expect(stderrWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
  });
});

describe("emitCliUpdateNoticeOnExit", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "repoos-update-notice-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("prints at most once per notice TTL", () => {
    const path = updateCheckCachePath(home);
    const now = 1_700_000_000_000;
    writeUpdateCheckCache(path, {
      lastCheckedAt: now,
      latestVersion: "0.5.79",
      url: "https://github.com/repo-os/repoos/releases/tag/v0.5.79",
      dismissedVersion: null,
      channel: "",
      fetchSucceeded: true,
      lastNoticeAt: now - 1_000,
    });
    const chunks: string[] = [];
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    emitCliUpdateNoticeOnExit({
      home: () => home,
      now: () => now,
      installRoot: () => "/opt/standalone/repoos",
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
    });
    expect(chunks.join("")).toBe("");
    stderrWrite.mockClear();
    emitCliUpdateNoticeOnExit({
      home: () => home,
      now: () => now + UPDATE_CHECK_TTL_MS,
      installRoot: () => "/opt/standalone/repoos",
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
    });
    expect(chunks.join("")).toContain("v0.5.79");
    stderrWrite.mockRestore();
  });

  it("does not treat an ahead-of-release install as outdated", () => {
    const path = updateCheckCachePath(home);
    writeUpdateCheckCache(path, {
      lastCheckedAt: 1_700_000_000_000,
      latestVersion: "0.5.79",
      url: "https://github.com/repo-os/repoos/releases/tag/v0.5.79",
      dismissedVersion: null,
      channel: "",
      fetchSucceeded: true,
    });
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    emitCliUpdateNoticeOnExit({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => "/opt/standalone/repoos",
      readInstallVersion: () => "0.5.80",
      readVersion: () => "0.5.80",
    });
    expect(stderrWrite).not.toHaveBeenCalled();
    stderrWrite.mockRestore();
  });

  it("does not wait on a slow in-flight prefetch", async () => {
    const path = updateCheckCachePath(home);
    let resolveFetch!: () => void;
    const fetchRelease = vi.fn(
      () =>
        new Promise<Release>((resolve) => {
          resolveFetch = () =>
            resolve({
              tag_name: "v0.5.99",
              assets: [],
              prerelease: false,
              html_url: "https://github.com/repo-os/repoos/releases/tag/v0.5.99",
            });
        }),
    );
    prefetchCliUpdateCheck({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => "/opt/standalone/repoos",
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease,
    });
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const start = Date.now();
    emitCliUpdateNoticeOnExit({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => "/opt/standalone/repoos",
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
    });
    expect(Date.now() - start).toBeLessThan(200);
    expect(stderrWrite).not.toHaveBeenCalled();
    resolveFetch();
    stderrWrite.mockRestore();
  });
});

describe("formatCliUpdateNotice", () => {
  it("names the install-specific upgrade command", () => {
    const line = formatCliUpdateNotice({
      currentVersion: "0.5.78",
      latestVersion: "0.5.79",
      available: true,
      releaseUrl: "https://example.com/r",
      upgradeCommand: "brew update && brew upgrade repo-os/tap/repoos",
      installKind: "package-manager",
    });
    expect(line).toContain("brew upgrade");
    expect(line).toContain("https://example.com/r");
  });
});

describe("isUpdateCheckEnvDisabled", () => {
  it("accepts both env spellings", () => {
    expect(isUpdateCheckEnvDisabled({ REPOOS_NO_UPDATE_CHECK: "1" })).toBe(true);
    expect(isUpdateCheckEnvDisabled({ REPOOS_DISABLE_UPDATE_CHECK: "1" })).toBe(true);
  });
});
