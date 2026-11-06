// @vitest-environment node
/**
 * Generation, idempotency and failure checks for the post-merge summary (#1041).
 * The PM runner and the bookkeeping commit are injected — no real agent runs.
 */
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERATED_CHANGES_MARKER } from "../../core/task-summary.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import * as dbModule from "../../core/db.js";
import { SUMMARY_PENDING_STALE_MS } from "../../core/task-summary.js";
import {
  acquireSummaryCommitSlot,
  collectTaskSummaryFacts,
  getTaskSummaryJobPayload,
  loadCandidateTasksFromDisk,
  loadTaskSummaryMarkdown,
  queueTaskSummary,
  readSummaryStatus,
  readTaskFromDisk,
  runTaskSummaryNow,
  summaryReleaseGate,
} from "../../server/task-summary.js";

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
  it("lists Changed files unavailable when git diff fails", async () => {
    const { config, task } = setup();
    writeFileSync(
      task.absPath,
      "---\nid: '0099'\ntitle: T\nstatus: done\nmerged_commit: abcdef1\n---\n\nBody.\n",
    );
    const runGitMock = vi.fn(async (_root: string, args: string[]) => {
      if (args.includes("--numstat"))
        return { status: 1, stdout: "", stderr: "bad object abcdef1^", timedOut: false };
      return { status: 0, stdout: "", stderr: "", timedOut: false };
    });
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => true,
      runGit: runGitMock as never,
    });
    expect(res).toEqual({ ok: true });
    const stored = loadTaskSummaryMarkdown(config, "0099") ?? "";
    expect(stored).toContain("Changed files unavailable: numstat: bad object abcdef1^");
  });

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
    const injected = [
      "## TL;DR",
      "",
      "Short.",
      "",
      GENERATED_CHANGES_MARKER,
      "",
      "Tail after marker.",
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
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: injected })) as never,
      commit: () => true,
    });
    expect(res.ok).toBe(true);
    const stored = loadTaskSummaryMarkdown(config, "0099") ?? "";
    expect(stored).toContain("Tail after marker.");
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

  it("does not unlink a pre-existing summary when the prior file was unreadable", async () => {
    const { config, task } = setup();
    const summaryPath = join(root(config), "work", "reports", "0099", "summary.md");
    writeFileSync(summaryPath, "KEEP_ME\n");
    let reads = 0;
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => false,
      summaryReadFileSync: ((p: string, enc: BufferEncoding) => {
        if (p === summaryPath) {
          reads += 1;
          if (reads === 1) throw new Error("EPERM");
        }
        return readFileSync(p, enc);
      }) as typeof readFileSync,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/Existing summary\.md is unreadable/);
    expect(readFileSync(summaryPath, "utf8")).toBe("KEEP_ME\n");
  });

  it("surfaces restore failures when commit returns false", async () => {
    const { config, task } = setup();
    const summaryPath = join(root(config), "work", "reports", "0099", "summary.md");
    writeFileSync(summaryPath, "ORIGINAL_MARK\n");
    let writesToSummary = 0;
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => false,
      summaryWriteFileSync: ((p: string, content: string) => {
        if (p === summaryPath) {
          writesToSummary += 1;
          // 1st write: PM output; 2nd: restore of backup after failed commit.
          if (writesToSummary >= 2) throw new Error("restore failed");
        }
        writeFileSync(p, content);
      }) as typeof writeFileSync,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/restore error: restore failed/);
    // New summary was written before commit failed; restore threw — file stays as written output.
    expect(readFileSync(summaryPath, "utf8")).toContain("## TL;DR");
    expect(readFileSync(summaryPath, "utf8")).not.toContain("ORIGINAL_MARK");
  });

  it("surfaces unlink failures on commit failure when there was no prior file", async () => {
    const { config, task } = setup();
    const summaryPath = join(root(config), "work", "reports", "0099", "summary.md");
    if (existsSync(summaryPath)) rmSync(summaryPath);
    const res = await runTaskSummaryNow(config, task, [], {
      resolvePm: () => ({ name: "pm" }) as never,
      runPrompt: (async () => ({ ok: true, output: VALID })) as never,
      commit: () => false,
      summaryUnlinkSync: ((p: string) => {
        throw new Error("unlink blocked");
      }) as typeof unlinkSync,
    });
    expect(res.ok).toBe(false);
    expect(res.error ?? "").toMatch(/unlink blocked/);
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

describe("getTaskSummaryJobPayload (stale pending recovery)", () => {
  it("returns done when the report exists but status stayed pending past the window", () => {
    const { config, task } = setup();
    writeFileSync(join(root(config), "work", "reports", "0099", "summary.md"), "## TL;DR\n");
    mkdirSync(join(root(config), ".repoos", "task-summary"), { recursive: true });
    const staleAt = new Date(Date.now() - SUMMARY_PENDING_STALE_MS - 60_000).toISOString();
    writeFileSync(
      join(root(config), ".repoos", "task-summary", "0099.json"),
      JSON.stringify({ taskId: "0099", status: "pending", at: staleAt }),
    );
    const payload = getTaskSummaryJobPayload(config, task.id);
    expect(payload.markdown).toContain("## TL;DR");
    expect(payload.status).toBe("done");
  });

  it("does not accept a new pending run as done while summary.md still predates that run (stale retry)", () => {
    const { config, task } = setup();
    const summaryPath = join(root(config), "work", "reports", "0099", "summary.md");
    writeFileSync(summaryPath, "## TL;DR\n\nold run\n");
    const retryStart = Date.now() - 120_000;
    utimesSync(summaryPath, new Date(retryStart - 3_600_000), new Date(retryStart - 3_600_000));
    mkdirSync(join(root(config), ".repoos", "task-summary"), { recursive: true });
    const staleAt = new Date(Date.now() - SUMMARY_PENDING_STALE_MS - 60_000).toISOString();
    const pendingSince = new Date(retryStart).toISOString();
    writeFileSync(
      join(root(config), ".repoos", "task-summary", "0099.json"),
      JSON.stringify({ taskId: "0099", status: "pending", at: staleAt, pendingSince }),
    );
    const payload = getTaskSummaryJobPayload(config, task.id);
    expect(payload.markdown).toContain("## TL;DR");
    expect(payload.status).toBe("failed");
    expect(payload.error ?? "").toMatch(/older than this run|retry timed out/i);
  });
});

describe("readSummaryStatus (I/O and schema)", () => {
  it("returns failed with a visible error when the status file is unreadable", () => {
    const { config } = setup();
    const path = join(root(config), ".repoos", "task-summary", "0099.json");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, '{"taskId":"0099","status":"pending","at":"2026-01-01T00:00:00.000Z"}\n');
    chmodSync(path, 0);
    try {
      const s = readSummaryStatus(config, "0099");
      expect(s.status).toBe("failed");
      expect(s.error ?? "").toMatch(/Could not read summary job status file/);
    } finally {
      chmodSync(path, 0o644);
    }
  });

  it("returns failed when the status JSON is corrupted", () => {
    const { config } = setup();
    const path = join(root(config), ".repoos", "task-summary", "0099.json");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "NOT JSON\n");
    const s = readSummaryStatus(config, "0099");
    expect(s.status).toBe("failed");
    expect(s.error ?? "").toMatch(/corrupted|invalid JSON/i);
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
    const ids = loadCandidateTasksFromDisk(config)
      .tasks.map((task: Task) => task.id)
      .sort();
    expect(ids).toEqual(["0099", "0100"]);
  });

  it("surfaces a work-dir scan failure instead of an empty candidate list", () => {
    const { config } = setup();
    const bad = { ...config, workDir: "work/nope" } as RepoOSConfig;
    const { tasks, loadErrors } = loadCandidateTasksFromDisk(bad);
    expect(tasks).toEqual([]);
    expect(loadErrors.some((e: string) => /scan work directory/i.test(e))).toBe(true);
  });

  it("records per-file read and parse failures when listing candidates from disk", () => {
    const { config } = setup();
    writeFileSync(join(root(config), "work", "0102-bad-read.md"), "x");
    chmodSync(join(root(config), "work", "0102-bad-read.md"), 0);
    writeFileSync(join(root(config), "work", "0103-bad-parse.md"), "not valid frontmatter at all\n");
    try {
      const { tasks, loadErrors } = loadCandidateTasksFromDisk(config);
      expect(tasks.map((t: Task) => t.id).sort()).toEqual(["0099"]);
      expect(
        loadErrors.some(
          (e: string) => /0102-bad-read\.md/.test(e) && /read|Could not read/i.test(e),
        ),
      ).toBe(true);
      expect(
        loadErrors.some(
          (e: string) =>
            /0103-bad-parse\.md/.test(e) && /frontmatter|YAML|parse/i.test(e),
        ),
      ).toBe(true);
    } finally {
      chmodSync(join(root(config), "work", "0102-bad-read.md"), 0o644);
      rmSync(join(root(config), "work", "0102-bad-read.md"));
      rmSync(join(root(config), "work", "0103-bad-parse.md"));
    }
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
      {
        id: "0098",
        title: "Other",
        status: "inbox",
        relation: "depends-on",
        createdAt: null,
        bodyExcerpt: "Other body.",
      },
      {
        id: "0100",
        title: "Follow-up",
        status: "inbox",
        relation: "dependent",
        createdAt: null,
        bodyExcerpt: "Follow-up body.",
      },
    ]);
  });

  it("merges queue-time disk load errors with empty index (no second scan)", () => {
    const { config, task } = setup();
    const facts = collectTaskSummaryFacts(config, task, [], {
      tasks: [],
      loadErrors: ["disk scan note"],
    });
    expect(facts.loadErrors).toContain("disk scan note");
  });

  it("records session DB unavailability in loadErrors", () => {
    const { config, task } = setup();
    const spy = vi.spyOn(dbModule, "getRepoOSDb").mockReturnValue(null);
    try {
      const facts = collectTaskSummaryFacts(config, task, []);
      expect(facts.sessions).toEqual([]);
      expect(facts.loadErrors.some((e: string) => /Session database unavailable/i.test(e))).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
