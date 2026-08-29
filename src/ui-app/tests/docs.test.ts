import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateDocPath,
  createDocument,
  parseGeneratedDocument,
  docFreeformPrompt,
  skillSlug,
  validateSkillPath,
  buildSkillMarkdown,
  createSkill,
  skillFreeformPrompt,
} from "../../core/docs.js";
import type { RepoOSConfig } from "../../core/types.js";

const tmpRoots: string[] = [];
afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-docs-"));
  tmpRoots.push(dir);
  return dir;
}

function makeConfig(root: string, docsDir = "docs"): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir,
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    strictBuild: false,
    agents: {},
    builtInAgents: {},
    tunnelEnabled: false,
  } as RepoOSConfig;
}

describe("validateDocPath", () => {
  it("accepts valid paths under docsDir", () => {
    const config = makeConfig(tmpDir());
    expect(validateDocPath(config, "docs/foo.md").valid).toBe(true);
    expect(validateDocPath(config, "docs/sub/bar.md").valid).toBe(true);
    expect(validateDocPath(config, "docs/deeply/nested/path/file.md").valid).toBe(true);
  });

  it("rejects empty paths", () => {
    const config = makeConfig(tmpDir());
    const result = validateDocPath(config, "");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("path is required");
  });

  it("rejects paths with .. traversal", () => {
    const config = makeConfig(tmpDir());
    const result = validateDocPath(config, "docs/../work/foo.md");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("no .. or absolute paths");
  });

  it("rejects absolute paths", () => {
    const config = makeConfig(tmpDir());
    const result = validateDocPath(config, "/docs/foo.md");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("no .. or absolute paths");
  });

  it("rejects paths outside docsDir", () => {
    const config = makeConfig(tmpDir());
    const result = validateDocPath(config, "work/foo.md");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("must be under docs");
  });

  it("rejects paths that start with docsDir name but diverge", () => {
    const config = makeConfig(tmpDir());
    const result = validateDocPath(config, "docs-other/foo.md");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("must be under docs");
  });
});

describe("createDocument", () => {
  it("creates a document at the specified path", () => {
    const root = tmpDir();
    const config = makeConfig(root);
    const result = createDocument(config, {
      path: "docs/test.md",
      content: "# Test\nHello world",
    });

    expect(result.path).toBe("docs/test.md");
    expect(result.absPath).toBe(join(root, "docs/test.md"));

    const content = readFileSync(result.absPath, "utf8");
    expect(content).toBe("# Test\nHello world");
  });

  it("creates nested directories if needed", () => {
    const root = tmpDir();
    const config = makeConfig(root);
    const result = createDocument(config, {
      path: "docs/a/b/c/file.md",
      content: "deep",
    });

    const content = readFileSync(result.absPath, "utf8");
    expect(content).toBe("deep");
  });

  it("rejects invalid paths", () => {
    const root = tmpDir();
    const config = makeConfig(root);
    expect(() => {
      createDocument(config, {
        path: "work/foo.md",
        content: "test",
      });
    }).toThrow("path must be under docs");
  });
});

describe("parseGeneratedDocument", () => {
  it("parses frontmatter and body correctly", () => {
    const output = `---
path: docs/example.md
---

# Example Document

This is the body.`;

    const result = parseGeneratedDocument(output);
    expect(result.path).toBe("docs/example.md");
    expect(result.content).toContain("# Example Document");
    expect(result.content).toContain("This is the body.");
  });

  it("handles extra whitespace in frontmatter", () => {
    const output = `---
path:   docs/spaced.md
---

Body content`;

    const result = parseGeneratedDocument(output);
    expect(result.path).toBe("docs/spaced.md");
  });

  it("returns empty strings for missing path or content", () => {
    const noPath = `---
---

# Body`;
    expect(parseGeneratedDocument(noPath)).toEqual({ path: "", content: "" });

    const noBody = `---
path: docs/foo.md
---`;
    expect(parseGeneratedDocument(noBody)).toEqual({ path: "", content: "" });
  });
});

describe("docFreeformPrompt", () => {
  it("generates a valid prompt string", () => {
    const prompt = docFreeformPrompt("Create an API documentation");
    expect(prompt).toContain("You are the PM agent");
    expect(prompt).toContain("Create an API documentation");
    expect(prompt).toContain("---");
    expect(prompt).toContain("path: docs/");
  });

  it("trims description properly", () => {
    const prompt = docFreeformPrompt("  \n  Description  \n  ");
    expect(prompt).toContain("Description");
    expect(prompt).not.toContain("\n  Description");
  });
});

describe("skillSlug", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(skillSlug("My Cool Skill")).toBe("my-cool-skill");
    expect(skillSlug("  Weird__name!! ")).toBe("weird-name");
  });
});

describe("validateSkillPath", () => {
  it("accepts skills/<slug>/SKILL.md", () => {
    const config = makeConfig(tmpDir());
    expect(validateSkillPath(config, "skills/my-skill/SKILL.md").valid).toBe(true);
  });

  it("rejects paths outside the skills dir or wrong filename", () => {
    const config = makeConfig(tmpDir());
    expect(validateSkillPath(config, "docs/my-skill/SKILL.md").valid).toBe(false);
    expect(validateSkillPath(config, "skills/my-skill/README.md").valid).toBe(false);
    expect(validateSkillPath(config, "skills/My_Skill/SKILL.md").valid).toBe(false);
    expect(validateSkillPath(config, "skills/../etc/SKILL.md").valid).toBe(false);
  });
});

describe("createSkill", () => {
  it("writes SKILL.md with assembled frontmatter (manual)", () => {
    const root = tmpDir();
    const config = makeConfig(root);
    const res = createSkill(config, {
      name: "My Skill",
      description: "when to use it",
      body: "# Hi\nbody",
    });
    expect(res.path).toBe("skills/my-skill/SKILL.md");
    const text = readFileSync(join(root, res.path), "utf8");
    expect(text).toContain('name: "My Skill"');
    expect(text).toContain('description: "when to use it"');
    expect(text).toContain("# Hi");
  });

  it("writes uploaded content verbatim", () => {
    const root = tmpDir();
    const config = makeConfig(root);
    const raw = "---\nname: x\ndescription: y\n---\n\n# Raw\n";
    const res = createSkill(config, { name: "Raw One", content: raw });
    expect(readFileSync(join(root, res.path), "utf8")).toBe(raw);
  });

  it("rejects an empty name", () => {
    const config = makeConfig(tmpDir());
    expect(() => createSkill(config, { name: "  " })).toThrow();
  });
});

describe("buildSkillMarkdown", () => {
  it("prepends name/description frontmatter", () => {
    const md = buildSkillMarkdown("Foo", "bar", "# Foo\ntext");
    expect(md.startsWith('---\nname: "Foo"\ndescription: "bar"\n---\n')).toBe(true);
  });

  it("quotes values so a colon in the description stays valid YAML", () => {
    const md = buildSkillMarkdown("Foo", "Use when: doing X", "body");
    expect(md).toContain('description: "Use when: doing X"');
  });
});

describe("skillFreeformPrompt", () => {
  it("mentions SKILL.md and the skills path", () => {
    const prompt = skillFreeformPrompt("a linting skill");
    expect(prompt).toContain("SKILL.md");
    expect(prompt).toContain("path: skills/");
    expect(prompt).toContain("a linting skill");
  });
});
