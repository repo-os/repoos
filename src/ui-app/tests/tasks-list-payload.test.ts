import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getTaskContext, getTasks } from "../../server/routes/tasks.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { Task } from "../../core/types.js";
import { emptyGitInfo } from "../../core/git.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function task(id: string, body: string): Task {
  return {
    id,
    title: `Task ${id}`,
    status: "ready",
    priority: "p2",
    type: "bug",
    body,
    path: `work/${id}.md`,
    absPath: `/tmp/${id}.md`,
    dependsOn: [],
    git: emptyGitInfo(),
  } as unknown as Task;
}

function capture() {
  let payload = "";
  const res = {
    writeHead() {},
    write(chunk: string) {
      payload += chunk;
      return true;
    },
    end(body?: string) {
      payload += body ?? "";
    },
  } as unknown as ServerResponse;
  return { res, text: () => payload };
}

describe("GET /api/tasks default payload", () => {
  it("stays the same size when task bodies grow", async () => {
    const small = "x";
    const large = "y".repeat(200_000);
    const run = async (body: string) => {
      const cap = capture();
      const ctx = {
        index: {
          getTasks: () =>
            Array.from({ length: 900 }, (_, i) => task(String(i + 1).padStart(4, "0"), body)),
        },
        reviews: { isRunning: () => false, enabled: () => false },
        runner: { hasPendingHandoff: () => false },
        config: { root: "/tmp" },
      } as unknown as RouteContext;
      const req = { url: "/api/tasks" } as IncomingMessage;
      await getTasks(ctx, req, cap.res, {});
      return cap.text();
    };
    const a = await run(small);
    const b = await run(large);
    expect(a).not.toContain(large.slice(0, 40));
    expect(b.length).toBe(a.length);
    expect(JSON.parse(a).tasks).toHaveLength(100);
    expect(JSON.parse(a).tasks[0]).toEqual({
      id: "0001",
      title: "Task 0001",
      status: "ready",
      priority: "p2",
    });
    expect(JSON.parse(a).nextCursor).toBe("0100");
  });

  it("streams the full response as a JSON array in bounded chunks", async () => {
    const tasks = Array.from({ length: 51 }, (_, index) =>
      task(String(index + 1).padStart(4, "0"), `body-${index}`),
    );
    const cap = capture();
    const ctx = {
      index: { getTasks: () => tasks },
      reviews: { isRunning: () => false, enabled: () => false },
      runner: { hasPendingHandoff: () => false },
      config: { root: "/tmp" },
    } as unknown as RouteContext;
    await getTasks(ctx, { url: "/api/tasks?full=1" } as IncomingMessage, cap.res, {});
    const payload = JSON.parse(cap.text()) as Task[];
    expect(payload).toHaveLength(51);
    expect(payload[0]?.body).toBe("body-0");
    expect(payload.at(-1)?.id).toBe("0051");
  });

  it("includes the latest stored review verdict in task context", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-task-context-"));
    try {
      mkdirSync(join(root, ".repoos", "reviews", "0001"), { recursive: true });
      writeFileSync(
        join(root, ".repoos", "reviews", "0001", "2.md"),
        `---\nat: "2026-10-26T00:00:00Z"\nstate: ok\n---\n## Verdict\nGood to go — the branch matches the spec.\n\n## Bugs\nNone.\n`,
      );
      const current = task("0001", "body");
      const cap = capture();
      const ctx = {
        config: { root, cacheDir: ".repoos", preview: { targets: [] } },
        index: { getTask: () => current, getTasks: () => [current] },
        reviews: { isRunning: () => false, enabled: () => true },
      } as unknown as RouteContext;
      await getTaskContext(ctx, { url: "/api/tasks/0001/context" } as IncomingMessage, cap.res, {
        param1: "0001",
      });
      expect(JSON.parse(cap.text())).toMatchObject({
        latestReviewVerdict: "good to go",
        latestReviewVerdictText: "Good to go — the branch matches the spec.",
        dependencies: [],
        dependents: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
