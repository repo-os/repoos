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
  TailscaleHostPool,
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

// A `repoos check` parent exports REPOOS_CHECK_STORE_ROOT for its OWN rows;
// these fixtures own their tmp stores and must never be redirected by an
// inherited env (a leaked export sent fixture rows into the live store).
delete process.env.REPOOS_CHECK_STORE_ROOT;

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
      if (cmd.includes("__HOST_LOCK__")) {
        return { code: 0, output: "__HOST_LOCK__\n", timedOut: false };
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

  it("counts waiters without a task id toward queued without inventing one (0564 review)", async () => {
    const root = tmpRoot();
    // A direct pool acquire with no taskId — the remote runners panel must
    // still see the queue depth, and must not render a fake "#?" as next-up.
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => ({ ok: true })),
      uploadFile: vi.fn(async () => ({ ok: true })),
      downloadDir: vi.fn(async () => {}),
      probeTcp: vi.fn(async () => true),
      runRemote: vi.fn((_host, cmd): Promise<RemoteExecResult> => {
        if (cmd.includes(PREREQ_OK_TOKEN)) {
          return Promise.resolve({ code: 0, output: PREREQ_OK_TOKEN, timedOut: false });
        }
        if (cmd.includes("__HOST_LOCK__")) {
          return Promise.resolve({ code: 0, output: "__HOST_LOCK__\n", timedOut: false });
        }
        // Never finishes — the holder keeps its slot for the whole test.
        return new Promise<RemoteExecResult>(() => {});
      }),
    };
    const pool = new TailscaleHostPool(
      {
        enabled: true,
        provider: "tailscale",
        tailscaleHosts: [{ host: "bee" }],
        maxConcurrent: 1,
      } as never,
      { exec },
    );
    const holder = pool.acquire([], {});
    await tick();
    const unknown = pool.acquire([], {});
    await tick();

    const status = pool.status()[0]!;
    expect(status.queued).toBe(1);
    expect(status.queuedTasks).toEqual([]);

    (await holder).release();
    const slot = await unknown;
    slot.release();
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
      failedStep: "tests",
      failedTests: ["tests/a.test.ts"],
    });
    expect(rows[0]!.detail ?? "").toContain("remote validation failed");
  });

  it("records a failed run with no Vitest names as remote-validation", async () => {
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
        return {
          code: 1,
          output: "error TS2345: Argument of type 'string' is not assignable\nBuild failed",
          timedOut: false,
        };
      }),
    };
    const runner = new TailscaleRunner(config, undefined, { exec });
    expect(await runner.validate(opts("0564"))).toMatchObject({ ok: false });

    const row = getCheckStore(root).list()[0]!;
    expect(row).toMatchObject({
      outcome: "fail",
      failedStep: "build",
      failedTests: [],
    });
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

  it("records a mid-dispatch deadline cancel as cancelled, attributed to the host (0564 review)", async () => {
    // The deadline expires while the bundle is in flight — AFTER the slot was
    // acquired and a host chosen, before the suite starts. This used to land
    // as `fail` with failedStep "remote-validation"; it is a cancellation.
    const root = tmpRoot();
    const config = {
      root,
      cacheDir: ".repoos",
      remoteValidation: {
        enabled: true,
        provider: "tailscale",
        tailscaleHosts: [{ host: "bee" }],
      },
    } as unknown as RepoOSConfig;
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { ok: true };
      }),
      uploadFile: vi.fn(async () => ({ ok: true })),
      downloadDir: vi.fn(async () => {}),
      probeTcp: vi.fn(async () => true),
      runRemote: vi.fn(async (_h, cmd): Promise<RemoteExecResult> =>
        cmd.includes(PREREQ_OK_TOKEN)
          ? { code: 0, output: PREREQ_OK_TOKEN, timedOut: false }
          : { code: 0, output: "ok", timedOut: false },
      ),
    };
    const runner = new TailscaleRunner(config, undefined, { exec });
    const summary = await runner.validate(opts("0564", { deadlineAt: Date.now() + 15 }));
    expect(summary.ok).toBe(false);
    expect(summary.cancelled).toBe(true);

    const rows = getCheckStore(root).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: "0564",
      machine: "bee", // a host WAS chosen before the cancel
      remote: true,
      outcome: "cancelled",
      durationMs: null,
    });
  });

  it("records a row for a disabled runner, like the Hetzner path (0564 review)", async () => {
    const root = tmpRoot();
    const config = {
      root,
      cacheDir: ".repoos",
      remoteValidation: {
        enabled: false,
        provider: "tailscale",
        tailscaleHosts: [{ host: "bee" }],
      },
    } as unknown as RepoOSConfig;
    const exec: RemoteExecDeps = {
      bundleRepo: vi.fn(async () => ({ ok: true })),
      uploadFile: vi.fn(async () => ({ ok: true })),
      downloadDir: vi.fn(async () => {}),
      probeTcp: vi.fn(async () => true),
      runRemote: vi.fn(async (): Promise<RemoteExecResult> => ({
        code: 0,
        output: "ok",
        timedOut: false,
      })),
    };
    const runner = new TailscaleRunner(config, undefined, { exec });
    const summary = await runner.validate(opts("0564"));
    expect(summary.ok).toBe(false);
    expect(exec.runRemote).not.toHaveBeenCalled();

    const rows = getCheckStore(root).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: "0564",
      machine: null,
      remote: true,
      outcome: "fail",
      failedStep: "remote-validation",
      detail: "remote validation is disabled",
    });
  });

  it("writes to REPOOS_CHECK_STORE_ROOT when set (0564 review)", async () => {
    // A standalone `repoos check` in a task worktree resolves the env to the
    // MAIN checkout before dispatching, so the row lands in the history the
    // server reads — not the worktree's own store.
    const root = tmpRoot();
    const mainRoot = tmpRoot();
    process.env.REPOOS_CHECK_STORE_ROOT = mainRoot;
    try {
      const config = {
        root,
        cacheDir: ".repoos",
        remoteValidation: {
          enabled: true,
          provider: "tailscale",
          tailscaleHosts: [{ host: "bee" }],
        },
      } as unknown as RepoOSConfig;
      const exec: RemoteExecDeps = {
        bundleRepo: vi.fn(async () => ({ ok: true })),
        uploadFile: vi.fn(async () => ({ ok: true })),
        downloadDir: vi.fn(async () => {}),
        probeTcp: vi.fn(async () => true),
        runRemote: vi.fn(async (_h, cmd): Promise<RemoteExecResult> =>
          cmd.includes(PREREQ_OK_TOKEN)
            ? { code: 0, output: PREREQ_OK_TOKEN, timedOut: false }
            : { code: 0, output: "ok", timedOut: false },
        ),
      };
      const runner = new TailscaleRunner(config, undefined, { exec });
      expect(await runner.validate(opts("0564"))).toMatchObject({ ok: true });

      expect(getCheckStore(mainRoot).list()).toHaveLength(1);
      expect(getCheckStore(root).list()).toHaveLength(0);
    } finally {
      delete process.env.REPOOS_CHECK_STORE_ROOT;
    }
  });
});
