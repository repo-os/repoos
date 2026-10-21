import { describe, expect, it } from "vitest";
import { mkdtempSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { preferAppleGit } from "../../core/runtime";
import { rmFixture } from "./helpers";

describe("preferAppleGit", () => {
  it("is a no-op off macOS", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/opt/homebrew/bin:/usr/bin" };
    expect(preferAppleGit(env, "linux")).toBe(false);
    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin");
  });

  it("honours the REPOOS_PREFER_APPLE_GIT=0 opt-out", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/opt/homebrew/bin", REPOOS_PREFER_APPLE_GIT: "0" };
    expect(preferAppleGit(env, "darwin")).toBe(false);
    expect(env.PATH).toBe("/opt/homebrew/bin");
  });

  it.runIf(process.platform === "darwin")("puts a git-only symlink dir first on PATH, once", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-applegit-"));
    const dir = join(root, "bin");
    try {
      const env: NodeJS.ProcessEnv = { PATH: ["/opt/homebrew/bin", "/usr/bin"].join(delimiter) };
      expect(preferAppleGit(env, "darwin", dir)).toBe(true);
      expect(env.PATH!.split(delimiter)[0]).toBe(dir);
      expect(readlinkSync(join(dir, "git"))).toBe("/usr/bin/git");
      expect(preferAppleGit(env, "darwin", dir)).toBe(false); // idempotent
      expect(env.PATH!.split(delimiter).filter((p) => p === dir)).toHaveLength(1);
    } finally {
      rmFixture(root);
    }
  });
});
