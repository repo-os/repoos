import { afterEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  refreshTaskEvidence,
  guardedForceRefreshCapture,
  postCaptureWorktreeGuard,
  automaticStaleEvidenceRefresh,
  automaticEvidenceGapRepair,
  taskAction,
} from "../../server/routes/tasks.js";
import type { AutomaticStaleEvidenceRefreshDeps } from "../../server/routes/tasks.js";
import type { IncomingMessage } from "node:http";
import * as git from "../../core/git.js";
import type { RootLock } from "../../server/repo-lock.js";
import { localShotStore } from "../../server/shots.js";
import * as uiHandoffGate from "../../server/ui-handoff-gate.js";
import {
  readUiHandoffGateEvidence,
  handoffTreeStatus,
  runUiHandoffGate,
} from "../../server/ui-handoff-gate.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { ReviewManager } from "../../server/review.js";
import {
  endEvidenceRefresh,
  isEvidenceRefreshActive,
  tryBeginEvidenceRefresh,
} from "../../server/evidence-refresh-lock.js";

const roots: string[] = [];
afterEach(() => {
  endEvidenceRefresh("0766");
  vi.restoreAllMocks();
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

/** Dependencies for the automatic refresh with benign defaults (#0772). */
function automaticDeps(
  root: string,
  task: Task,
  overrides: Partial<AutomaticStaleEvidenceRefreshDeps> = {},
): AutomaticStaleEvidenceRefreshDeps {
  return {
    config: { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig,
    rootLock: { acquire: () => true, release: () => true } as unknown as RootLock,
    closingOut: () => false,
    log: vi.fn(),
    getReviewTask: () => task,
    isAgentRunning: () => false,
    isReviewRunning: () => false,
    ...overrides,
  };
}

/** Hold the automatic refresh at its HEAD lookup so its locks stay held. */
function blockGitHeadLookup(): { release: () => void; restore: () => void } {
  const origRunGit = git.runGit;
  let release!: () => void;
  const spy = vi.spyOn(git, "runGit").mockImplementation((cwd, args, timeout) => {
    if (args[0] === "rev-parse" && args[1] === "--short" && args[2] === "HEAD") {
      return new Promise((resolve) => {
        release = () => {
          void origRunGit(cwd, args, timeout).then(resolve);
        };
      });
    }
    return origRunGit(cwd, args, timeout);
  });
  return { release: () => release(), restore: () => spy.mockRestore() };
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
    const rootLock = { acquire: vi.fn(() => true), release: vi.fn() };
    const res = response();
    await refreshTaskEvidence(
      context(task, root, { runner: { isRunning: () => true }, rootLock }),
      {} as never,
      res as never,
      { param1: task.id },
    );
    expect(res.result()).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("agent run in progress") },
    });
    expect(rootLock.acquire).toHaveBeenCalledWith(task.id, "close-out");
    expect(rootLock.release).toHaveBeenCalledWith(task.id);
  });

  it("takes the durable root lock before checking for a live agent", async () => {
    const root = gitRoot();
    const task = makeTask(root);
    const order: string[] = [];
    const rootLock = {
      acquire: vi.fn(() => {
        order.push("acquire");
        return true;
      }),
      release: vi.fn(),
    };
    const runner = {
      isRunning: vi.fn(() => {
        order.push("isRunning");
        return false;
      }),
    };
    const res = response();
    await refreshTaskEvidence(
      context(task, root, { rootLock, runner }),
      {} as never,
      res as never,
      { param1: task.id },
    );
    expect(order).toEqual(["acquire", "isRunning"]);
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

  it("refuses engineer start while evidence refresh is in progress", async () => {
    const root = gitRoot();
    const branch = execSync(`git -C ${root} branch --show-current`, { encoding: "utf8" }).trim();
    writeFileSync(
      join(root, "work/0766.md"),
      `---\nid: "0766"\ntitle: test\nstatus: ready\nbranch: ${branch}\n---\n`,
    );
    const task = makeTask(root, "ready");
    expect(tryBeginEvidenceRefresh(task.id)).toBe(true);
    const res = response();
    await taskAction(
      context(task, root, {
        config: {
          root,
          workDir: "work",
          cacheDir: ".repoos",
          defaultStatus: "inbox",
          defaultAssignee: "unassigned",
          agents: [{ name: "engineer", cli: "fake", model: "m", enabled: true }],
        },
        index: {
          getTask: () => task,
          getTasks: () => [task],
          applyFileChange: vi.fn(),
          refreshBranches: vi.fn(),
        },
        runner: { isRunning: () => false, start: vi.fn(() => ({ ok: true })) },
        jobCoordinator: { getJob: () => null, enqueue: vi.fn(), allJobs: () => [] },
        syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
        startUnifiedHandoff: () => ({ started: false }),
        onServerStatusChange: vi.fn(),
      }),
      { headers: {} } as IncomingMessage,
      res as never,
      { param1: task.id, param2: "start" },
    );
    const { status, body } = res.result() as { status: number; body: { error?: string } };
    expect(status).toBe(409);
    expect(body.error).toContain("Evidence refresh is in progress");
  });

  it("refuses review while evidence refresh holds the in-process lock", () => {
    const root = gitRoot();
    const task = makeTask(root);
    const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
    const reviews = new ReviewManager(config, () => {});
    expect(tryBeginEvidenceRefresh(task.id)).toBe(true);
    const gate = reviews.canRun(task);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("evidence refresh");
    endEvidenceRefresh(task.id);
  });

  it("blocks review from starting while verify awaits the worktree check", async () => {
    const root = gitRoot();
    const task = makeTask(root);
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
    } as RepoOSConfig;
    const reviews = new ReviewManager(config, () => {});
    const origRunGit = git.runGit;
    let releaseStatus!: () => void;
    let holdStatus = true;
    const statusSpy = vi.spyOn(git, "runGit").mockImplementation((cwd, args, timeout) => {
      if (holdStatus && args[0] === "status" && args[1] === "--porcelain") {
        return new Promise((resolve) => {
          releaseStatus = () => {
            holdStatus = false;
            void origRunGit(cwd, args, timeout).then(resolve);
          };
        });
      }
      return origRunGit(cwd, args, timeout);
    });
    const refreshPromise = refreshTaskEvidence(
      context(task, root, { config, reviews }),
      {} as never,
      response() as never,
      { param1: task.id },
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(isEvidenceRefreshActive(task.id)).toBe(true);
    expect(reviews.canRun(task).ok).toBe(false);
    expect(reviews.canRun(task).reason).toContain("evidence refresh");
    releaseStatus();
    await refreshPromise;
    statusSpy.mockRestore();
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

describe("automatic stale-evidence refresh serialization (#0772)", () => {
  it("reserves the refresh lock before its first await and blocks a review start", async () => {
    const root = gitRoot();
    const task = makeTask(root, "review");
    const { release, restore } = blockGitHeadLookup();
    const refresh = automaticStaleEvidenceRefresh(automaticDeps(root, task), task);
    // The mutex is held synchronously, before the blocked HEAD lookup resolves.
    expect(isEvidenceRefreshActive(task.id)).toBe(true);
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      agents: [{ name: "reviewer", cli: "opencode", model: "default", enabled: true }],
    } as RepoOSConfig;
    const reviews = new ReviewManager(config, () => {});
    expect(reviews.canRun(task).ok).toBe(false);
    expect(reviews.canRun(task).reason).toContain("evidence refresh");
    await expect(reviews.run(task)).resolves.toMatchObject({ ok: false });
    release();
    await refresh;
    expect(isEvidenceRefreshActive(task.id)).toBe(false);
    restore();
  });

  it("blocks an engineer start while the automatic refresh holds the lock", async () => {
    const root = gitRoot();
    const branch = execSync(`git -C ${root} branch --show-current`, { encoding: "utf8" }).trim();
    writeFileSync(
      join(root, "work/0766.md"),
      `---\nid: "0766"\ntitle: test\nstatus: ready\nbranch: ${branch}\n---\n`,
    );
    const readyTask = makeTask(root, "ready");
    const reviewTask = { ...readyTask, status: "review" } as Task;
    const { release, restore } = blockGitHeadLookup();
    const refresh = automaticStaleEvidenceRefresh(automaticDeps(root, reviewTask), reviewTask);
    expect(isEvidenceRefreshActive(reviewTask.id)).toBe(true);
    const res = response();
    await taskAction(
      context(readyTask, root, {
        config: {
          root,
          workDir: "work",
          cacheDir: ".repoos",
          defaultStatus: "inbox",
          defaultAssignee: "unassigned",
          agents: [{ name: "engineer", cli: "fake", model: "m", enabled: true }],
        },
        index: {
          getTask: () => readyTask,
          getTasks: () => [readyTask],
          applyFileChange: vi.fn(),
          refreshBranches: vi.fn(),
        },
        runner: { isRunning: () => false, start: vi.fn(() => ({ ok: true })) },
        jobCoordinator: { getJob: () => null, enqueue: vi.fn(), allJobs: () => [] },
        syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
        startUnifiedHandoff: () => ({ started: false }),
        onServerStatusChange: vi.fn(),
      }),
      { headers: {} } as IncomingMessage,
      res as never,
      { param1: readyTask.id, param2: "start" },
    );
    const { status, body } = res.result() as { status: number; body: { error?: string } };
    expect(status).toBe(409);
    expect(body.error).toContain("Evidence refresh is in progress");
    release();
    await refresh;
    restore();
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

  it("passes remote transport through both automatic evidence refresh paths", async () => {
    const transport = { capture: vi.fn() };
    const optionsSeen: unknown[] = [];

    for (const repair of [false, true]) {
      const { root, shortHead, config, task } = commandRepo(RUN_COMMAND);
      if (!repair) {
        const evidenceDir = join(root, ".repoos/ui-verification");
        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(
          join(evidenceDir, "0766.json"),
          JSON.stringify({ issues: [], blankShots: [], captures: 1, sourceIdentity: "deadbeef" }),
        );
      }
      const evidencePath = join(root, ".repoos/ui-verification/0766.json");
      const gateSpy = vi
        .spyOn(uiHandoffGate, "runUiHandoffGate")
        .mockImplementation(async (...args) => {
          optionsSeen.push(args[4]?.remoteTransport);
          mkdirSync(join(root, ".repoos/ui-verification"), { recursive: true });
          writeFileSync(
            evidencePath,
            JSON.stringify({ issues: [], blankShots: [], captures: 1, sourceIdentity: shortHead }),
          );
          return { ok: true, detail: "ok", evidencePath };
        });
      const deps = automaticDeps(root, task, {
        config: { ...config, uiVerification: { enabled: true, autoRefreshStaleOnce: true } },
        remoteTransport: transport,
      });
      if (repair) await automaticEvidenceGapRepair(deps, task);
      else await automaticStaleEvidenceRefresh(deps, task);
      gateSpy.mockRestore();
    }

    expect(optionsSeen).toEqual([transport, transport]);
  });

  it("links inherited .env into the detached command worktree when inheritEnv is enabled", async () => {
    const root = gitRoot();
    writeFileSync(join(root, ".gitignore"), ".env\n.repoos/\nwork/.attachments/\n");
    writeFileSync(join(root, "repoos.toml"), "[worktrees]\ninheritEnv = true\n");
    writeFileSync(join(root, "tracked.txt"), "clean\n");
    execSync(`git -C ${root} add .gitignore repoos.toml tracked.txt`, { stdio: "ignore" });
    execSync(`git -C ${root} commit -q -m setup`, { stdio: "ignore" });
    writeFileSync(join(root, ".env"), "MARKER=from-main\n");
    const command =
      'test -f .env && grep -q from-main .env && printf x > "$REPOOS_SHOT_DIR/one.png"';
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      uiVerification: { enabled: true },
      worktrees: { inheritEnv: true },
      shot: { targets: [{ name: "cmd", areas: ["web"], command }] },
    } as RepoOSConfig;
    const task = makeTask(
      root,
      "review",
      '## Shots\n\n```json\n[{"target": "cmd", "label": "Render one"}]\n```\n',
    );
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    expect(res.result().status).toBe(200);
  });

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

  it("leaves the task worktree untouched when a command target writes files", async () => {
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; echo dirt >> tracked.txt; printf stray > stray.txt",
    );
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    const { status, body } = res.result() as {
      status: number;
      body: { ok?: boolean; headIdentity?: string };
    };
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.headIdentity).toBe(shortHead);
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("clean\n");
    expect(existsSync(join(root, "stray.txt"))).toBe(false);
    expect(porcelainOf(root)).toBe("");
  });

  it("postCaptureWorktreeGuard leaves concurrent user edits untouched", async () => {
    const { root } = commandRepo(RUN_COMMAND);
    writeFileSync(join(root, "tracked.txt"), "user edit\n");
    const guarded = await postCaptureWorktreeGuard(
      root,
      execSync(`git -C ${root} rev-parse --short HEAD`, { encoding: "utf8" }).trim(),
    );
    expect(guarded.ok).toBe(false);
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("user edit\n");
  });

  it("keeps the task worktree HEAD when a command commits inside the isolated copy", async () => {
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; git commit --allow-empty -q -m moved; echo extra >> tracked.txt",
    );
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    const { status, body } = res.result() as {
      status: number;
      body: { ok?: boolean; headIdentity?: string };
    };
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.headIdentity).toBe(shortHead);
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("clean\n");
    const headAfter = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    expect(headAfter).toBe(shortHead);
  });

  it("returns 200 with refreshed evidence when verification reports issues", async () => {
    const { root, shortHead, config, task } = commandRepo(RUN_COMMAND);
    const gateSpy = vi.spyOn(uiHandoffGate, "runUiHandoffGate").mockImplementation(async () => {
      const path = join(root, ".repoos/ui-verification/0766.json");
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({
          at: new Date().toISOString(),
          issues: [{ kind: "assertion", message: "boom", url: "http://test/" }],
          blankShots: [],
          captures: 1,
          sourceIdentity: shortHead,
        }),
      );
      return {
        ok: false,
        detail: "ui verification failed (1 issue(s)): boom",
        evidencePath: path,
      };
    });
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    gateSpy.mockRestore();
    const { status, body } = res.result() as {
      status: number;
      body: { ok?: boolean; headIdentity?: string; issues?: Array<{ message?: string }> };
    };
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.headIdentity).toBe(shortHead);
    expect(body.issues).toHaveLength(1);
    expect(readUiHandoffGateEvidence(config, "0766")?.sourceIdentity).toBe(shortHead);
  });

  it("guarded force refresh leaves the task worktree clean when command capture writes files", async () => {
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; echo dirt >> tracked.txt; printf stray > stray.txt",
    );
    const captured = await guardedForceRefreshCapture(config, task, root, undefined, vi.fn());
    expect(captured.error).toBeUndefined();
    expect(captured.gateOk).toBe(true);
    expect(captured.headIdentity).toBe(shortHead);
    expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe("clean\n");
    expect(existsSync(join(root, "stray.txt"))).toBe(false);
  });

  it("guarded force refresh keeps task HEAD when command capture commits in isolation", async () => {
    const { root, shortHead, config, task } = commandRepo(
      RUN_COMMAND + "; git commit --allow-empty -q -m moved",
    );
    const captured = await guardedForceRefreshCapture(config, task, root, undefined, vi.fn());
    expect(captured.error).toBeUndefined();
    expect(captured.gateOk).toBe(true);
    expect(captured.headIdentity).toBe(shortHead);
    const headAfter = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    expect(headAfter).toBe(shortHead);
  });

  it("force refresh clears prior shots and skips when command capture produces nothing", async () => {
    const root = gitRoot();
    writeFileSync(join(root, "tracked.txt"), "clean\n");
    execSync(`git -C ${root} add tracked.txt`, { stdio: "ignore" });
    writeFileSync(join(root, ".gitignore"), ".repoos/\nwork/.attachments/\n");
    execSync(`git -C ${root} add tracked.txt .gitignore`, { stdio: "ignore" });
    execSync(`git -C ${root} commit -q -m tracked`, { stdio: "ignore" });
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      uiVerification: { enabled: true },
      shot: { targets: [{ name: "cmd", areas: ["web"], command: "exit 1" }] },
    } as RepoOSConfig;
    const task = makeTask(
      root,
      "review",
      '## Shots\n\n```json\n[{"target": "cmd", "label": "Render one"}]\n```\n',
    );
    const store = localShotStore(config, task.id);
    store.save({
      target: "cmd",
      data: Buffer.from("stale").toString("base64"),
      mime: "image/png",
      label: "Stale engineer shot",
    });
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      forceRefresh: true,
      recordTaskNotes: false,
    });
    expect(result.skipped).toBe(true);
    expect(result.detail).toContain("evidence was not refreshed");
    expect(store.list()).toHaveLength(0);
  });

  it("force refresh supersedes engineer-made shots before new captures", async () => {
    const { root, config, task } = commandRepo(RUN_COMMAND);
    const store = localShotStore(config, task.id);
    store.save({
      target: "cmd",
      data: Buffer.from("old-engineer-shot").toString("base64"),
      mime: "image/png",
      label: "Engineer capture",
    });
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]!.origin).toBeUndefined();
    const captured = await guardedForceRefreshCapture(config, task, root, undefined, vi.fn());
    expect(captured.error).toBeUndefined();
    expect(captured.gateOk).toBe(true);
    const shots = store.list();
    expect(shots).toHaveLength(1);
    expect(shots[0]!.origin).toBe("auto");
    expect(shots[0]!.label).not.toBe("Engineer capture");
  });

  it("still fails when the task worktree HEAD moves during capture", async () => {
    const { root, shortHead, config, task } = commandRepo(RUN_COMMAND);
    const gateSpy = vi.spyOn(uiHandoffGate, "runUiHandoffGate").mockImplementation(async () => {
      execSync(`git -C ${root} commit --allow-empty -q -m concurrent`, { stdio: "ignore" });
      const path = join(root, ".repoos/ui-verification/0766.json");
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({
          at: new Date().toISOString(),
          issues: [],
          blankShots: [],
          captures: 1,
          sourceIdentity: shortHead,
        }),
      );
      return { ok: true, detail: "ok", evidencePath: path };
    });
    const res = response();
    await refreshTaskEvidence(context(task, root, { config }), {} as never, res as never, {
      param1: task.id,
    });
    gateSpy.mockRestore();
    const { status, body } = res.result() as { status: number; body: { error?: string } };
    expect(status).toBe(409);
    expect(body.error).toContain("HEAD changed during the capture");
    expect(body.error).toContain(shortHead);
    const headAfter = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    expect(headAfter).not.toBe(shortHead);
    expect(porcelainOf(root)).toBe("");
  });

  it("automatic refresh never changes tracked files or HEAD (#0772)", async () => {
    const { root, shortHead, config, task } = commandRepo(RUN_COMMAND);
    // Seed evidence captured at a different tree so the automatic path sees the
    // stale marker a stale-only review would have flagged.
    const evidenceDir = join(root, ".repoos/ui-verification");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, "0766.json"),
      JSON.stringify({
        at: new Date().toISOString(),
        issues: [],
        blankShots: [],
        captures: 1,
        sourceIdentity: "deadbeef",
      }),
    );
    const refreshed = await automaticStaleEvidenceRefresh(
      {
        config: { ...config, uiVerification: { enabled: true, autoRefreshStaleOnce: true } },
        rootLock: { acquire: () => true, release: () => true } as unknown as RootLock,
        closingOut: () => false,
        log: () => {},
        getReviewTask: () => task,
        isAgentRunning: () => false,
        isReviewRunning: () => false,
      },
      task,
    );
    expect(refreshed).toBe(true);
    const headAfter = execSync(`git -C ${root} rev-parse --short HEAD`, {
      encoding: "utf8",
    }).trim();
    expect(headAfter).toBe(shortHead);
    expect(porcelainOf(root)).toBe("");
    expect(readUiHandoffGateEvidence(config, "0766")?.sourceIdentity).toBe(shortHead);
  });

  it("automatic refresh stands down when the task is no longer in review (#0772)", async () => {
    const { root, config, task } = commandRepo(RUN_COMMAND);
    const activeTask = { ...task, status: "active" } as Task;
    let captured = false;
    const gateSpy = vi.spyOn(uiHandoffGate, "runUiHandoffGate").mockImplementation(async () => {
      captured = true;
      return { ok: true, detail: "ok", evidencePath: "" };
    });
    const refreshed = await automaticStaleEvidenceRefresh(
      {
        config: { ...config, uiVerification: { enabled: true, autoRefreshStaleOnce: true } },
        rootLock: { acquire: () => true, release: () => true } as unknown as RootLock,
        closingOut: () => false,
        log: () => {},
        getReviewTask: () => activeTask,
        isAgentRunning: () => false,
        isReviewRunning: () => false,
      },
      activeTask,
    );
    gateSpy.mockRestore();
    expect(refreshed).toBe(false);
    expect(captured).toBe(false);
  });

  it("automatic refresh stands down while an engineer turn is live (#0772)", async () => {
    const { root, config, task } = commandRepo(RUN_COMMAND);
    let captured = false;
    const gateSpy = vi.spyOn(uiHandoffGate, "runUiHandoffGate").mockImplementation(async () => {
      captured = true;
      return { ok: true, detail: "ok", evidencePath: "" };
    });
    const refreshed = await automaticStaleEvidenceRefresh(
      {
        config: { ...config, uiVerification: { enabled: true, autoRefreshStaleOnce: true } },
        rootLock: { acquire: () => true, release: () => true } as unknown as RootLock,
        closingOut: () => false,
        log: () => {},
        getReviewTask: () => task,
        isAgentRunning: () => true,
        isReviewRunning: () => false,
      },
      task,
    );
    gateSpy.mockRestore();
    expect(refreshed).toBe(false);
    expect(captured).toBe(false);
  });
});
