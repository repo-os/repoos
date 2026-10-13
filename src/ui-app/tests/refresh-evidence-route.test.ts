import { afterEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { refreshTaskEvidence } from "../../server/routes/tasks.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function response() {
  let status = 0;
  let body = "";
  return {
    writeHead: (code: number) => (status = code),
    end: (value?: string) => (body = String(value ?? "")),
    result: () => ({ status, body: JSON.parse(body) as Record<string, unknown> }),
  };
}

function context(task: Task, root: string, overrides: Record<string, unknown> = {}) {
  const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
  return {
    config,
    index: { getTask: () => task },
    runner: { isRunning: () => false },
    reviews: { isRunning: () => false },
    closeOutLock: { closingOut: () => false },
    rootLock: { acquire: () => true, release: vi.fn() },
    previews: {},
    logger: { task: vi.fn() },
    ...overrides,
  } as unknown as RouteContext;
}

function makeTask(root: string, status: Task["status"] = "review"): Task {
  const branch = execSync(`git -C ${root} branch --show-current`, { encoding: "utf8" }).trim();
  return {
    id: "0766",
    title: "test",
    status,
    branch,
    absPath: join(root, "work/0766.md"),
    path: "work/0766.md",
    area: "web",
    body: "",
  } as Task;
}

function gitRoot(): string {
  const root = join(tmpdir(), `repoos-evidence-refresh-${Date.now()}-${Math.random()}`);
  roots.push(root);
  mkdirSync(join(root, "work"), { recursive: true });
  execSync(`git -C ${root} init -b main`, { stdio: "ignore" });
  execSync(`git -C ${root} config user.email test@example.com`, { stdio: "ignore" });
  execSync(`git -C ${root} config user.name Test`, { stdio: "ignore" });
  writeFileSync(join(root, "README.md"), "test\n");
  execSync(`git -C ${root} add README.md`, { stdio: "ignore" });
  execSync(`git -C ${root} commit -m initial`, { stdio: "ignore" });
  return root;
}

describe("POST /api/tasks/:id/verify guards", () => {
  it("refuses tasks outside review", async () => {
    const root = gitRoot();
    const res = response();
    await refreshTaskEvidence(context(makeTask(root, "active"), root), {} as never, res as never, {
      param1: "0766",
    });
    expect(res.result()).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("only be refreshed in review") },
    });
  });

  it("refuses while an agent is running", async () => {
    const root = gitRoot();
    const task = makeTask(root);
    const res = response();
    await refreshTaskEvidence(
      context(task, root, { runner: { isRunning: () => true } }),
      {} as never,
      res as never,
      { param1: task.id },
    );
    expect(res.result()).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("agent run in progress") },
    });
  });

  it("refuses dirty worktrees and releases the durable root lock", async () => {
    const root = gitRoot();
    writeFileSync(join(root, "untracked.txt"), "dirty\n");
    const task = makeTask(root);
    const rootLock = { acquire: vi.fn(() => true), release: vi.fn() };
    const res = response();
    await refreshTaskEvidence(context(task, root, { rootLock }), {} as never, res as never, {
      param1: task.id,
    });
    expect(res.result()).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("worktree is dirty") },
    });
    expect(rootLock.acquire).toHaveBeenCalledWith(task.id, "close-out");
    expect(rootLock.release).toHaveBeenCalledWith(task.id);
  });

  it("reports skipped verification as not refreshed", async () => {
    const root = gitRoot();
    const task = makeTask(root);
    const res = response();
    await refreshTaskEvidence(
      context(task, root, {
        config: { root, workDir: "work", cacheDir: ".repoos", uiVerification: { enabled: false } },
      }),
      {} as never,
      res as never,
      { param1: task.id },
    );
    expect(res.result()).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("Evidence was not refreshed") },
    });
  });
});
