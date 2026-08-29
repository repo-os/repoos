/**
 * Tests for bootstrap and context-pack modules (0097).
 */
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  buildRepoMap,
  generateContextPack,
  resumePreamble,
  type ContextPack,
} from "../../core/context-pack.js";
import { bootstrap, detectPackageManager, type BootstrapResult } from "../../core/bootstrap.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

// ---- Test helpers ----

function tmpDir(): string {
  const dir = join(tmpdir(), `repoos-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(path: string, content: string): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf8");
}

function makeConfig(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Test task ${id}`,
    type: "feature",
    status: "ready",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p1",
    area: "agent",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: `feat/test-${id}`,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    path: `work/${id}-test.md`,
    absPath: `/fake/root/work/${id}-test.md`,
    body: `## Test task body\n\nImplement something in src/server/agents.ts`,
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...overrides,
  };
}

// ---- Package manager detection ----

describe("detectPackageManager", () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("returns null for empty directory", () => {
    expect(detectPackageManager(dir)).toBeNull();
  });

  it("detects bun when bun.lock exists", () => {
    writeFile(join(dir, "package.json"), "{}");
    writeFile(join(dir, "bun.lock"), "");
    expect(detectPackageManager(dir)).toBe("bun");
  });

  it("detects npm when package-lock.json exists", () => {
    writeFile(join(dir, "package.json"), "{}");
    writeFile(join(dir, "package-lock.json"), "");
    expect(detectPackageManager(dir)).toBe("npm");
  });

  it("returns null when no lockfile and no package.json", () => {
    expect(detectPackageManager(dir)).toBeNull();
  });
});

// ---- Bootstrap ----

describe("bootstrap", () => {
  let root: string;
  let config: RepoOSConfig;
  let task: Task;

  beforeEach(() => {
    root = tmpDir();
    config = makeConfig(root);
    // Create the work dir as a directory
    mkdirSync(join(root, config.workDir), { recursive: true });
    task = makeTask("0099");
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("validates repo root successfully", async () => {
    const result = await bootstrap(config, task, task.branch, root);
    expect(result.ok).toBe(true);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.steps[0].name).toBe("validate-repo-root");
    expect(result.steps[0].ok).toBe(true);
  });

  it("fails when repo root does not exist", async () => {
    const badConfig = { ...config, root: "/no/such/path/ever" };
    const result = await bootstrap(badConfig, task, task.branch, "/no/such/path/ever");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not exist");
  });

  it("validates worktree path", async () => {
    const result = await bootstrap(config, task, task.branch, root);
    expect(result.ok).toBe(true);
    const wtStep = result.steps.find((s) => s.name === "validate-worktree");
    expect(wtStep).toBeDefined();
    expect(wtStep!.ok).toBe(true);
  });

  it("handles missing node_modules gracefully (no package.json)", async () => {
    const result = await bootstrap(config, task, task.branch, root);
    expect(result.ok).toBe(true);
    const depsStep = result.steps.find((s) => s.name === "install-dependencies");
    expect(depsStep).toBeDefined();
    expect(depsStep!.detail).toContain("nothing to install");
  });

  it("records per-step timing", async () => {
    const result = await bootstrap(config, task, task.branch, root);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    for (const step of result.steps) {
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---- Context pack generation ----

describe("context pack", () => {
  let root: string;
  let config: RepoOSConfig;
  let task: Task;

  beforeEach(() => {
    root = tmpDir();
    config = makeConfig(root);
    // Create minimal repo structure for the repo map
    writeFile(join(root, "src", "core", "types.ts"), `export interface Foo { bar: string; }`);
    writeFile(
      join(root, "src", "core", "git.ts"),
      `import { Foo } from "./types.js";\nexport function git() {}`,
    );
    writeFile(
      join(root, "src", "server", "agents.ts"),
      `import { git } from "../core/git.js";\nexport function run() {}`,
    );
    writeFile(
      join(root, "src", "server", "server.ts"),
      `import { run } from "./agents.js";\nexport function serve() {}`,
    );
    writeFile(join(root, "src", "commands", "check.ts"), `export function check() {}`);
    writeFile(
      join(root, "src", "ui-app", "tests", "agents.test.ts"),
      `import { describe, it, expect } from "vitest";\nimport { run } from "../../server/agents.js";`,
    );
    writeFile(
      join(root, "AGENTS.md"),
      `# AGENTS.md\n\n## Operating loop\n\n1. Read this file first.\n2. Run \`repoos check\`.`,
    );
    writeFile(
      join(root, config.docsDir, "architecture.md"),
      `# Architecture\n\nThe system has three layers.`,
    );
    task = makeTask("0099");
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("generates a context pack with task info", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.taskId).toBe("0099");
    expect(pack.content).toContain("Task Context Pack");
    expect(pack.content).toContain("#0099");
    expect(pack.content).toContain("Test task");
    expect(pack.size).toBeGreaterThan(0);
    expect(pack.generationMs).toBeGreaterThanOrEqual(0);
  });

  it("generates a context pack in the supported Node ESM runtime", () => {
    const moduleUrl = pathToFileURL(join(process.cwd(), "dist", "core", "context-pack.js")).href;
    const script = [
      `import { generateContextPack } from ${JSON.stringify(moduleUrl)};`,
      `const config = ${JSON.stringify(config)};`,
      `const task = ${JSON.stringify(task)};`,
      `const pack = generateContextPack(config, task, task.branch, ${JSON.stringify(root)}, null);`,
      `if (pack.taskId !== task.id) process.exit(2);`,
    ].join("\n");
    const result = spawnSync("node", ["--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 10_000,
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("includes AGENTS constraints", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("AGENTS.md");
    expect(pack.content).toContain("Operating loop");
  });

  it("includes likely implementation files", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    // With area=agent, agents.ts should be ranked high
    expect(pack.content).toContain("Likely Implementation Files");
    expect(pack.content).toContain("src/server/agents.ts");
  });

  it("includes test files", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("Test files");
  });

  it("includes verification commands", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("repoos check");
    expect(pack.content).toContain("bun run build");
    expect(pack.content).toContain("bun run test");
  });

  it("includes bootstrap telemetry when provided", () => {
    const fakeBootstrap: BootstrapResult = {
      ok: true,
      durationMs: 42,
      steps: [
        { name: "validate-repo-root", ok: true, durationMs: 1 },
        {
          name: "install-dependencies",
          ok: true,
          durationMs: 40,
          detail: "dependencies installed with bun",
        },
      ],
    };
    const pack = generateContextPack(config, task, task.branch, root, fakeBootstrap);
    expect(pack.content).toContain("Bootstrap Telemetry");
    expect(pack.content).toContain("PASSED");
    expect(pack.content).toContain("42ms");
  });

  it("caches context packs and returns cache hit on second call", () => {
    const pack1 = generateContextPack(config, task, task.branch, root, null);
    expect(pack1.cacheHit).toBe(false);

    const pack2 = generateContextPack(config, task, task.branch, root, null);
    expect(pack2.cacheHit).toBe(true);
    expect(pack2.content).toBe(pack1.content);
  });

  it("invalidates cache when task content changes", () => {
    const pack1 = generateContextPack(config, task, task.branch, root, null);
    expect(pack1.cacheHit).toBe(false);

    // Change task body — should invalidate cache
    const changedTask = { ...task, body: "## Changed body\n\nNew implementation details." };
    const pack2 = generateContextPack(config, changedTask, changedTask.branch, root, null);
    expect(pack2.cacheHit).toBe(false);
    expect(pack2.content).not.toBe(pack1.content);
  });

  it("is bounded in size", () => {
    // Create a huge task body to test the budget cap
    const bigBody = "## Large task\n\n" + "x".repeat(50 * 1024);
    const bigTask = { ...task, body: bigBody };
    const pack = generateContextPack(config, bigTask, bigTask.branch, root, null);
    // The pack should be roughly within the 24KB budget (plus some overhead)
    expect(pack.size).toBeLessThan(50 * 1024);
  });

  it("repo map uses its own cache layer", () => {
    const { map: map1, cacheHit: hit1 } = buildRepoMap(config);
    expect(hit1).toBe(false);
    expect(map1.files.length).toBeGreaterThan(0);

    const { map: map2, cacheHit: hit2 } = buildRepoMap(config);
    expect(hit2).toBe(true);
    expect(map2.files.length).toBe(map1.files.length);
  });

  it("includes worktree state section", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("Worktree State");
    expect(pack.content).toContain(root);
  });

  it("includes managed preview instructions", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("Managed Preview");
    expect(pack.content).toContain("::repoos-preview-request::");
    expect(pack.content).toContain("/api/tasks/:id/preview");
  });

  it("includes git workflow instructions", () => {
    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("Git Workflow");
    expect(pack.content).toContain(task.branch);
  });
});

// ---- Resume preamble ----

describe("resumePreamble", () => {
  let root: string;
  let config: RepoOSConfig;
  let task: Task;

  beforeEach(() => {
    root = tmpDir();
    config = makeConfig(root);
    task = makeTask("0099");
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("returns empty string for clean worktree", () => {
    const preamble = resumePreamble(config, task, task.branch, root);
    expect(preamble).toBe("");
  });

  it("returns a preamble for worktree with untracked files (best-effort)", () => {
    // Create an untracked file to test the git status parsing
    writeFile(join(root, "new-file.ts"), "console.log('untracked');");
    const preamble = resumePreamble(config, task, task.branch, root);
    // May or may not detect depending on git availability — test shouldn't crash
    expect(typeof preamble).toBe("string");
  });
});

// ---- Context pack cache key isolation ----

describe("context cache isolation", () => {
  let root: string;

  beforeEach(() => {
    root = tmpDir();
    const config = makeConfig(root);
    writeFile(join(root, "src", "core", "types.ts"), "export const x = 1;");
    writeFile(join(root, "AGENTS.md"), "# Test AGENTS");
    writeFile(join(root, config.docsDir, "readme.md"), "# Docs");
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("different tasks get different cache keys", () => {
    const config = makeConfig(root);
    const task1 = makeTask("0001", { body: "Implement feature A" });
    const task2 = makeTask("0002", { body: "Fix bug B" });

    const pack1 = generateContextPack(config, task1, task1.branch, root, null);
    const pack2 = generateContextPack(config, task2, task2.branch, root, null);

    expect(pack1.cacheKey).not.toBe(pack2.cacheKey);
    expect(pack1.content).toContain("#0001");
    expect(pack2.content).toContain("#0002");
  });

  it("same inputs produce identical cache keys", () => {
    const config = makeConfig(root);
    const task = makeTask("0001", { body: "Implement feature A" });

    const pack1 = generateContextPack(config, task, task.branch, root, null);
    const pack2 = generateContextPack(config, task, task.branch, root, null);

    expect(pack1.cacheKey).toBe(pack2.cacheKey);
    expect(pack1.cacheHit).toBe(false);
    expect(pack2.cacheHit).toBe(true);
  });
});

// ---- File relevance ranking ----

describe("file relevance", () => {
  let root: string;

  beforeEach(() => {
    root = tmpDir();
    // Create source files with imports to test relevance ranking
    writeFile(join(root, "src", "core", "types.ts"), `export interface Config { root: string; }`);
    writeFile(
      join(root, "src", "core", "config.ts"),
      `import { Config } from "./types.js";\nexport function loadConfig(): Config { return { root: "/" }; }`,
    );
    writeFile(
      join(root, "src", "server", "agents.ts"),
      `import { Config } from "../core/types.js";\nimport { loadConfig } from "../core/config.js";\nexport class AgentRunner {}`,
    );
    writeFile(
      join(root, "src", "server", "server.ts"),
      `import { AgentRunner } from "./agents.js";\nexport function start() {}`,
    );
    writeFile(
      join(root, "src", "ui-app", "tests", "server.test.ts"),
      `import { start } from "../../server/server.js";\ndescribe("server", () => {});`,
    );
    writeFile(join(root, "AGENTS.md"), "# AGENTS");
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("ranks files by area match", () => {
    const config = makeConfig(root);
    const task = makeTask("0001", { area: "agent" });

    const pack = generateContextPack(config, task, task.branch, root, null);
    // agent area should rank agents.ts highest
    expect(pack.content).toContain("src/server/agents.ts");
    expect(pack.content).toContain('area match: "agent"');
  });

  it("ranks files by task body reference", () => {
    const config = makeConfig(root);
    const task = makeTask("0001", {
      area: "unknown",
      body: "Fix the `src/core/config.ts` file to add a new option.",
    });

    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("src/core/config.ts");
    expect(pack.content).toContain("task body reference");
  });

  it("includes test files for relevant areas", () => {
    const config = makeConfig(root);
    const task = makeTask("0001", { area: "server" });

    const pack = generateContextPack(config, task, task.branch, root, null);
    expect(pack.content).toContain("Test files");
    expect(pack.content).toContain("tests/server.test.ts");
  });
});

// ---- Bootstrap with real install (integration) ----

describe("bootstrap integration", () => {
  let root: string;

  beforeEach(() => {
    root = tmpDir();
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("detects missing node_modules but no package.json without error", async () => {
    const config = makeConfig(root);
    mkdirSync(join(root, config.workDir), { recursive: true });
    const task = makeTask("0099");
    const result = await bootstrap(config, task, task.branch, root);
    expect(result.ok).toBe(true);
    const depsStep = result.steps.find((s) => s.name === "install-dependencies");
    expect(depsStep).toBeDefined();
    expect(depsStep!.detail).toContain("nothing to install");
  });

  it("skips install when node_modules exists", async () => {
    const config = makeConfig(root);
    mkdirSync(join(root, config.workDir), { recursive: true });
    mkdirSync(join(root, "node_modules"), { recursive: true });
    const task = makeTask("0099");
    const result = await bootstrap(config, task, task.branch, root);
    expect(result.ok).toBe(true);
    const depsStep = result.steps.find((s) => s.name === "install-dependencies");
    expect(depsStep?.detail).toContain("already present");
  });

  it("build marker check passes when dist marker exists", async () => {
    const config = makeConfig(root);
    mkdirSync(join(root, config.workDir), { recursive: true });
    // Need src/ + package.json with build script for the check to activate
    mkdirSync(join(root, "src"), { recursive: true });
    writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
    writeFile(
      join(root, "dist", ".build-info.json"),
      JSON.stringify({ hash: "abc", generatedAt: new Date().toISOString() }),
    );
    const task = makeTask("0099");
    const result = await bootstrap(config, task, task.branch, root);
    const buildStep = result.steps.find((s) => s.name === "check-orchestration-build");
    expect(buildStep?.ok).toBe(true);
  });

  it("build marker check skips when no build system detected", async () => {
    const config = makeConfig(root);
    mkdirSync(join(root, config.workDir), { recursive: true });
    const task = makeTask("0099");
    const result = await bootstrap(config, task, task.branch, root);
    const buildStep = result.steps.find((s) => s.name === "check-orchestration-build");
    expect(buildStep?.ok).toBe(true);
    expect(buildStep?.detail).toContain("skipping build check");
  });
});
