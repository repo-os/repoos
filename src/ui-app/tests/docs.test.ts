import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDocPath, createDocument, parseGeneratedDocument, docFreeformPrompt } from "../../core/docs.js";
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
