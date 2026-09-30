import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REPOOS_AGENTS_SECTION_MARKER,
  areaVocabularyTomlAddition,
  canaryUnderRootRuntimeDir,
  quoteBlock,
  repoOSAgentsSectionAddition,
  scaffoldInto,
  validateNamespace,
} from "../../commands/init";
import { loadConfig } from "../../core/config";
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

describe("validateNamespace", () => {
  it("accepts empty string as root", () => {
    expect(validateNamespace("")).toBe("");
  });

  it("accepts / as root", () => {
    expect(validateNamespace("/")).toBe("");
  });

  it("accepts plain namespace", () => {
    expect(validateNamespace("repoos")).toBe("repoos");
  });

  it("accepts nested namespace", () => {
    expect(validateNamespace(".meta/repoos")).toBe(".meta/repoos");
  });

  it("strips trailing slashes", () => {
    expect(validateNamespace("repoos/")).toBe("repoos");
    expect(validateNamespace(".meta/repoos/")).toBe(".meta/repoos");
    expect(validateNamespace("a/b/c/")).toBe("a/b/c");
  });

  it("rejects absolute paths other than /", () => {
    expect(validateNamespace("/etc")).toContain("!");
    expect(validateNamespace("/repoos")).toContain("!");
  });

  it("rejects parent traversal", () => {
    expect(validateNamespace("../repoos")).toContain("!");
    expect(validateNamespace("repoos/..")).toContain("!");
  });

  it("rejects ./ prefix", () => {
    expect(validateNamespace("./repoos")).toContain("!");
    expect(validateNamespace("./a/b")).toContain("!");
  });

  it("rejects unsafe characters", () => {
    expect(validateNamespace("repo os")).toContain("!");
    expect(validateNamespace("repoos!")).toContain("!");
    expect(validateNamespace("repoos@home")).toContain("!");
  });

  it("rejects bare dot (cwd) with a message that names what was typed", () => {
    const result = validateNamespace(".");
    expect(result).toContain("!");
    // Regression: the message used to read "! is not a valid namespace…" with
    // no reference to the input, because the leading "." was left out.
    expect(result.slice(1)).toMatch(/^\. is not a valid namespace/);
  });

  it("trims whitespace", () => {
    expect(validateNamespace("  repoos  ")).toBe("repoos");
  });

  it("rejects a namespace that collides with a root marker file", () => {
    // repoos.toml and AGENTS.md must stay at the repo root — a namespace with
    // either name would make mkdir hit ENOTDIR against that existing file.
    expect(validateNamespace("repoos.toml")).toContain("!");
    expect(validateNamespace("AGENTS.md")).toContain("!");
    expect(validateNamespace("AGENTS.md/nested")).toContain("!");
  });
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

  it("keeps every line of a multi-line description inside the quote", () => {
    const root = scratch();
    const desc = "Build **Neung**.\n\n- Android only\n- Kotlin";
    scaffoldInto(root, desc, "", "new");
    const starter = readTask(root, "work/0002-flesh-out-the-vision.md");
    expect(starter.body).toContain(quoteBlock(desc));
    expect(quoteBlock(desc)).toBe("> Build **Neung**.\n>\n> - Android only\n> - Kotlin");
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

  it("scaffolds the canary counter file and gitignore exception", () => {
    const root = scratch();
    const { created } = scaffoldInto(root, "", "", "new");
    expect(created).toContain(".repoos/canary.txt");
    expect(readFileSync(join(root, ".repoos/canary.txt"), "utf8")).toBe("0");
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toContain(".repoos/*");
    expect(gi).toContain("!.repoos/canary.txt");
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

  it("AGENTS.md makes the configured repoos.toml paths authoritative", () => {
    const root = scratch();
    scaffoldInto(root, "", "repoos", "new");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

    // #0586: an agent moved docs/ to the root against docsDir = "repoos/docs".
    // The scaffolded instructions must forbid relocating config-owned paths and
    // route a mismatch to the human instead of a directory move.
    expect(agents).toContain("`repoos.toml` owns the layout");
    expect(agents).toMatch(/authoritative/i);
    expect(agents).toMatch(/never move/i);
    expect(agents).toMatch(/human\s+approval/i);
    expect(agents).toContain("`repoos/work/`");
    expect(agents).toContain("`repoos/docs/`");
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

  it("aborts cleanly instead of throwing when a file blocks the namespace directory", () => {
    const root = scratch();
    // A plain file named "repoos" blocks mkdir("repoos/work") with ENOTDIR.
    writeFileSync(join(root, "repoos"), "not a directory");

    // ensureDir's ENOTDIR branch sets process.exitCode as a side effect for
    // the real CLI process; restore it so this test doesn't leak a nonzero
    // exit code into the vitest process running the suite.
    const prevExitCode = process.exitCode;
    let created: string[] = [];
    try {
      expect(() => {
        created = scaffoldInto(root, "", "repoos", "new").created;
      }).not.toThrow();
      expect(created).not.toContain("repoos/work/");
      expect(existsSync(join(root, "repoos/work/0001-set-up-repoos.md"))).toBe(false);
    } finally {
      process.exitCode = prevExitCode;
    }
  });
});

describe("scaffoldInto gitignore — runtime state and .DS_Store (#0599)", () => {
  function git(root: string, args: string[]): string {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  }

  /** git check-ignore -q: exit 0 = ignored, 1 = not ignored. */
  function isIgnored(root: string, path: string): boolean {
    return spawnSync("git", ["check-ignore", "-q", path], { cwd: root }).status === 0;
  }

  function gitScratch(): string {
    const root = scratch();
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    return root;
  }

  function gitignoreLines(root: string): string[] {
    return readFileSync(join(root, ".gitignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
  }

  it("keeps the root-layout canary pairing verbatim and does not duplicate the ignore", () => {
    const root = scratch();
    scaffoldInto(root, "", "", "new");
    expect(canaryUnderRootRuntimeDir(".repoos")).toBe(true);
    const lines = gitignoreLines(root);
    expect(lines).toContain(".repoos/*");
    expect(lines).toContain("!.repoos/canary.txt");
    // The cache-dir rule IS the root-runtime rule here; the extra entry must
    // not be appended on top of it.
    expect(lines.filter((l) => l === ".repoos/*")).toHaveLength(1);
    expect(lines).toContain(".DS_Store");
  });

  it("namespaced init also ignores the root .repoos/ runtime directory", () => {
    const root = scratch();
    scaffoldInto(root, "", "repoos", "new");
    expect(canaryUnderRootRuntimeDir("repoos/.repoos")).toBe(false);
    const lines = gitignoreLines(root);
    // Canary pairing intact, plus the root runtime dir and macOS metadata.
    expect(lines).toContain("repoos/.repoos/*");
    expect(lines).toContain("!repoos/.repoos/canary.txt");
    expect(lines).toContain(".repoos/*");
    expect(lines).toContain(".DS_Store");
  });

  it("skips the root runtime ignore when the cache dir lives inside root .repoos/", () => {
    // Namespace ".repoos" puts the cache dir at .repoos/.repoos — a blanket
    // root ignore would swallow the canary's parent directory and defeat the
    // negation, so init leaves that layout's pairing alone.
    const root = scratch();
    scaffoldInto(root, "", ".repoos", "new");
    const lines = gitignoreLines(root);
    expect(lines).toContain(".repoos/.repoos/*");
    expect(lines).toContain("!.repoos/.repoos/canary.txt");
    expect(lines).not.toContain(".repoos/*");
    expect(lines).toContain(".DS_Store");
  });

  it("fresh namespaced init: runtime db, logs and nested .DS_Store never reach git status; canary stays tracked", () => {
    const root = gitScratch();
    scaffoldInto(root, "", "repoos", "new");

    // Commit the scaffold so the tree starts clean; the canary counter ships
    // tracked because init's gitignore negation re-includes it.
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init"]);
    expect(git(root, ["status", "--porcelain"])).toBe("");

    // Simulate serving RepoOS here + Finder metadata on macOS: the runtime
    // database under the configured cacheDir, hardcoded root-level runtime
    // state, and .DS_Store files at arbitrary depth.
    writeFileSync(join(root, "repoos/.repoos/repoos.db"), "");
    mkdirSync(join(root, ".repoos"), { recursive: true });
    writeFileSync(join(root, ".repoos/repoos.db"), "");
    mkdirSync(join(root, ".repoos/logs"), { recursive: true });
    writeFileSync(join(root, ".repoos/logs/system.log"), "");
    writeFileSync(join(root, ".DS_Store"), "");
    writeFileSync(join(root, "repoos/work/.DS_Store"), "");

    expect(git(root, ["status", "--porcelain"])).toBe("");
    expect(isIgnored(root, "repoos/.repoos/repoos.db")).toBe(true);
    expect(isIgnored(root, ".repoos/repoos.db")).toBe(true);
    expect(isIgnored(root, ".repoos/logs/system.log")).toBe(true);
    expect(isIgnored(root, "repoos/work/.DS_Store")).toBe(true);
    // The canary exception still outranks both ignore globs.
    expect(isIgnored(root, "repoos/.repoos/canary.txt")).toBe(false);
    expect(git(root, ["ls-files", "--", "repoos/.repoos/canary.txt"])).toBe(
      "repoos/.repoos/canary.txt",
    );
  });

  it("fresh root-layout init: runtime db and nested .DS_Store ignored; canary stays tracked", () => {
    const root = gitScratch();
    scaffoldInto(root, "", "", "new");

    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "init"]);
    expect(git(root, ["status", "--porcelain"])).toBe("");

    writeFileSync(join(root, ".repoos/repoos.db"), "");
    writeFileSync(join(root, ".repoos/.DS_Store"), "");
    writeFileSync(join(root, "work/.DS_Store"), "");

    expect(git(root, ["status", "--porcelain"])).toBe("");
    expect(isIgnored(root, ".repoos/repoos.db")).toBe(true);
    expect(isIgnored(root, ".repoos/.DS_Store")).toBe(true);
    expect(isIgnored(root, "work/.DS_Store")).toBe(true);
    expect(isIgnored(root, ".repoos/canary.txt")).toBe(false);
    expect(git(root, ["ls-files", "--", ".repoos/canary.txt"])).toBe(".repoos/canary.txt");
  });
});

describe("areaVocabularyTomlAddition — existing-repo areas prompt (#0587)", () => {
  it("appends real [[areas]] rows an existing repoos.toml round-trips", () => {
    const root = scratch();
    const base = 'workDir = "work"\n';
    writeFileSync(join(root, "repoos.toml"), base);
    writeFileSync(
      join(root, "repoos.toml"),
      base + areaVocabularyTomlAddition(["web", "docs"], false),
    );
    expect(loadConfig(root).areas).toEqual([{ name: "web" }, { name: "docs" }]);
  });

  it("keeps the preview-target skeleton commented and references the areas", () => {
    const addition = areaVocabularyTomlAddition(["landing"], true);
    expect(addition).toContain("[[areas]]");
    expect(addition).toContain("# [[preview.targets]]");
    expect(addition).toContain('# areas = ["landing"]');
    // Real (uncommented) preview rows would route previews the repo has not set up.
    expect(addition).not.toMatch(/^\[\[preview\.targets\]\]/m);
  });

  it("is empty when there are no areas to add, so nothing is appended", () => {
    expect(areaVocabularyTomlAddition([], true)).toBe("");
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

  it("tells existing repos the configured layout is authoritative (#0586)", () => {
    const addition = repoOSAgentsSectionAddition("# My project\n", "repoos/work");
    expect(addition).not.toBeNull();
    expect(addition).toMatch(/repoos\.toml/);
    expect(addition).toMatch(/authoritative/i);
    expect(addition).toMatch(/never move/i);
  });
});
