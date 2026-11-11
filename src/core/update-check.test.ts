import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Release } from "../commands/upgrade.js";
import {
  UPDATE_CHECK_TTL_MS,
  checkForRepoosUpdate,
  emitCliUpdateNoticeOnExit,
  formatCliUpdateNotice,
  isUpdateCheckEnvDisabled,
  readUpdateCheckCache,
  shouldRunCliUpdateCheck,
  updateCheckCachePath,
  writeUpdateCheckCache,
} from "./update-check.js";

describe("shouldRunCliUpdateCheck", () => {
  it("honours env opt-out, config off, CI, --json, and non-TTY", () => {
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        env: { REPOOS_NO_UPDATE_CHECK: "1" },
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        config: { updates: { check: false } },
      }),
    ).toBe(false);
    expect(
      shouldRunCliUpdateCheck({
        cmd: "list",
        argv: [],
        env: { CI: "true" },
      }),
    ).toBe(false);
    expect(shouldRunCliUpdateCheck({ cmd: "list", argv: ["--json"] })).toBe(false);
    expect(shouldRunCliUpdateCheck({ cmd: "upgrade", argv: [] })).toBe(false);
  });
});

describe("checkForRepoosUpdate", () => {
  let home: string;
  let stderrSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "repoos-update-check-"));
  });

  afterEach(() => {
    stderrSpy?.mockRestore();
    rmSync(home, { recursive: true, force: true });
  });

  const standaloneRoot = "/opt/standalone/repoos";
  const stableRelease: Release = {
    tag_name: "v0.5.79",
    assets: [],
    prerelease: false,
    html_url: "https://github.com/repo-os/repoos/releases/tag/v0.5.79",
  };

  it("reports a newer stable release for standalone installs", async () => {
    const result = await checkForRepoosUpdate({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease: async () => stableRelease,
    });
    expect(result?.available).toBe(true);
    expect(result?.latestVersion).toBe("0.5.79");
    expect(result?.upgradeCommand).toBe("repoos upgrade");
  });

  it("stays silent when already up to date", async () => {
    const result = await checkForRepoosUpdate({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.79",
      readVersion: () => "0.5.79",
      fetchRelease: async () => stableRelease,
    });
    expect(result?.available).toBe(false);
  });

  it("does not nag source checkouts", async () => {
    const checkout = mkdtempSync(join(tmpdir(), "repoos-src-"));
    mkdirSync(join(checkout, "src"), { recursive: true });
    writeFileSync(join(checkout, "package.json"), "{}", "utf8");
    mkdirSync(join(checkout, "dist"), { recursive: true });
    const result = await checkForRepoosUpdate({
      home: () => home,
      installRoot: () => join(checkout, "dist"),
      readInstallVersion: () => "9.9.9-dev",
      readVersion: () => "9.9.9-dev",
      fetchRelease: async () => stableRelease,
    });
    expect(result).toBeNull();
    rmSync(checkout, { recursive: true, force: true });
  });

  it("does not treat an ahead-of-release dev version as outdated", async () => {
    const result = await checkForRepoosUpdate({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.80",
      readVersion: () => "0.5.80",
      fetchRelease: async () => stableRelease,
    });
    expect(result?.available).toBe(false);
  });

  it("reuses the cache within the TTL without calling fetch", async () => {
    const fetchRelease = vi.fn(async () => stableRelease);
    const path = updateCheckCachePath(home);
    writeUpdateCheckCache(path, {
      lastCheckedAt: 1_700_000_000_000,
      latestVersion: "0.5.79",
      url: stableRelease.html_url!,
      dismissedVersion: null,
    });
    await checkForRepoosUpdate({
      home: () => home,
      now: () => 1_700_000_000_000 + 60_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease,
    });
    expect(fetchRelease).not.toHaveBeenCalled();
    expect(readUpdateCheckCache(path)?.latestVersion).toBe("0.5.79");
  });

  it("fails soft on network errors and rate limits", async () => {
    const fetchRelease = vi.fn(async () => {
      throw new Error("GitHub API returned 403");
    });
    const result = await checkForRepoosUpdate({
      home: () => home,
      now: () => 1_700_000_000_000,
      installRoot: () => standaloneRoot,
      readInstallVersion: () => "0.5.78",
      readVersion: () => "0.5.78",
      fetchRelease,
    });
    expect(result).toBeNull();
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
      lastNoticeAt: now - 1_000,
    });
    const chunks: string[] = [];
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
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
