/**
 * Hotfix flow tests (#0212).
 */
import { describe, expect, it, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask, serializeTask } from "../../core/task.js";
import { ensureHotfix, agentTouchedFiles, dirtyFiles } from "../../core/git.js";
import { createRootLock } from "../../server/repo-lock.js";

function makeTask(content: string, absPath: string, root: string) {
  return parseTask({
    content,
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "ai",
  });
}

describe("hotfix frontmatter round-trip", () => {
  const root = mkdtempSync(join(tmpdir(), "repoos-hotfix-rt-"));
  execSync("git init", { cwd: root });
  execSync('git config user.email "t@t.t"', { cwd: root });
  execSync('git config user.name "t"', { cwd: root });
  execSync("mkdir -p work", { cwd: root });

  const absPath = join(root, "work/0999-test.md");
  const content = `---
id: "0999"
title: "test"
type: feature
status: ready
hotfix: true
hotfix_target: branch
---
body`;

  const task = makeTask(content, absPath, root);

  it("reads hotfix and hotfixTarget from frontmatter", () => {
    expect(task.hotfix).toBe(true);
    expect(task.hotfixTarget).toBe("branch");
  });

  it("serializes hotfix frontmatter back", () => {
    const serialized = serializeTask(task);
    expect(serialized).toContain("hotfix: true");
    expect(serialized).toContain("hotfix_target: branch");
  });

  it("main-mode hotfixTarget", () => {
    const mainContent = `---
id: "0998"
title: "main hotfix"
type: bug
status: ready
hotfix: true
hotfix_target: main
---
body`;
    const t = makeTask(mainContent, join(root, "work/0998-main.md"), root);
    expect(t.hotfixTarget).toBe("main");
    expect(serializeTask(t)).toContain("hotfix_target: main");
  });

  it("defaults to no hotfix when frontmatter is absent", () => {
    const normal = `---
id: "0997"
title: normal
status: ready
---
body`;
    const t = makeTask(normal, join(root, "work/0997-normal.md"), root);
    expect(t.hotfix).toBe(undefined);
    expect(t.hotfixTarget).toBe(undefined);
    expect(serializeTask(t)).not.toContain("hotfix");
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));
});

describe("ensureHotfix", () => {
  it("creates a hotfix branch from main", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-b-"));
    const root = join(tmp, "repo");
    execSync("mkdir -p repo", { cwd: tmp });
    execSync("git init", { cwd: root });
    execSync("touch a && git add -A && git commit -m init", { cwd: root });
    const result = ensureHotfix(root, "hotfix/0999-fix", "branch");
    expect(result.ok).toBe(true);
    expect(result.path).toBe(root);
    expect(result.branch).toBe("hotfix/0999-fix");
    const branch = execSync("git branch --show-current", { cwd: root }).toString().trim();
    expect(branch).toBe("hotfix/0999-fix");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("refuses main-mode when not on main", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-m-"));
    const root = join(tmp, "repo");
    execSync("mkdir -p repo", { cwd: tmp });
    execSync("git init", { cwd: root });
    execSync("touch a && git add -A && git commit -m init", { cwd: root });
    execSync("git checkout -b other", { cwd: root });
    const result = ensureHotfix(root, "hotfix/main", "main");
    expect(result.ok).toBe(false);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns ok when already on the branch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-e-"));
    const root = join(tmp, "repo");
    execSync("mkdir -p repo", { cwd: tmp });
    execSync("git init", { cwd: root });
    execSync("touch a && git add -A && git commit -m init", { cwd: root });
    execSync("git checkout -b hotfix/0999-already", { cwd: root });
    const result = ensureHotfix(root, "hotfix/0999-already", "branch");
    expect(result.ok).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("dirty main refusal for hotfix", () => {
  it("dirtyFiles returns dirty paths for modified files", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-d-"));
    const root = join(tmp, "repo");
    execSync("mkdir -p repo", { cwd: tmp });
    execSync("git init", { cwd: root });
    execSync("touch tracked && git add -A && git commit -m init", { cwd: root });
    writeFileSync(join(root, "tracked"), "dirty");
    const dirty = await dirtyFiles(root);
    expect(dirty).toContain("tracked");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("dirtyFiles returns empty for clean tree", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-c-"));
    const root = join(tmp, "repo");
    execSync("mkdir -p repo", { cwd: tmp });
    execSync("git init", { cwd: root });
    execSync("touch tracked && git add -A && git commit -m init", { cwd: root });
    const dirty = await dirtyFiles(root);
    expect(dirty).toHaveLength(0);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("root lock mutual exclusion", () => {
  const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-l-"));
  const root = join(tmp, "repo");
  execSync("mkdir -p repo", { cwd: tmp });
  execSync("git init", { cwd: root });
  execSync('git config user.email "t@t.t"', { cwd: root });
  execSync('git config user.name "t"', { cwd: root });

  it("acquires and releases the root lock", () => {
    const lock = createRootLock(root);
    expect(lock.isLocked()).toBe(false);
    expect(lock.acquire("0001", "hotfix")).toBe(true);
    expect(lock.isLocked()).toBe(true);
    expect(lock.getHolder()).toEqual({ taskId: "0001", kind: "hotfix" });
    expect(lock.acquire("0002", "close-out")).toBe(false);
    expect(lock.release("0001")).toBe(true);
    expect(lock.isLocked()).toBe(false);
  });

  it("prevents close-out while hotfix holds root", () => {
    const lock = createRootLock(root);
    expect(lock.acquire("c", "hotfix")).toBe(true);
    expect(lock.acquire("d", "close-out")).toBe(false);
    expect(lock.release("c")).toBe(true);
    expect(lock.acquire("d", "close-out")).toBe(true);
    expect(lock.release("d")).toBe(true);
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
});

describe("agentTouchedFiles scoping", () => {
  it("returns only agent-touched files, excluding dist/screenshots", () => {
    const tmp = mkdtempSync(join(tmpdir(), "repoos-hotfix-a-"));
    const root = join(tmp, "repo");
    execSync("mkdir -p repo", { cwd: tmp });
    execSync("git init", { cwd: root });
    execSync("touch base && git add -A && git commit -m init", { cwd: root });

    const headBefore = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
    writeFileSync(join(root, "new-file.ts"), "changed");
    execSync("mkdir -p dist", { cwd: root });
    writeFileSync(join(root, "dist/ignored.js"), "dist");

    const touched = agentTouchedFiles(root, headBefore);
    expect(touched).toContain("new-file.ts");
    expect(touched).not.toContain("dist/ignored.js");

    rmSync(tmp, { recursive: true, force: true });
  });
});
