/**
 * The durable check-run store (#0564): one row per `repoos check` execution
 * in `.repoos/checks.db`, newest-first listing with filters, bounded
 * retention, the env-based caller attribution, and fail-soft behavior
 * throughout — the store is for visibility, never a gate input.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckStore,
  envToRunContext,
  localMachineName,
  resetCheckStore,
} from "../../core/check-store.js";
import { mainCheckoutRoot } from "../../core/git.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  resetCheckStore();
});

// Never let an inherited REPOOS_CHECK_STORE_ROOT (a `repoos check` parent
// exports it for its own rows) redirect these fixtures into a live store.
delete process.env.REPOOS_CHECK_STORE_ROOT;

function store(): { s: CheckStore; root: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-checkstore-"));
  dirs.push(root);
  return { s: new CheckStore(root), root };
}

function row(over: Partial<Parameters<CheckStore["record"]>[0]> = {}) {
  return {
    taskId: "0564",
    phase: "pre-review" as const,
    machine: "bee",
    remote: false,
    scope: "full",
    startedAt: new Date("2026-09-28T10:00:00Z").toISOString(),
    durationMs: 60_000,
    outcome: "pass" as const,
    failedStep: null,
    skippedSteps: [],
    detail: null,
    ...over,
  };
}

describe("check-run store", () => {
  it("records and lists rows newest-first", () => {
    const { s } = store();
    s.record(row({ taskId: "0501", startedAt: "2026-09-28T09:00:00Z" }));
    s.record(row({ taskId: "0502", startedAt: "2026-09-28T10:00:00Z" }));
    const rows = s.list();
    expect(rows.map((r) => r.taskId)).toEqual(["0502", "0501"]);
    expect(rows[0]).toMatchObject({
      phase: "pre-review",
      machine: "bee",
      remote: false,
      scope: "full",
      durationMs: 60_000,
      outcome: "pass",
      failedStep: null,
      skippedSteps: [],
    });
    expect(Number.isFinite(rows[0]!.id)).toBe(true);
  });

  it("round-trips skipped steps, failed step and detail", () => {
    const { s } = store();
    s.record(
      row({
        outcome: "fail",
        failedStep: "tests",
        skippedSteps: ["css-layers", "ui-smoke"],
        detail: "2 test(s) failed",
      }),
    );
    expect(s.list()[0]).toMatchObject({
      outcome: "fail",
      failedStep: "tests",
      skippedSteps: ["css-layers", "ui-smoke"],
      detail: "2 test(s) failed",
    });
  });

  it("filters by task, machine and remote", () => {
    const { s } = store();
    s.record(row({ taskId: "0501", machine: "bee", remote: true }));
    s.record(row({ taskId: "0502", machine: "mini", remote: true }));
    s.record(row({ taskId: "0503", machine: "bee", remote: false }));
    s.record(row({ taskId: null, phase: "cli", machine: "bee", remote: false }));

    expect(s.list({ taskId: "0502" }).map((r) => r.taskId)).toEqual(["0502"]);
    expect(s.list({ machine: "mini" })).toHaveLength(1);
    expect(s.list({ remote: true })).toHaveLength(2);
    expect(s.list({ remote: false })).toHaveLength(2);
    expect(s.list({ taskId: "0501", remote: true })).toHaveLength(1);
  });

  it("prunes to the retention cap, keeping the newest rows", () => {
    const { s } = store();
    for (let i = 0; i < 1005; i++) {
      s.record(
        row({
          startedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        }),
      );
    }
    const rows = s.list({ limit: 2000 });
    expect(rows).toHaveLength(1000);
    // The oldest five are gone; the newest thousand remain.
    const started = rows.map((r) => Date.parse(r.startedAt));
    expect(Math.min(...started)).toBe(
      Date.parse(new Date(Date.UTC(2026, 0, 1, 0, 0, 5)).toISOString()),
    );
  });

  it("clamps the query limit", () => {
    const { s } = store();
    s.record(row());
    expect(s.list({ limit: 0 })).toHaveLength(1); // clamped up to 1
    expect(s.list({ limit: -5 })).toHaveLength(1);
  });

  it("is fail-soft: an unreadable repo root lists empty and records nothing", () => {
    // A path whose parent cannot exist keeps the constructor from opening the
    // db; the store must degrade to no-ops instead of throwing.
    const bogus = new CheckStore("/proc/definitely-not-here/nope");
    if (bogus.isAvailable()) return; // /proc writable? skip — fail-soft held either way
    expect(bogus.list()).toEqual([]);
    expect(() => bogus.record(row())).not.toThrow();
  });
});

describe("envToRunContext (caller attribution)", () => {
  it("maps a bare CLI run to phase 'cli' with no task id", () => {
    expect(envToRunContext({})).toEqual({ taskId: null, phase: "cli" });
    expect(envToRunContext({ REPOOS_CHECK_PHASE: "" })).toEqual({
      taskId: null,
      phase: "cli",
    });
  });

  it("maps caller-supplied task + phase", () => {
    expect(
      envToRunContext({ REPOOS_CHECK_TASK_ID: "0564", REPOOS_CHECK_PHASE: "close-out" }),
    ).toEqual({ taskId: "0564", phase: "close-out" });
    expect(envToRunContext({ REPOOS_CHECK_TASK_ID: "0564" })).toEqual({
      taskId: "0564",
      phase: "pre-review",
    });
    expect(envToRunContext({ REPOOS_CHECK_PHASE: "release" })).toEqual({
      taskId: null,
      phase: "release",
    });
  });

  it("treats an unknown phase as pre-review when a task is attached", () => {
    expect(envToRunContext({ REPOOS_CHECK_TASK_ID: "0564", REPOOS_CHECK_PHASE: "bogus" })).toEqual({
      taskId: "0564",
      phase: "pre-review",
    });
  });

  it("localMachineName is a short hostname", () => {
    const name = localMachineName();
    expect(name).toBeTruthy();
    expect(name).not.toContain(".");
    expect(name).toBe(name.toLowerCase());
  });
});

describe("mainCheckoutRoot (worktree → server store, #0564 review)", () => {
  function gitRepo(): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-mcroot-"));
    dirs.push(root);
    const run = (args: string[], cwd: string): void => {
      execFileSync("git", args, { cwd, stdio: "ignore" });
    };
    run(["init", "-q"], root);
    run(["config", "user.email", "t@example.com"], root);
    run(["config", "user.name", "T"], root);
    writeFileSync(join(root, "f.txt"), "x");
    run(["add", "."], root);
    run(["commit", "-qm", "init"], root);
    return root;
  }

  it("resolves the main checkout from inside a linked worktree", () => {
    const main = gitRepo();
    const wt = join(main, "..", "repoos-mcroot-wt");
    execFileSync("git", ["worktree", "add", "-q", wt, "-b", "side"], { cwd: main });
    dirs.push(wt);
    // git prints resolved paths, so compare through realpath (macOS /var →
    // /private/var); the main checkout itself is idempotent either way.
    const real = (p: string): string => realpathSync(p);
    expect(real(mainCheckoutRoot(wt))).toBe(real(main));
    expect(real(mainCheckoutRoot(main))).toBe(real(main));
  });

  it("falls back to the given root outside git (fail-soft)", () => {
    const plain = mkdtempSync(join(tmpdir(), "repoos-mcplain-"));
    dirs.push(plain);
    expect(mainCheckoutRoot(plain)).toBe(plain);
  });
});
