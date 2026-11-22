import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Task } from "../../core/types.js";
import type { RepoOSConfig } from "../../core/types.js";
import {
  createJobCoordinator,
  hasPublishTurn,
  publishTurnTaskId,
  selectCloseOutStarts,
  type IntegrationJob,
  type JobCoordinator,
  type JobPhase,
} from "../integration-job.js";
import { buildIntegrationSnapshot } from "../integration-status.js";
import { CloseOutOrchestrator } from "../integration-orchestrator.js";
import { DEFAULT_CONFIG, getConfigSchema } from "../../core/config.js";

/** Minimal job record for pure scheduler tests (no disk). */
function job(taskId: string, phase: JobPhase, extra: Partial<IntegrationJob> = {}): IntegrationJob {
  return {
    taskId,
    phase,
    enqueuedAt: `2026-11-20T00:00:${taskId.padStart(2, "0")}Z`,
    startedAt: phase === "queued" ? null : `2026-11-20T00:01:00Z`,
    baseMainSha: "base",
    branchSha: "branch",
    candidateSha: null,
    ...extra,
  };
}

const ids = (jobs: IntegrationJob[]) => jobs.map((j) => j.taskId);

describe("selectCloseOutStarts (#1275)", () => {
  it("overlaps validation: starts up to the limit in queue order", () => {
    const jobs = [job("01", "queued"), job("02", "queued"), job("03", "queued")];
    const picks = selectCloseOutStarts({
      jobs,
      running: new Set(),
      limit: 2,
      holdExtra: false,
    });
    expect(picks).toEqual(["01", "02"]);
  });

  it("counts runs already in flight against the limit", () => {
    const jobs = [job("01", "validating"), job("02", "queued"), job("03", "queued")];
    const picks = selectCloseOutStarts({
      jobs,
      running: new Set(["01"]),
      limit: 2,
      holdExtra: false,
    });
    expect(picks).toEqual(["02"]);
  });

  it("never starts a job that is already running", () => {
    const jobs = [job("01", "validating"), job("02", "queued")];
    const picks = selectCloseOutStarts({
      jobs,
      running: new Set(["01"]),
      limit: 4,
      holdExtra: false,
    });
    expect(picks).toEqual(["02"]);
  });

  it("with limit 1 reproduces the serial pipeline", () => {
    const jobs = [job("01", "queued"), job("02", "queued")];
    expect(selectCloseOutStarts({ jobs, running: new Set(), limit: 1, holdExtra: false })).toEqual([
      "01",
    ]);
    expect(
      selectCloseOutStarts({ jobs, running: new Set(["01"]), limit: 1, holdExtra: false }),
    ).toEqual([]);
  });

  it("parks a validated job behind the head: it is not started to publish out of turn", () => {
    const jobs = [job("01", "validating"), job("02", "publishing")];
    const picks = selectCloseOutStarts({
      jobs,
      running: new Set(["01"]),
      limit: 4,
      holdExtra: false,
    });
    expect(picks).toEqual([]);
  });

  it("starts the parked publisher once it is the head of the queue", () => {
    // 01 has published and left the queue; 02 now holds the turn.
    const jobs = [job("02", "publishing")];
    expect(selectCloseOutStarts({ jobs, running: new Set(), limit: 2, holdExtra: false })).toEqual([
      "02",
    ]);
  });

  it("failure isolation: a failed head does not block the jobs behind it", () => {
    const jobs = [job("01", "failed"), job("02", "queued"), job("03", "queued")];
    expect(selectCloseOutStarts({ jobs, running: new Set(), limit: 2, holdExtra: false })).toEqual([
      "02",
      "03",
    ]);
  });

  it("starts a cancelled parked publisher so its teardown does not wait on the head", () => {
    const jobs = [job("01", "validating"), job("02", "publishing", { cancelled: true })];
    expect(
      selectCloseOutStarts({ jobs, running: new Set(["01"]), limit: 4, holdExtra: false }),
    ).toEqual(["02"]);
  });

  it("pressure guard holds extra concurrency but never the first run", () => {
    const jobs = [job("01", "queued"), job("02", "queued")];
    expect(selectCloseOutStarts({ jobs, running: new Set(), limit: 2, holdExtra: true })).toEqual([
      "01",
    ]);
    expect(
      selectCloseOutStarts({ jobs, running: new Set(["01"]), limit: 2, holdExtra: true }),
    ).toEqual([]);
  });

  it("still starts a cancelled job so its run can tear it down", () => {
    const jobs = [job("01", "queued", { cancelled: true }), job("02", "queued")];
    expect(selectCloseOutStarts({ jobs, running: new Set(), limit: 2, holdExtra: false })).toEqual([
      "01",
      "02",
    ]);
  });
});

describe("scheduler under pressure and cancellation (#1275)", () => {
  // Table-driven: each row is one pump pass over a job list (what the server
  // computes on every change). `holdExtra` is the memory pressure guard.
  const cases: Array<{
    name: string;
    jobs: IntegrationJob[];
    running: string[];
    limit: number;
    holdExtra: boolean;
    expected: string[];
  }> = [
    {
      name: "no run in flight and pressure holds: only the first run starts",
      jobs: [job("01", "queued"), job("02", "queued"), job("03", "queued")],
      running: [],
      limit: 3,
      holdExtra: true,
      expected: ["01"],
    },
    {
      name: "a run is in flight and pressure holds: no extra run starts",
      jobs: [job("01", "validating"), job("02", "queued")],
      running: ["01"],
      limit: 3,
      holdExtra: true,
      expected: [],
    },
    {
      name: "no pressure: extra runs fill the limit in queue order",
      jobs: [job("01", "queued"), job("02", "queued"), job("03", "queued")],
      running: [],
      limit: 2,
      holdExtra: false,
      expected: ["01", "02"],
    },
    {
      name: "the limit counts in-flight runs",
      jobs: [job("01", "validating"), job("02", "queued"), job("03", "queued")],
      running: ["01"],
      limit: 2,
      holdExtra: false,
      expected: ["02"],
    },
    {
      name: "a cancelled parked publisher is torn down behind a running head, under pressure",
      jobs: [job("01", "validating"), job("02", "publishing", { cancelled: true })],
      running: ["01"],
      limit: 1,
      holdExtra: true,
      expected: ["02"],
    },
    {
      name: "a cancelled job later in the queue is torn down even when the limit is full",
      jobs: [job("01", "validating"), job("02", "queued"), job("03", "queued", { cancelled: true })],
      running: ["01"],
      limit: 1,
      holdExtra: false,
      expected: ["03"],
    },
    {
      name: "a parked publisher that is not the head stays parked, even when not cancelled",
      jobs: [job("01", "validating"), job("02", "publishing")],
      running: ["01"],
      limit: 2,
      holdExtra: false,
      expected: [],
    },
  ];

  it.each(cases)("$name", ({ jobs, running, limit, holdExtra, expected }) => {
    expect(
      selectCloseOutStarts({ jobs, running: new Set(running), limit, holdExtra }),
    ).toEqual(expected);
  });
});

describe("publish turn (#1275)", () => {
  it("only the head of the pending queue may publish", () => {
    const jobs = [job("01", "validating"), job("02", "publishing"), job("03", "queued")];
    expect(publishTurnTaskId(jobs)).toBe("01");
    expect(hasPublishTurn(jobs, "01")).toBe(true);
    expect(hasPublishTurn(jobs, "02")).toBe(false);
  });

  it("passes the turn on when the head is done or failed", () => {
    const afterDone = [job("02", "publishing"), job("03", "queued")];
    expect(publishTurnTaskId(afterDone)).toBe("02");
    const afterFail = [job("01", "failed"), job("02", "publishing")];
    expect(hasPublishTurn(afterFail, "02")).toBe(true);
  });

  it("is null for an empty queue", () => {
    expect(publishTurnTaskId([])).toBeNull();
  });
});

describe("parallel validation coordination (#1275)", () => {
  let root: string;
  let coordinator: JobCoordinator;

  const task = (id: string): Task => ({ id, branch: `feat/${id}` }) as unknown as Task;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-parallel-"));
    coordinator = createJobCoordinator(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("snapshot shows started jobs alongside the head, and only unstarted jobs as queued", () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.enqueue(task("0003"));
    coordinator.updateJob("0001", { phase: "validating", startedAt: "2026-11-20T00:00:05Z" });
    coordinator.updateJob("0002", { phase: "validating", startedAt: "2026-11-20T00:00:06Z" });

    const snap = buildIntegrationSnapshot(
      coordinator,
      {},
      undefined,
      {},
      {},
      "2026-11-20T00:10:00Z",
    );
    expect(snap.active?.taskId).toBe("0001");
    expect(snap.active?.phase).toBe("validating");
    expect(snap.parallel?.map((p) => p.taskId)).toEqual(["0002"]);
    expect(snap.parallel?.[0].phase).toBe("validating");
    expect(snap.queue).toEqual(["0003"]);
    // 0002 validates ahead of 0003 and publishes first, so 0003 is third in
    // publish order (0001 head = 0), not first among the unstarted jobs.
    expect(snap.queueDetail?.map((q) => q.position)).toEqual([2]);
    expect(snap.queueDetail?.[0].blockerTaskId).toBe("0001");
  });

  it("a validated job parked for its turn is labelled waiting, not publishing", () => {
    coordinator.enqueue(task("0001"));
    coordinator.enqueue(task("0002"));
    coordinator.updateJob("0001", { phase: "validating", startedAt: "2026-11-20T00:00:05Z" });
    coordinator.updateJob("0002", { phase: "publishing", startedAt: "2026-11-20T00:00:06Z" });
    const snap = buildIntegrationSnapshot(
      coordinator,
      {},
      undefined,
      {},
      {},
      "2026-11-20T00:10:00Z",
    );
    expect(snap.parallel?.[0]).toMatchObject({ taskId: "0002", phase: "publishing" });
    expect(snap.queue).toEqual([]);
  });

  it("publish order is queue order: the second job cannot publish while the first is pending", async () => {
    // A real repo so the orchestrator's git preflight passes; the candidate is
    // never built because the job must park before any publish work starts.
    const repo = join(root, "repo");
    mkdirSync(repo, { recursive: true });
    const git = (args: string) => execSync(`git -C ${repo} ${args}`, { stdio: "ignore" });
    git("init -b main");
    git("config user.email t@example.com");
    git("config user.name T");
    writeFileSync(join(repo, "README.md"), "# repo\n");
    git("add README.md");
    git('commit -m "init"');

    const repoCoordinator = createJobCoordinator(repo);
    repoCoordinator.enqueue(task("0001"));
    repoCoordinator.enqueue(task("0002"));
    repoCoordinator.updateJob("0001", { phase: "validating", startedAt: "2026-11-20T00:00:05Z" });
    repoCoordinator.updateJob("0002", {
      phase: "publishing",
      startedAt: "2026-11-20T00:00:06Z",
      baseMainSha: "deadbeef",
      candidateSha: "cafe",
    });

    const orchestrator = new CloseOutOrchestrator(
      { root: repo, cacheDir: ".repoos" } as unknown as RepoOSConfig,
      repoCoordinator,
    );
    const result = await orchestrator.processTask("0002");

    expect(result).toEqual({ ok: true, reason: "awaiting publish turn" });
    const parked = repoCoordinator.getJob("0002");
    // Parking writes nothing: phase, base and candidate are exactly as they were.
    expect(parked).toMatchObject({
      phase: "publishing",
      baseMainSha: "deadbeef",
      candidateSha: "cafe",
    });
  });
});

describe("stale base at publish (#1275)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-stale-base-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("never publishes a candidate built on a base that moved: it is sent back to syncing", async () => {
    const repo = join(root, "repo");
    mkdirSync(repo, { recursive: true });
    const git = (args: string) =>
      execSync(`git -C ${repo} ${args}`, { stdio: "pipe" }).toString().trim();
    git("init -b main");
    git("config user.email t@example.com");
    git("config user.name T");
    writeFileSync(join(repo, "README.md"), "# repo\n");
    git("add README.md");
    git('commit -m "init"');
    const mainBefore = git("rev-parse main");
    // The candidate the sync phase would have built, named as the orchestrator names it.
    const candidatePath = join(root, "candidate-0002");
    git(`worktree add -b repoos/integrate/0002 ${candidatePath} main`);

    const repoCoordinator = createJobCoordinator(repo);
    repoCoordinator.enqueue({ id: "0002", branch: "feat/0002" } as unknown as Task);
    // Validated against a base that is not main any more: publish must refuse it.
    repoCoordinator.updateJob("0002", {
      phase: "publishing",
      startedAt: "2026-11-20T00:00:06Z",
      baseMainSha: "1111111111111111111111111111111111111111",
      candidateSha: "cafe",
    });

    const orchestrator = new CloseOutOrchestrator(
      { root: repo, cacheDir: ".repoos" } as unknown as RepoOSConfig,
      repoCoordinator,
    );
    const result = await orchestrator.processTask("0002");

    expect(result).toEqual({ ok: false, reason: "main advanced, revalidating" });
    expect(repoCoordinator.getJob("0002")).toMatchObject({
      phase: "syncing",
      baseMainSha: null,
      candidateSha: null,
      publishDriftCount: 1,
    });
    // Main is untouched: nothing was published, and the stale candidate worktree
    // was discarded so the next sync rebuilds it on the new base.
    expect(git("rev-parse main")).toBe(mainBefore);
    expect(git("worktree list --porcelain")).not.toContain(candidatePath);
  });
});

describe("maxParallelValidations setting (#1275)", () => {
  it("defaults to 2 and is exposed as a live Settings select of 1-8", () => {
    expect(DEFAULT_CONFIG.maxParallelValidations).toBe(2);
    const field = getConfigSchema().find((f) => f.key === "maxParallelValidations");
    expect(field).toMatchObject({ type: "select", tier: "live", restartRequired: false });
    expect(field?.options?.map((o) => o.value)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });
});
