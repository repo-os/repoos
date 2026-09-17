import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REPOOS_AGENTS_SECTION_MARKER,
  repoOSAgentsSectionAddition,
  scaffoldInto,
} from "../../commands/init";
import { parseTask } from "../../core/task";
import { rmFixture } from "./helpers";

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-init-"));
  roots.push(root);
  return root;
}

function readTask(root: string, rel: string) {
  const absPath = join(root, rel);
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmFixture(root);
});

describe("scaffoldInto starter tasks", () => {
  it("leaves a ready new-project starter after the done 0001", () => {
    const root = scratch();
    const { created } = scaffoldInto(root, "Squishy: a tiny social app", "", "new");

    expect(existsSync(join(root, "work/0001-set-up-repoos.md"))).toBe(true);
    expect(created).toContain("work/0002-flesh-out-the-vision.md");

    expect(readTask(root, "work/0001-set-up-repoos.md").status).toBe("done");

    const starter = readTask(root, "work/0002-flesh-out-the-vision.md");
    expect(starter.id).toBe("0002");
    expect(starter.status).toBe("ready");
    expect(starter.body).toContain("Squishy: a tiny social app");
    expect(starter.body).toContain("repoos new");
  });

  it("notes when no description was given rather than faking one", () => {
    const root = scratch();
    scaffoldInto(root, "", "", "new");
    const starter = readTask(root, "work/0002-flesh-out-the-vision.md");
    expect(starter.status).toBe("ready");
    expect(starter.body).toMatch(/no description was given/i);
  });

  it("seeds a different ready starter for an existing repo", () => {
    const root = scratch();
    scaffoldInto(root, "", "", "existing");
    const starter = readTask(root, "work/0002-read-the-codebase.md");
    expect(starter.status).toBe("ready");
    expect(starter.title).toMatch(/this codebase/i);
    expect(starter.body).toContain("repoos new");
  });

  it("numbers the starter after tasks already on the board", () => {
    const root = scratch();
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "work/0001-existing.md"), "---\nid: '0001'\n---\n");
    writeFileSync(join(root, "work/0002-existing.md"), "---\nid: '0002'\n---\n");

    const { created } = scaffoldInto(root, "", "", "existing");
    expect(created).toContain("work/0003-read-the-codebase.md");
  });

  it("respects the repoos/ namespace layout", () => {
    const root = scratch();
    scaffoldInto(root, "desc", "repoos", "new");
    expect(existsSync(join(root, "repoos/work/0002-flesh-out-the-vision.md"))).toBe(true);
  });

  it("is idempotent — a re-run creates nothing", () => {
    const root = scratch();
    scaffoldInto(root, "desc", "", "new");
    const { created } = scaffoldInto(root, "desc", "", "new");
    expect(created).toEqual([]);
  });

  it("defaults to namespaced repoos/ layout for fresh existing-repo init", () => {
    const root = scratch();
    const { created } = scaffoldInto(root, "", "repoos", "existing");

    expect(created).toContain("repoos.toml");
    expect(created).toContain("repoos/work/");
    expect(created).toContain("repoos/docs/");
    expect(existsSync(join(root, "repoos/work/0001-set-up-repoos.md"))).toBe(true);
    expect(existsSync(join(root, "repoos/work/0002-read-the-codebase.md"))).toBe(true);
  });

  it("persists workDir/docsDir/cacheDir in repoos.toml for namespaced layout", () => {
    const root = scratch();
    scaffoldInto(root, "", "repoos", "new");
    const toml = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(toml).toContain('workDir = "repoos/work"');
    expect(toml).toContain('docsDir = "repoos/docs"');
    expect(toml).toContain('cacheDir = "repoos/.repoos"');
  });

  it("does not write workDir/docsDir to repoos.toml for root layout", () => {
    const root = scratch();
    scaffoldInto(root, "", "", "new");
    const toml = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(toml).not.toContain("workDir");
    expect(toml).not.toContain("docsDir");
  });

  it("supports custom namespace paths", () => {
    const root = scratch();
    const { created } = scaffoldInto(root, "", ".meta/repoos", "existing");

    expect(created).toContain("repoos.toml");
    expect(created).toContain(".meta/repoos/work/");
    expect(created).toContain(".meta/repoos/docs/");
    expect(existsSync(join(root, ".meta/repoos/work/0001-set-up-repoos.md"))).toBe(true);

    const toml = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(toml).toContain('workDir = ".meta/repoos/work"');
    expect(toml).toContain('docsDir = ".meta/repoos/docs"');
    expect(toml).toContain('cacheDir = ".meta/repoos/.repoos"');
  });

  it("AGENTS.md references configured workDir and docsDir", () => {
    const root = scratch();
    scaffoldInto(root, "", "repoos", "new");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("repoos/work/");
    expect(agents).toContain("repoos/docs/");
  });

  it("AGENTS.md uses root paths when namespace is empty", () => {
    const root = scratch();
    scaffoldInto(root, "", "", "new");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("`work/`");
    expect(agents).toContain("`docs/`");
  });

  it("starter task references configured docsDir", () => {
    const root = scratch();
    scaffoldInto(root, "my project", "repoos", "new");
    const starter = readTask(root, "repoos/work/0002-flesh-out-the-vision.md");
    expect(starter.body).toContain("repoos/docs/");
  });

  it("existing-repo starter task references configured docsDir in title", () => {
    const root = scratch();
    scaffoldInto(root, "", "repoos", "existing");
    const starter = readTask(root, "repoos/work/0002-read-the-codebase.md");
    expect(starter.title).toContain("repoos/docs/");
  });
});

describe("existing AGENTS.md RepoOS guidance", () => {
  it("offers a small, marked addition without replacing existing instructions", () => {
    const existing = "# Project instructions\n\nRun pnpm test before opening a PR.\n";
    const addition = repoOSAgentsSectionAddition(existing);

    expect(addition).toContain(REPOOS_AGENTS_SECTION_MARKER);
    expect(existing + addition).toContain("Run pnpm test before opening a PR.");
    expect(existing + addition).toContain("Use the RepoOS UI or `repoos` commands");
  });

  it("does not offer a duplicate addition when RepoOS guidance is already present", () => {
    expect(repoOSAgentsSectionAddition(`${REPOOS_AGENTS_SECTION_MARKER}\n\n## RepoOS`)).toBeNull();
    expect(
      repoOSAgentsSectionAddition("This repo uses **RepoOS** for task tracking.\n"),
    ).toBeNull();
  });

  it("uses the configured workDir in the addition", () => {
    const existing = "# My project\n";
    const addition = repoOSAgentsSectionAddition(existing, "repoos/work");
    expect(addition).toContain("repoos/work/");
  });

  it("defaults to work/ when workDir is not specified", () => {
    const existing = "# My project\n";
    const addition = repoOSAgentsSectionAddition(existing);
    expect(addition).toContain("`work/`");
  });
});
