/**
 * Generation, idempotency and failure checks for the post-merge summary (#1041).
 * The PM runner and the bookkeeping commit are injected — no real agent runs.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepoOSConfig, Task } from "../../core/types.js";
import {
  collectTaskSummaryFacts,
  loadCandidateTasksFromDisk,
  loadTaskSummaryMarkdown,
  readSummaryStatus,
  readTaskFromDisk,
  runTaskSummaryNow,
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
  writeFileSync(task.absPath, "---\nid: '0099'\n---\n\nBody.\n");
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
      .map((task) => task.id)
      .sort();
    expect(ids).toEqual(["0099", "0100"]);
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
    const facts = collectTaskSummaryFacts(config, parent, loadCandidateTasksFromDisk(config));
    const linked = [...facts.linked].sort((a, b) => a.id.localeCompare(b.id));
    expect(linked).toEqual([
      { id: "0098", title: "Other", status: "inbox", relation: "depends-on" },
      { id: "0100", title: "Follow-up", status: "inbox", relation: "dependent" },
    ]);
  });
});
