/**
 * #0995 E4 — read one numbered review pass from the API.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewPassPath } from "../../core/review-passes";
import type { RepoOSConfig } from "../../core/types";
import { startServer, type ServerHandle } from "../../server/server";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

async function withServer(root: string, fn: (s: ServerHandle) => Promise<void>): Promise<void> {
  const server = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

describe("GET /api/tasks/:id/review/passes/:pass (#0995 E4)", () => {
  it("returns the stored pass report and 404s when missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0995-review-pass-"));
    tmpRoots.push(root);
    const cfg = config(root);
    mkdirSync(join(root, ".repoos", "reviews", "0970"), { recursive: true });
    writeFileSync(
      reviewPassPath(cfg, "0970", 1),
      `---
at: 2026-10-28T12:00:00Z
state: failed
agent: cursor
cli: cursor
model: test
task: "0970"
---
First pass failure text.
`,
    );
    writeFileSync(
      reviewPassPath(cfg, "0970", 2),
      `---
at: 2026-10-29T12:00:00Z
state: ok
agent: cursor
cli: cursor
model: test
task: "0970"
---
## Verdict
good to go
`,
    );
    await withServer(root, async (server) => {
      const ok = await fetch(`${server.url}/api/tasks/0970/review/passes/1`);
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { review: { state: string; markdown: string } };
      expect(body.review.state).toBe("failed");
      expect(body.review.markdown).toContain("First pass failure text");

      const latest = await fetch(`${server.url}/api/tasks/0970/review/passes/2`);
      expect(latest.status).toBe(200);

      const missing = await fetch(`${server.url}/api/tasks/0970/review/passes/99`);
      expect(missing.status).toBe(404);
    });
  });
});
