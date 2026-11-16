import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeTempDir } from "../../core/temp-dir.js";

describe("makeTempDir", () => {
  it("recreates a vanished TMPDIR base instead of failing ENOENT", () => {
    const parent = mkdtempSync(join(tmpdir(), "repoos-temp-parent-"));
    const missing = join(parent, "cleaned", "run");
    const prior = process.env.TMPDIR;
    process.env.TMPDIR = missing;
    try {
      const dir = makeTempDir("repoos-child-");
      expect(existsSync(dir)).toBe(true);
      expect(dir.startsWith(missing)).toBe(true);
      rmSync(dir, { recursive: true, force: true });
    } finally {
      if (prior === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prior;
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
