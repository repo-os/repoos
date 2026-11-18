/**
 * `repoos upgrade` already fetches the release object GitHub returns for a
 * tag (including its notes body, #0361), but never read or printed it —
 * users saw only the version bump, with no way to know what changed short of
 * going to look at GitHub themselves (#0371).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cmdUpgrade,
  packageManagerUpgrade,
  releaseNotesToPrint,
  upgradeRestartReminder,
} from "../../commands/upgrade";

describe("repoos upgrade argument validation", () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  it.each(["invalid", undefined])(
    "rejects unsupported or missing channels (%s)",
    async (channel) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await cmdUpgrade(channel === undefined ? ["--channel"] : ["--channel", channel]);

      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("Invalid --channel value"));
      expect(error).toHaveBeenCalledWith(expect.stringContaining("Choose beta, canary, or rc"));
    },
  );

  it("rejects repeated --channel flags instead of silently using the first", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await cmdUpgrade(["--channel", "beta", "--channel", "invalid"]);

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Use --channel only once"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Choose one channel"));
  });
});

describe("upgradeRestartReminder", () => {
  it("tells the user when the server still runs the previous version", () => {
    expect(upgradeRestartReminder("0.5.78", "0.5.79")).toBe(
      "The running server is still v0.5.78; restart it (or run `repoos restart`) to use v0.5.79.",
    );
  });

  it.each([null, "0.5.79"])("does not print a reminder for running version %s", (version) => {
    expect(upgradeRestartReminder(version, "0.5.79")).toBeNull();
  });
});

describe("releaseNotesToPrint", () => {
  it("returns the trimmed body when notes are present", () => {
    expect(releaseNotesToPrint("  Some real release notes.  \n")).toBe("Some real release notes.");
  });

  it("returns null for an empty body (a release cut with no notes)", () => {
    expect(releaseNotesToPrint("")).toBeNull();
  });

  it("returns null for whitespace-only body", () => {
    expect(releaseNotesToPrint("   \n\t  ")).toBeNull();
  });

  it("returns null when body is null (GitHub's shape for an unset release body)", () => {
    expect(releaseNotesToPrint(null)).toBeNull();
  });

  it("returns null when body is undefined (older cached release shape)", () => {
    expect(releaseNotesToPrint(undefined)).toBeNull();
  });

  it("preserves multi-line markdown content as-is", () => {
    const body = "## Highlights\n\n- Thing one\n- Thing two";
    expect(releaseNotesToPrint(body)).toBe(body);
  });
});

describe("packageManagerUpgrade", () => {
  it.each([
    [
      "/opt/homebrew/Cellar/repoos/0.5.47/libexec/node_modules/@repo-os/repoos/dist",
      { label: "Homebrew", command: "brew update && brew upgrade repo-os/tap/repoos" },
    ],
    [
      "/Users/nick/.local/share/mise/installs/npm-@repo-os-repoos/lib/node_modules/@repo-os/repoos/dist",
      { label: "mise", command: "mise upgrade npm:@repo-os/repoos" },
    ],
    [
      "/Users/nick/.bun/install/global/node_modules/@repo-os/repoos/dist",
      { label: "Bun", command: "bun update -g @repo-os/repoos" },
    ],
    [
      "/Users/nick/.local/share/pnpm/global/5/node_modules/@repo-os/repoos/dist",
      { label: "pnpm", command: "pnpm update -g @repo-os/repoos" },
    ],
    [
      "/usr/local/lib/node_modules/@repo-os/repoos/dist",
      { label: "npm", command: "npm update -g @repo-os/repoos" },
    ],
  ])("recognizes %s", (root, expected) => {
    expect(packageManagerUpgrade(root)).toEqual(expected);
  });

  it("leaves standalone and source paths alone", () => {
    expect(packageManagerUpgrade("/Users/nick/.repoos")).toBeNull();
    expect(packageManagerUpgrade("/Users/nick/code/repoos/dist")).toBeNull();
  });
});
