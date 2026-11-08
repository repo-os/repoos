import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { buildIndex, buildIndexAsync } from "../../core/indexer.js";
import { LiveIndex } from "../../server/live-index.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-indexer-skips-"));
  roots.push(root);
  mkdirSync(join(root, "work"), { recursive: true });
  return root;
}

function writeTaskFile(root: string, relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe("indexer skipped task files", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("ignores report files under work/reports/<id>/", () => {
    const root = makeRoot();
    writeTaskFile(root, "work/0001-task.md", '---\nid: "0001"\ntitle: Task\nstatus: active\n---\n');
    writeTaskFile(root, "work/reports/1014/review-1.md", "## Review\n\nLooks good.\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const index = buildIndex(loadConfig(root), { skipGit: true });

    expect(index.tasks.map((t) => t.id)).toEqual(["0001"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("still warns for a hand-written work/*.md with no id", () => {
    const root = makeRoot();
    writeTaskFile(root, "work/reports/1014/review-1.md", "## Review\n");
    writeTaskFile(root, "work/hand-written.md", "---\ntitle: No id\n---\nBody\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const index = buildIndex(loadConfig(root), { skipGit: true });

    expect(index.tasks).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("skipped 1 task file(s)");
  });

  it("applies the same report-directory skip to the async builder", async () => {
    const root = makeRoot();
    writeTaskFile(root, "work/0001-task.md", '---\nid: "0001"\ntitle: Task\nstatus: active\n---\n');
    writeTaskFile(root, "work/reports/1014/review-1.md", "## Review\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const index = await buildIndexAsync(loadConfig(root));

    expect(index.tasks.map((t) => t.id)).toEqual(["0001"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not live-index reports or emit task events, and drops stale report entries on reload", () => {
    const root = makeRoot();
    const config = loadConfig(root);
    config.workDir = "repoos/work";
    mkdirSync(join(root, config.workDir), { recursive: true });
    const reportPath = "repoos/work/reports/0006/review-1.md";
    writeTaskFile(root, reportPath, '---\ntask: "0006"\n---\nReview body\n');
    writeTaskFile(
      root,
      "repoos/work/0001-task.md",
      '---\nid: "0001"\ntitle: Real task\nstatus: active\n---\nTask body\n',
    );

    const index = new LiveIndex(config);
    index.refreshAll();
    const events: unknown[] = [];
    index.on((event) => events.push(event));
    index.applyFileChange(join(root, reportPath));
    expect(index.getTask("review-1")).toBeNull();
    expect(index.getTask("0001")?.title).toBe("Real task");
    expect(events).toEqual([]);

    // Simulate a stale cache from an older live-index version: rebuild must
    // replace it with the same filtered view used at startup.
    const realTask = index.getTask("0001")!;
    const stale = { ...realTask, id: "review-1", absPath: join(root, reportPath) };
    const internals = index as unknown as {
      byId: Map<string, typeof stale>;
      pathToId: Map<string, string>;
    };
    internals.byId.set(stale.id, stale);
    internals.pathToId.set(stale.absPath, stale.id);
    index.applyFileChange(join(root, reportPath));
    expect(index.getTask("review-1")).toBeNull();
    index.refreshAll();
    expect(index.getTask("review-1")).toBeNull();
    expect(index.getTask("0001")?.title).toBe("Real task");
  });
});
