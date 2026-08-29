/**
 * #0121 — managed preview requests from sandboxed agents.
 *
 * A sandboxed agent (Codex-like: filesystem access to its worktree but NO
 * localhost networking) must be able to request its managed preview without
 * reaching the control plane. The runner turns the exact output signal
 * (`::repoos-preview-request::`) into a capability bound to the live run, and
 * the server starts + probes the preview from the privileged side.
 *
 * The unit suite covers the capability handshake: a valid intent, a forged run
 * id, a cross-task claim, a path-substituted worktree, an expired capability
 * superseded by a newer run, an interrupted turn, the structured codex JSON
 * variant, and failure reporting. The E2E suite runs a REAL main server with a
 * fake agent that has no network access and asserts the server-verified
 * preview lands in the transcript and is reaped when the task leaves `active`.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { AgentRunner, PREVIEW_REQUEST_SIGNAL, type AgentPreviewRequest } from "../../server/agents";
import { startServer, type ServerHandle } from "../../server/server";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../../core/types";

/** Plain-line text of an entry (legacy `{s,d}` or sys) — narrows the union. */
const dOf = (entry: AgentOutputEntry): string | undefined => (entry as { d?: string }).d;

const PREVIEW_FAKEBIN = `#!/usr/bin/env node
process.stdout.write("${PREVIEW_REQUEST_SIGNAL}\\n");
process.stdout.write("done\\n");
`;

const CODEX_PREVIEW_FAKEBIN = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Finished.\\n\\n${PREVIEW_REQUEST_SIGNAL}" } }) + "\\n");
`;

const FAIL_FAKEBIN = `#!/usr/bin/env node
process.stdout.write("${PREVIEW_REQUEST_SIGNAL}\\n");
process.exit(1);
`;

const PLAIN_FAKEBIN = `#!/usr/bin/env node
process.stdout.write("plain output\\n");
`;

interface Fixture {
  bin: string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-preview-req-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["opencode", "codex", "claude", "qwen", "copilot"]) {
    writeFileSync(join(bin, name), PREVIEW_FAKEBIN, { mode: 0o755 });
  }
  return {
    bin,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function withFakePath(fx: Fixture): string {
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  return oldPath;
}

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

const TASK: Task = {
  id: "0001",
  title: "Preview request",
  type: "feature",
  status: "active",
  priority: "p2",
  area: "server",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0001-preview.md",
  absPath: "/tmp/work/0001-preview.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
};

const agent = (cli: string): Agent => ({ name: "engineer", cli, model: "default", enabled: true });

async function waitForAsync(
  fn: () => Promise<boolean>,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe("runner preview request capability (#0121)", () => {
  it("fires one preview request bound to the live run after a clean turn", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      const cwd = realpathSync(fx.bin);
      runner.start(TASK, "feat/x", agent("opencode"), { cwd });
      await waitForAsync(
        () => Promise.resolve(requests.length === 1),
        "preview request after clean turn",
      );

      const request = requests[0];
      expect(request).toMatchObject({ taskId: "0001", branch: "feat/x", workdir: cwd });
      expect(request.runId).toBeTruthy();
      // The capability validates — a real runner-issued run.
      expect(runner.validatePreview(request)).toBe(true);

      // The transcript carries a trusted system note, never raw signal text.
      const lines = runner.output("0001")!.lines.map(dOf);
      expect(lines).toContain("✓ agent requested a managed preview");
      expect(lines).not.toContain(PREVIEW_REQUEST_SIGNAL);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects a forged run id", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitForAsync(() => Promise.resolve(requests.length === 1), "preview request");

      expect(runner.validatePreview({ ...requests[0], runId: "forged-run" })).toBe(false);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects a cross-task request", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitForAsync(() => Promise.resolve(requests.length === 1), "preview request");

      expect(runner.validatePreview({ ...requests[0], taskId: "9999" })).toBe(false);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects a path-substituted worktree", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      const cwd = join(fx.bin, "real");
      mkdirSync(cwd, { recursive: true });
      const other = join(fx.bin, "other");
      mkdirSync(other, { recursive: true });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd });
      await waitForAsync(() => Promise.resolve(requests.length === 1), "preview request");

      expect(runner.validatePreview({ ...requests[0], workdir: other })).toBe(false);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects an expired capability once a newer run supersedes it", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitForAsync(() => Promise.resolve(requests.length === 1), "first preview request");
      const first = requests[0];
      expect(runner.validatePreview(first)).toBe(true);

      // A follow-up turn on a PLAIN fakebin (no signal) supersedes the run.
      writeFileSync(join(fx.bin, "opencode"), PLAIN_FAKEBIN, { mode: 0o755 });
      runner.send("0001", "continue", agent("opencode"));
      await waitForAsync(() => Promise.resolve(!runner.isRunning("0001")), "second turn exit");

      expect(runner.validatePreview(first)).toBe(false);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("does not honor a preview request from an interrupted turn", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      writeFileSync(join(fx.bin, "opencode"), FAIL_FAKEBIN, { mode: 0o755 });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitForAsync(() => Promise.resolve(!runner.isRunning("0001")), "failed turn exit");

      expect(requests).toEqual([]);
      expect(runner.output("0001")!.lines.map(dOf)).toContain(
        "✗ managed preview was not started because the agent turn was interrupted",
      );
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("detects the signal inside a codex JSON agent_message", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      writeFileSync(join(fx.bin, "codex"), CODEX_PREVIEW_FAKEBIN, { mode: 0o755 });
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitForAsync(
        () => Promise.resolve(requests.length === 1),
        "codex JSON preview request",
      );

      expect(requests[0]).toMatchObject({ taskId: "0001", branch: "feat/x" });
      expect(runner.validatePreview(requests[0])).toBe(true);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("fires exactly once even when the signal is repeated in the same run", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      writeFileSync(
        join(fx.bin, "opencode"),
        `#!/usr/bin/env node
process.stdout.write("${PREVIEW_REQUEST_SIGNAL}\\n");
process.stdout.write("${PREVIEW_REQUEST_SIGNAL}\\n");
process.stdout.write("done\\n");
`,
        { mode: 0o755 },
      );
      const requests: AgentPreviewRequest[] = [];
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: (request) => {
          requests.push(request);
        },
      });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitForAsync(() => Promise.resolve(!runner.isRunning("0001")), "turn exit");

      // Repeated signals are idempotent: one request for the whole run.
      expect(requests).toHaveLength(1);
      expect(runner.validatePreview(requests[0])).toBe(true);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("reports an onPreviewRequest failure as a trusted transcript entry", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    try {
      const runner = new AgentRunner(config(fx.bin), () => {}, {
        onPreviewRequest: async () => {
          throw new Error("preview start exploded");
        },
      });
      runner.start(TASK, "feat/x", agent("opencode"), { cwd: fx.bin });
      await waitForAsync(
        () =>
          Promise.resolve(
            runner
              .output("0001")!
              .lines.map(dOf)
              .some((d) => (d ?? "").includes("✗ managed preview failed: preview start exploded")),
          ),
        "preview failure entry",
      );
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });
});

// ---- E2E: real server, fake agent with no localhost access ----

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

interface E2eFixture {
  root: string;
  bin: string;
  clean: () => void;
}

function makeE2eFixture(): E2eFixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-preview-req-e2e-"));
  const bin = join(root, "fakebin");
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode"), PREVIEW_FAKEBIN, { mode: 0o755 });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  const task = `---
id: "0001"
title: Preview request
type: feature
status: ready
priority: p1
area: server
assigned_to: ai
---
`;
  writeFileSync(join(root, "work", "0001-preview-request.md"), task);

  const wtRoot = join(root, "..", `${basename(root)}-worktrees`);
  return {
    root,
    bin,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      try {
        git(root, ["worktree", "prune"]);
      } catch {
        /* ignore */
      }
      rmSync(wtRoot, { recursive: true, force: true });
    },
  };
}

async function api(
  server: ServerHandle,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${server.url}${path}`, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function transcript(server: ServerHandle, id: string): Promise<string[]> {
  const res = await api(server, "GET", `/api/tasks/${id}/output`);
  const lines = (res.body.lines as { d?: string }[]) ?? [];
  return lines.map((l) => l.d ?? "");
}

describe("sandboxed preview request E2E (#0121)", () => {
  it("a fake agent with no localhost access requests and receives a server-verified preview", async () => {
    const fx = makeE2eFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    const mainPort = await reservePort();
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: mainPort });
    try {
      // Launch the fake agent through the real server. The agent never opens
      // a socket — it only emits the signal and exits.
      const startRes = await api(server, "POST", "/api/tasks/0001/start");
      expect(startRes.status).toBe(200);
      expect((startRes.body.spawn as { ok?: boolean } | undefined)?.ok).toBe(true);

      // Server-side: capability validated, preview started + probed, and the
      // trusted progress streamed into the transcript.
      await waitForAsync(
        () =>
          transcript(server, "0001").then((lines) =>
            lines.some((l) => l.includes("✓ Managed preview ready:")),
          ),
        "preview ready transcript entry",
      );
      await waitForAsync(
        () =>
          transcript(server, "0001").then((lines) =>
            lines.some((l) => l.includes("✓ Server-side preview probe passed")),
          ),
        "server-side probe transcript entry",
      );

      const lines = await transcript(server, "0001");
      expect(lines).toContain("✓ agent requested a managed preview");
      expect(lines.some((l) => l.includes("Server-owned preview requested"))).toBe(true);

      const readyLine = lines.find((l) => l.includes("✓ Managed preview ready:"))!;
      const url = readyLine.split("✓ Managed preview ready:")[1].trim();
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      // Exactly one request fired for the run (idempotent single-fire).
      expect(lines.filter((l) => l.includes("✓ Managed preview ready:")).length).toBe(1);

      // The preview actually serves the worktree.
      expect(await (await fetch(`${url}/api/health`)).json()).toMatchObject({ ok: true });

      // The task endpoint surfaces the live preview for the human.
      const task = await api(server, "GET", "/api/tasks/0001");
      expect((task.body.preview as { url?: string } | null)?.url).toBe(url);

      // Cleanup: leaving `active` reaps the preview and it becomes unreachable.
      // active -> ready now requires the Abandon action (#0296) rather than a
      // bare PATCH — the transition stops the agent, which a raw status write
      // never did (that gap was the point of gating it).
      const patch = await api(server, "POST", "/api/tasks/0001/abandon");
      expect(patch.status).toBe(200);
      await waitForAsync(async () => {
        try {
          await fetch(`${url}/api/health`);
          return false;
        } catch {
          return true;
        }
      }, "preview reaped after status change");
      const after = await api(server, "GET", "/api/tasks/0001");
      expect(after.body.preview).toBeNull();
    } finally {
      await server.close();
      process.env.PATH = oldPath;
      fx.clean();
    }
  }, 120_000);
});
