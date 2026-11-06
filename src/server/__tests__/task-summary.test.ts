/**
 * Generation, idempotency and failure checks for the post-merge summary (#1041).
 * The PM runner and the bookkeeping commit are injected — no real agent runs.
 */
import * as fs from "node:fs";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERATED_CHANGES_MARKER } from "../../core/task-summary.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import * as dbModule from "../../core/db.js";
import {
  acquireSummaryCommitSlot,
  collectTaskSummaryFacts,
  loadCandidateTasksFromDisk,
  loadTaskSummaryMarkdown,
  queueTaskSummary,
  readSummaryStatus,
  readTaskFromDisk,
  runTaskSummaryNow,
  summaryReleaseGate,
} from "../task-summary.js";

const VALID = [
  "## TL;DR",
  "",
  "Done.",
  "",
  "## Outcome",
  "",
  "Shipped.",
  "",
  "## Process stats",
  "",
  "One round.",
  "",
  "## What went wrong",
  "",
  "Nothing.",
  "",
  "## Learnings",
  "",
  "None.",
  "",
  "## Follow-ups",
  "",
  "None.",
  "",
].join("\n");

let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function setup(): { config: RepoOSConfig; task: Task } {
  const root = mkdtempSync(join(tmpdir(), "summary-"));
  roots.push(root);
  mkdirSync(join(root, "work", "reports", "0099"), { recursive: true });
  writeFileSync(
    join(root, "work", "reports", "0099", "round-1.json"),
    JSON.stringify({
      taskId: "0099",
      round: 1,
      at: "2026-11-06T05:00:00Z",
      agent: "engineer",
      model: "m",
      branch: "feat/x",
      baseSha: "a",
      sourceSha: "b",
      wordCount: 5,
      markdown: "## TL;DR\n\nr1",
    }),
  );
  writeFileSync(
    join(root, "work", "reports", "0099", "review-1.md"),
    "---\nat: t\nstate: ok\nverdict: good to go\nagent: reviewer\ncli: opencode\nmodel: m\n---\n\n## Verdict\n\ngood to go\n",
  );
  const config = { root, workDir: "work", cacheDir: ".repoos" } as unknown as RepoOSConfig;
  const task = {
    id: "0099",
    title: "T",
    type: "feature",
    status: "done",
    branch: "",
    path: "work/0099-t.md",
    absPath: join(root, "work", "0099-t.md"),
    body: "Body.\n\n## Activity\n\n- 2026-11-06T05:00:00Z · created · human\n",
    area: "core",
    priority: "p2",
    created_at: "2026-11-06T04:00:00Z",
    updated_at: "2026-11-06T06:00:00Z",
    mergedCommit: null,
    dependsOn: [],
  } as unknown as Task;
  writeFileSync(task.absPath, "---\nid: '0099'\ntitle: T\nstatus: done\n---\n\nBody.\n");
  return { config, task };
}

describe("post-merge summary generation", () => {
  it("writes, validates and commits summary.md and records done", async () => {
    const { config, task } = setup();
    const commit = vi.fn(() => true);
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit,
    });
    expect(res).toEqual({ ok: true });
    const stored = loadTaskSummaryMarkdown(config, "0099");
    expect(stored).toContain("## TL;DR");
    expect(stored).toContain("## Changed files");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(readSummaryStatus(config, "0099").status).toBe("done");
  });

  it("is idempotent: a second run overwrites the same file, never duplicates", async () => {
    const { config, task } = setup();
    const deps = {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => true,
    };
    expect((await runTaskSummaryNow(config, task, [], deps)).ok).toBe(true);
    const first = readFileSync(join(root(config), "work", "reports", "0099", "summary.md"), "utf8");
    expect((await runTaskSummaryNow(config, task, [], deps)).ok).toBe(true);
    const second = readFileSync(
      join(root(config), "work", "reports", "0099", "summary.md"),
      "utf8",
    );
    expect(second).toBe(first);
    expect(readSummaryStatus(config, "0099").status).toBe("done");
  });

  it("records a visible failure and leaves done status alone when the PM run fails", async () => {
    const { config, task } = setup();
    const before = task.status;
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => {
        throw new Error("boom");
      }) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(false);
    expect(task.status).toBe(before);
    const state = readSummaryStatus(config, "0099");
    expect(state.status).toBe("failed");
    expect(state.error).toContain("boom");
    expect(loadTaskSummaryMarkdown(config, "0099")).toBeNull();
  });
});

function root(config: RepoOSConfig): string {
  return (config as unknown as { root: string }).root;
}

describe("post-merge summary freshness and marker hygiene", () => {
  it("prefers the task file on disk over a stale live-index object", async () => {
    const { config, task } = setup();
    writeFileSync(
      task.absPath,
      "---\nid: '0099'\ntitle: T\nstatus: done\nmerged_commit: abc123def\n---\n\nBody.\n",
    );
    const stale = { ...task, status: "review", mergedCommit: null } as Task;
    let seen = "";
    const res = await runTaskSummaryNow(config, stale, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async (_pm: unknown, prompt: unknown) => {
        seen = prompt as string;
        return { ok: true, output: VALID };
      }) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(true);
    expect(seen).toContain("Status: done");
    expect(seen).toContain("Merged commit: abc123def");
    expect(seen).not.toContain("Status: review");
  });

  it("rejects PM output that hides padding after an injected marker", async () => {
    const { config, task } = setup();
    const injected = `## TL;DR\n\nok\n${GENERATED_CHANGES_MARKER}\n${"word ".repeat(2001)}`;
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: injected })) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/words/);
    expect(loadTaskSummaryMarkdown(config, "0099")).toBeNull();
    expect(readSummaryStatus(config, "0099").status).toBe("failed");
  });

  it("strips an injected marker from passing output so the file carries exactly one", async () => {
    const { config, task } = setup();
    const injected = `## TL;DR\n\nShort.\n${GENERATED_CHANGES_MARKER}\nTail.`;
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: injected })) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(true);
    const stored = loadTaskSummaryMarkdown(config, "0099") ?? "";
    expect(stored).toContain("Tail.");
    expect(stored.split(GENERATED_CHANGES_MARKER).length - 1).toBe(1);
  });
});

describe("post-merge summary lifecycle gate", () => {
  it.each([
    ["done passes", "done", true],
    ["review refuses", "review", false],
    ["active refuses", "active", false],
    ["inbox refuses", "inbox", false],
  ])("gate: %s", (_name, status, passes) => {
    const verdict = summaryReleaseGate({ id: "0099", status } as Task);
    if (passes) expect(verdict).toBeNull();
    else expect(verdict ?? "").toMatch(/not released/);
  });

  it("refuses a non-released task without running the PM or committing", async () => {
    const { config, task } = setup();
    writeFileSync(task.absPath, "---\nid: '0099'\ntitle: T\nstatus: review\n---\n\nBody.\n");
    const reviewing = { ...task, status: "review" } as Task;
    const runPrompt = vi.fn(async () => ({ ok: true, output: VALID }));
    const commit = vi.fn(() => true);
    const res = await runTaskSummaryNow(config, reviewing, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: runPrompt as never,
      commit,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/not released/);
    expect(runPrompt).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(loadTaskSummaryMarkdown(config, "0099")).toBeNull();
    expect(readSummaryStatus(config, "0099").status).toBe("failed");
    expect(task.status).toBe("done");
  });

  it("lets the disk file govern over a stale done object", async () => {
    const { config, task } = setup();
    writeFileSync(task.absPath, "---\nid: '0099'\ntitle: T\nstatus: active\n---\n\nBody.\n");
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/status: active/);
  });
});

describe("post-merge summary commit slot", () => {
  it("acquires and releases the publication locks on a free root", async () => {
    const { config } = setup();
    const slot = await acquireSummaryCommitSlot(root(config), "0099", { tries: 2, delayMs: 1 });
    expect(slot).not.toBeNull();
    expect(existsSync(join(root(config), ".repoos", "close-out.lock"))).toBe(true);
    expect(existsSync(join(root(config), ".repoos", "root.lock"))).toBe(true);
    slot!();
    expect(existsSync(join(root(config), ".repoos", "close-out.lock"))).toBe(false);
    expect(existsSync(join(root(config), ".repoos", "root.lock"))).toBe(false);
  });

  it("gives up visibly when a landing holds publication", async () => {
    const { config } = setup();
    mkdirSync(join(root(config), ".repoos"), { recursive: true });
    writeFileSync(
      join(root(config), ".repoos", "close-out.lock"),
      JSON.stringify({ taskId: "other", acquiredAt: new Date().toISOString() }),
    );
    const slot = await acquireSummaryCommitSlot(root(config), "0099", { tries: 2, delayMs: 1 });
    expect(slot).toBeNull();
  });

  it("serializes the commit between acquire and release", async () => {
    const { config, task } = setup();
    const order: string[] = [];
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => {
        order.push("commit");
        return true;
      },
      commitSlot: (async () => {
        order.push("acquire");
        return () => {
          order.push("release");
        };
      }) as never,
    });
    expect(res.ok).toBe(true);
    expect(order).toEqual(["acquire", "commit", "release"]);
  });

  it("surfaces restore failures when commit returns false", async () => {
    const { config, task } = setup();
    const summaryPath = join(root(config), "work", "reports", "0099", "summary.md");
    writeFileSync(summaryPath, "ORIGINAL_MARK\n");
    let writesToSummary = 0;
    const wf = vi.spyOn(fs, "writeFileSync");
    wf.mockImplementation(((p: string, content: string) => {
      if (p === summaryPath) {
        writesToSummary += 1;
        if (writesToSummary === 2) throw new Error("restore failed");
      }
      return (writeFileSync as (path: string, data: string) => void)(p, content);
    }) as typeof writeFileSync);
    try {
      const res = await runTaskSummaryNow(config, task, [], {
        resolvePm: () => ({ name: "pm" }) as never,
        runPrompt: (async () => ({ ok: true, output: VALID })) as never,
        commit: () => false,
      });
      expect(res.ok).toBe(false);
      expect(res.error ?? "").toMatch(/restore error: restore failed/);
      expect(readFileSync(summaryPath, "utf8")).not.toContain("ORIGINAL_MARK");
    } finally {
      wf.mockRestore();
    }
  });

  it("surfaces unlink failures on commit failure when there was no prior file", async () => {
    const { config, task } = setup();
    const summaryPath = join(root(config), "work", "reports", "0099", "summary.md");
    if (existsSync(summaryPath)) rmSync(summaryPath);
    const ul = vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
      throw new Error("unlink blocked");
    });
    try {
      const res = await runTaskSummaryNow(config, task, [], {
        resolvePm: () => ({ name: "pm" }) as never,
        runPrompt: (async () => ({ ok: true, output: VALID })) as never,
        commit: () => false,
      });
      expect(res.ok).toBe(false);
      expect(res.error ?? "").toMatch(/unlink blocked/);
    } finally {
      ul.mockRestore();
    }
  });

  it("fails visibly without committing when the slot never opens", async () => {
    const { config, task } = setup();
    const commit = vi.fn(() => true);
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit,
      commitSlot: (async () => null) as never,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/commit slot/);
    expect(commit).not.toHaveBeenCalled();
    expect(readSummaryStatus(config, "0099").status).toBe("failed");
  });
});

describe("post-merge summary status persistence", () => {
  it("still succeeds when the done-status write fails — the report is ground truth", async () => {
    const { config, task } = setup();
    writeFileSync(join(root(config), "blocked"), "not a dir");
    const blocked = { ...config, cacheDir: "blocked" } as RepoOSConfig;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runTaskSummaryNow(blocked, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(true);
    expect(loadTaskSummaryMarkdown(blocked, "0099")).toContain("## TL;DR");
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/not persisted/);
    err.mockRestore();
  });

  it("logs instead of suppressing when the pending-status write fails", async () => {
    const { config, task } = setup();
    writeFileSync(join(root(config), "blocked"), "not a dir");
    const blocked = { ...config, cacheDir: "blocked" } as RepoOSConfig;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    queueTaskSummary(blocked, task, []);
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/not persisted/);
    err.mockRestore();
  });
});

describe("post-merge summary disk fallbacks", () => {
  it("reads a task from disk when the live index misses it", () => {
    const { config } = setup();
    const found = readTaskFromDisk(config, "0099");
    expect(found?.id).toBe("0099");
    expect(found?.absPath).toBe(join(root(config), "work", "0099-t.md"));
    expect(readTaskFromDisk(config, "nope")).toBeNull();
  });

  it("lists candidate tasks from disk, skipping non-task and nested files", () => {
    const { config } = setup();
    writeFileSync(join(root(config), "work", "notes.md"), "# not a task\n");
    mkdirSync(join(root(config), "work", "archive"), { recursive: true });
    writeFileSync(
      join(root(config), "work", "archive", "0101-old.md"),
      "---\nid: '0101'\ntitle: Archived\n---\n\nOld.\n",
    );
    writeFileSync(
      join(root(config), "work", "0100-follow-up.md"),
      "---\nid: '0100'\ntitle: Follow-up\ndepends_on: ['0099']\n---\n\nFollow-up body.\n",
    );
    const ids = loadCandidateTasksFromDisk(config).tasks
      .map((task) => task.id)
      .sort();
    expect(ids).toEqual(["0099", "0100"]);
  });

  it("surfaces a work-dir scan failure instead of an empty candidate list", () => {
    const { config } = setup();
    const bad = { ...config, workDir: "work/nope" } as RepoOSConfig;
    const { tasks, loadErrors } = loadCandidateTasksFromDisk(bad);
    expect(tasks).toEqual([]);
    expect(loadErrors.some((e) => /scan work directory/i.test(e))).toBe(true);
  });

  it("collects depends-on and dependent links for the prompt", () => {
    const { config, task } = setup();
    writeFileSync(
      join(root(config), "work", "0100-follow-up.md"),
      "---\nid: '0100'\ntitle: Follow-up\ndepends_on: ['0099']\n---\n\nFollow-up body.\n",
    );
    const parent = { ...task, dependsOn: ["0098"] } as Task;
    const other = {
      ...task,
      id: "0098",
      path: "work/0098-other.md",
      absPath: join(root(config), "work", "0098-other.md"),
      dependsOn: [],
    } as Task;
    writeFileSync(other.absPath, "---\nid: '0098'\ntitle: Other\n---\n\nOther body.\n");
    const facts = collectTaskSummaryFacts(config, parent, loadCandidateTasksFromDisk(config).tasks);
    const linked = [...facts.linked].sort((a, b) => a.id.localeCompare(b.id));
    expect(linked).toEqual([
      { id: "0098", title: "Other", status: "inbox", relation: "depends-on" },
      { id: "0100", title: "Follow-up", status: "inbox", relation: "dependent" },
    ]);
  });

  it("records session DB unavailability in loadErrors", () => {
    const { config, task } = setup();
    const spy = vi.spyOn(dbModule, "getRepoOSDb").mockReturnValue(null);
    try {
      const facts = collectTaskSummaryFacts(config, task, []);
      expect(facts.sessions).toEqual([]);
      expect(facts.loadErrors.some((e) => /Session database unavailable/i.test(e))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
