import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findMissingAgentsMdPaths } from "./project-docs.js";

describe("findMissingAgentsMdPaths", () => {
  it("reports missing repo-relative paths in backticks", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-agents-paths-"));
    try {
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "README.md"), "# docs\n");
      const agents = "Read `docs/README.md` and also `packages/` or the root `justfile`.\n";
      const missing = findMissingAgentsMdPaths(root, agents);
      expect(missing).toContain("packages/");
      expect(missing).toContain("justfile");
      expect(missing).not.toContain("docs/README.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
