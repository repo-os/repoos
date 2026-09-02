import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installRegistrySkill } from "./skills-registry.js";
import type { RepoOSConfig } from "./types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0; });

function config(root: string): RepoOSConfig { return { root, skillsDir: "skills" } as RepoOSConfig; }

describe("installRegistrySkill", () => {
  it("vendors files and locks the registry hash", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-skills-")); roots.push(root);
    const result = installRegistrySkill(config(root), {
      id: "acme/skills/design", source: "acme/skills", slug: "design", installs: 1, hash: "abc123",
      files: [{ path: "SKILL.md", contents: "---\nname: design\n---\n" }, { path: "references/tokens.md", contents: "tokens" }],
    });
    expect(result.path).toBe("skills/design/SKILL.md");
    expect(readFileSync(join(root, "skills", "design", "references", "tokens.md"), "utf8")).toBe("tokens");
    expect(JSON.parse(readFileSync(join(root, "skills.lock.json"), "utf8"))).toMatchObject({ design: { id: "acme/skills/design", hash: "abc123" } });
  });

  it("rejects an unsafe payload before it writes anything", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-skills-")); roots.push(root);
    expect(() => installRegistrySkill(config(root), {
      id: "acme/skills/design", source: "acme/skills", slug: "design", installs: 1, hash: "abc123",
      files: [{ path: "SKILL.md", contents: "ok" }, { path: "../outside.md", contents: "no" }],
    })).toThrow("valid SKILL.md");
    expect(() => readFileSync(join(root, "skills", "design", "SKILL.md"), "utf8")).toThrow();
  });
});
