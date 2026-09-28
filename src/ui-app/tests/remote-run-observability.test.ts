/**
 * Remote run observability (#0564): the pool tracks which task runs where and
 * since when (`activeRuns`), queues surface their next-up tasks, and every
 * `validate()` — pass, fail, or never dispatched — lands one durable row in
 * `.repoos/checks.db` attributed to the machine that ran it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import {
  PREREQ_OK_TOKEN,
  TailscaleRunner,
  type RemoteExecDeps,
  type RemoteExecResult,
} from "../../server/remote-validation.js";
import { CheckStore, getCheckStore, resetCheckStore } from "../../core/check-store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  resetCheckStore();
});

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-runobs-"));
  dirs.push(root);
  return root;
}

const tick = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Fixture {
  runner: TailscaleRunner;
  root: string;
  /** Unblock the pending validation runs, in arrival order. */
  release(): void;
  pending(): number;
  store(): CheckStore;
}

function fixture(opts: { hosts: Array<{ host: string; maxConcurrent?: number }> }): Fixture {
  const root = tmpRoot();
  const config = {
    root,
    cacheDir: ".repoos",
    remoteValidation: {
      enabled: true,
      provider: "tailscale",
      tailscaleHosts: opts.hosts,
    },
  } as unknown as RepoOSConfig;

  // Validation runs (not the probe) block until release() resolves them with
  // exit 0, so a test can observe the in-flight state before completing.
  const pendingRuns: Array<() => void> = [];
  const exec: RemoteExecDeps = {
    bundleRepo: vi.fn(async () => ({ ok: true })),
    uploadFile: vi.fn(async () => ({ ok: true })),
    downloadDir: vi.fn(async () => {}),
    probeTcp: vi.fn(async () => true),
    runRemote: vi.fn(async (_host, cmd): Promise<RemoteExecResult> => {
      if (cmd.includes(PREREQ_OK_TOKEN)) {
        return { code: 0, output: PREREQ_OK_TOKEN, timedOut: false };
      }
      await new Promise<void>((resolve) => pendingRuns.push(resolve));
      return { code: 0, output: "ok", timedOut: false };
    }),
  };
  const runner = new TailscaleRunner(config, undefined, { exec });
  return {
    runner,
    root,
    release: () => {
      for (const r of pendingRuns.splice(0)) r();
    },
    pending: () => pendingRuns.length,
    store: () => getCheckStore(root),
  };
}

const opts = (taskId: string, extra: Record<string, unknown> = {}) => ({
  taskId,
  worktreePath: "/nonexistent",
  candidateSha: "abc123def456",
  phase: "pre-review" as const,
  ...extra,
});

describe("TailscaleHostPool activeRuns (#0564)", () => {
  it("tracks which task is running on which host, and clears on release", async () => {
    const f = fixture({ hosts: [{ host: "bee" }, { host: "mini" }] });
    const p1 = f.runner.validate(opts("0564"));
    await tick();
    expect(f.pending()).toBe(1);

    const status = f.runner.hostStatus!();
    const busy = status.find((h) => h.activeRuns?.length)!;
    expect(busy.activeRuns).toHaveLength(1);
    expect(busy.activeRuns![0]).toMatchObject({ taskId: "0564" });
    expect(Number.isFinite(Date.parse(busy.activeRuns![0]!.startedAt))).toBe(true);
    expect(status.find((h) => h.host === busy.host)!.inFlight).toBe(1);

    f.release();
    expect(await p1).toMatchObject({ ok: true });
    const after = f.runner.hostStatus!();
    for (const h of after) {
      expect(h.activeRuns).toEqual([]);
      expect(h.inFlight).toBe(0);
    }
  });

  it("shows a queued run's task id as the host's next-up (#0564)", async () => {
    const f = fixture({ hosts: [{ host: "bee", maxConcurrent: 1 }] });
    const first = f.runner.validate(opts("0564"));
    await tick();
    const second = f.runner.validate(opts("0565"));
    await tick();

    const status = f.runner.hostStatus!()[0]!;
    expect(status.queued).toBe(1);
    expect(status.queuedTasks).toEqual(["0565"]);

    f.release();
    await tick();
    expect(f.runner.hostStatus!()[0]!.queuedTasks).toEqual([]);
    f.release();
    expect(await Promise.all([first, second])).toEqual([
      { ok: true, stage: "check" },
      { ok: true, stage: "check" },
    ]);
  });

  it("lastRun carries the duration of the completed run", async () => {
    const f = fixture({ hosts: [{ host: "bee" }] });
    const p = f.runner.validate(opts("0564"));
    await tick();
    await tick(30); // let the run "take" some time
    f.release();
    expect(await p).toMatchObject({ ok: true });
    const last = f.runner.hostStatus!()[0]!.lastRun!;
    expect(last).toMatchObject({ taskId: "0564", ok: true });
    expect(last.durationMs ?? 0).toBeGreaterThan(0);
  });
});

describe("remote run history rows (#0564)", () => {
  it("records one pass row per validate(), attributed to the host", async () => {
    const f = fixture({ hosts: [{ host: "bee" }] });
    const p = f.runner.validate(opts("0564"));
    await tick();
    f.release();
    expect(await p).toMatchObject({ ok: true });

    const rows = f.store().list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: "0564",
      phase: "pre-review",
      machine: "bee",
      remote: true,
      scope: "full",
      outcome: "pass",
      failedStep: null,
    });
    expect(rows[0]!.durationMs ?? 0).toBeGreaterThan(0);
  });

  it("records a failed run against its host with the failing half named", async () => {
    const root = tmpRoot();
    const config = {
      root,
      cacheDir: ".repoos",
      remoteValidation: {
        enabled: true,
        provider: "tailscale",
        tailscaleHosts: [{ host: "mini" }],
      },
    } as unknown as RepoOSConfig;
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => ({ ok: true })),
      uploadFile: vi.fn(async () => ({ ok: true })),
      downloadDir: vi.fn(async () => {}),
      probeTcp: vi.fn(async () => true),
      runRemote: vi.fn(async (_host, cmd): Promise<RemoteExecResult> => {
        if (cmd.includes(PREREQ_OK_TOKEN)) {
          return { code: 0, output: PREREQ_OK_TOKEN, timedOut: false };
        }
        return { code: 1, output: "FAIL tests/a.test.ts", timedOut: false };
      }),
    };
    const runner = new TailscaleRunner(config, undefined, { exec });
    const summary = await runner.validate(opts("0564"));
    expect(summary.ok).toBe(false);

    const rows = getCheckStore(root).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      machine: "mini",
      remote: true,
      outcome: "fail",
      failedStep: "remote-validation",
    });
    expect(rows[0]!.detail ?? "").toContain("remote validation failed");
  });

  it("records a dispatch failure with no machine, and a caller-deadline cancel as cancelled", async () => {
    // No eligible host: the run never reached a machine.
    const f = fixture({ hosts: [{ host: "bee", maxConcurrent: 1 }] });
    const holder = f.runner.validate(opts("0564"));
    await tick();
    const queued = f.runner.validate(opts("0565", { deadlineAt: Date.now() - 1 }));
    expect(await queued).toMatchObject({ ok: false, transient: true });

    const rows = f.store().list({ taskId: "0565" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      machine: null,
      remote: true,
      outcome: "cancelled",
      durationMs: null,
      failedStep: "remote-validation",
    });

    f.release();
    await holder;
  });

  it("records task-less rows for pseudo task ids, keeping the phase", async () => {
    const f = fixture({ hosts: [{ host: "bee" }] });
    const p = f.runner.validate(opts("release", { phase: "release" }));
    await tick();
    f.release();
    expect(await p).toMatchObject({ ok: true });

    const all = f.store().list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ taskId: null, phase: "release", machine: "bee" });
  });
});
