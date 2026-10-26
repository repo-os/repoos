import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getTasks } from "../../server/routes/tasks.js";
import type { RouteContext } from "../../server/routes/types.js";
import type { Task } from "../../core/types.js";
import { emptyGitInfo } from "../../core/git.js";

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
    end(body?: string) {
      payload = body ?? "";
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
        index: { getTasks: () => [task("0001", body), task("0002", body)] },
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
    expect(JSON.parse(a).tasks).toEqual([
      { id: "0001", title: "Task 0001", status: "ready", priority: "p2" },
      { id: "0002", title: "Task 0002", status: "ready", priority: "p2" },
    ]);
  });
});
