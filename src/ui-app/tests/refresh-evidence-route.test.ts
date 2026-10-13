import { afterEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { refreshTaskEvidence } from "../../server/routes/tasks.js";
import { readUiHandoffGateEvidence, handoffTreeStatus } from "../../server/ui-handoff-gate.js";
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

function makeTask(root: string, status: Task["status"] = "review", body = ""): Task {
  const branch = execSync(`git -C ${root} branch --show-current`, { encoding: "utf8" }).trim();
  return {
    id: "0766",
    title: "test",
    status,
    branch,
    absPath: join(root, "work/0766.md"),
    path: "work/0766.md",
    area: "web",
    body,
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

/**
 * Route-level capture flows (#0766 review pass 5): these run the REAL gate with
 * a `[[shot.targets]]` command target — no browser involved — so a completed
 * refresh (not just the guards) is verified identity-by-identity.
 */
describe("POST /api/tasks/:id/verify capture flows", () => {
  // Everything the capture itself writes lives in gitignored paths
  // (`work/.attachments/` shots, `.repoos/` evidence), so the route's
  // worktree-clean guarantee holds for this temp repo the way it does in the
  // real one.
  const RUN_COMMAND = 'printf x > "$REPOOS_SHOT_DIR/one.png"';
  // The declared `## Shots` the plan resolves from: the temp repo has an empty
  // diff against its base, so the command target must be declared explicitly.
  const DECLARED_BODY = '## Shots\n\n```json\n[{"target": "cmd", "label": "Render one"}]\n```\n';

  /** A repo with one tracked file and the shot/evidence paths ignored. */
  function commandRepo(command: string): {
    root: string;
    shortHead: string;
    config: RepoOSConfig;
    task: Task;
  } {
    const root = gitRoot();
    writeFileSync(join(root, "tracked.txt"), "clean\n");
    execSync(`git -C ${root} add tracked.txt`, { stdio: "ignore" });
    writeFileSync(join(root, ".gitignore"), ".repoos/\nwork/.attachments/\n");
    execSync(`git -C ${root} add tracked.txt .gitignore`, { stdio: "ignore" });
    execSync(`git -C ${root} commit -q -m tracked`, { stdio: "ignore" });
    const shortHead = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      shot: { targets: [{ name: "cmd", areas: ["web"], command }] },
    } as RepoOSConfig;
    return { root, shortHead, config, task: makeTask(root, "review", DECLARED_BODY) };
  }

  function porcelainOf(root: string): string {
    return execSync(`git -C ${root} status --porcelain`, { encoding: "utf8" }).trim();
  }

  it("refreshes command-target evidence bound to the current HEAD (success path)", async () => {
    const { root, shortHead, config, task } = commandRepo(RUN_COMMAND);
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    const { status, body } = res.result() as {
      status: number;
      body: {
        ok?: boolean;
        headIdentity?: string;
        detail?: string;
        shots?: Array<{ target?: string; sourceIdentity?: string }>;
      };
    };
    // The refresh succeeded and the evidence carries the CURRENT tree identity.
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.headIdentity).toBe(shortHead);
    expect(body.detail).toContain("command target");
    expect(body.shots).toHaveLength(1);
    expect(body.shots?.[0]).toMatchObject({
      target: "cmd",
      sourceIdentity: shortHead,
    });
    // The verification record itself reports the capture as CURRENT for the
    // reviewed HEAD — the exact check the reviewer's gate makes.
    const evidence = readUiHandoffGateEvidence(config, "0766");
    expect(evidence?.sourceIdentity).toBe(shortHead);
    expect(handoffTreeStatus(evidence, shortHead)).toBe("current");
    // The capture wrote nowhere tracked.
    expect(porcelainOf(root)).toBe("");
  });

  it("restores the worktree when a command target modifies tracked files", async () => {
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; echo dirt >> tracked.txt; printf stray > stray.txt",
    );
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    const { status, body } = res.result() as {
      status: number;
      body: {
        error?: string;
        headIdentity?: string;
        restored?: string[];
        shots?: unknown[];
      };
    };
    // The refresh itself succeeded — the capture already replaced the stored
    // evidence — and the damage the command did is reported back...
    expect(status).toBe(200);
    expect(body.headIdentity).toBe(shortHead);
    expect(body.restored).toEqual(
      expect.arrayContaining([
        expect.stringContaining("tracked.txt"),
        expect.stringContaining("stray.txt"),
      ]),
    );
    expect(body.shots).toHaveLength(1);
    // ...and undone: tracked file restored, untracked capture artifact gone,
    // worktree porcelain-clean again.
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("clean\n");
    expect(existsSync(join(root, "stray.txt"))).toBe(false);
    expect(porcelainOf(root)).toBe("");
  });

  it("restores tracked damage even when HEAD moves during the capture", async () => {
    // The command commits mid-capture AND leaves a tracked modification behind:
    // the commit is a concurrent writer's and must survive the restore, but
    // leaving tracked edits in a review worktree is never acceptable either.
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; git commit --allow-empty -q -m moved; echo extra >> tracked.txt",
    );
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    const { status, body } = res.result() as {
      status: number;
      body: { error?: string; restored?: string[] };
    };
    // The refresh cannot claim success: the evidence's tree is no longer HEAD.
    expect(status).toBe(409);
    expect(body.error).toContain("HEAD changed during the capture");
    expect(body.error).toContain(shortHead);
    // Yet the tracked damage is still undone without touching the concurrent
    // commit, and the worktree is porcelain-clean again.
    expect(body.restored).toEqual(expect.arrayContaining([expect.stringContaining("tracked.txt")]));
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("clean\n");
    const headAfter = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    expect(headAfter).not.toBe(shortHead);
    expect(porcelainOf(root)).toBe("");
  });

  it("fails without restoring when HEAD moves during the capture", async () => {
    // The command commits mid-capture, so the evidence was produced for a tree
    // that is no longer HEAD when the route re-checks.
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; git commit --allow-empty -q -m moved",
    );
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    const { status, body } = res.result() as { status: number; body: { error?: string } };
    expect(status).toBe(409);
    expect(body.error).toContain("HEAD changed during the capture");
    expect(body.error).toContain(shortHead);
    // The concurrent commit is left exactly as its writer left it: the failed
    // refresh must never reset a HEAD someone else moved.
    const headAfter = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    expect(headAfter).not.toBe(shortHead);
    expect(porcelainOf(root)).toBe("");
  });
});
