/**
 * Fixture E2E for the qwen code / codex drivers (0043 P2). Fake `qwen` and
 * `codex` binaries on a fixture PATH record their argv + cwd to a log file, so
 * we can assert spawn args, streaming, session-id capture, and resume args —
 * without touching a real coding agent.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../../core/types";

/** Plain-line text of an entry (legacy `{s,d}` or sys) — narrows the union. */
const dOf = (entry: AgentOutputEntry): string | undefined =>
  (entry as { d?: string }).d;

const FAKEBIN = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + "\\n");
process.stdout.write("fake output line\\n");
if (process.env.REPOOS_FAKEBIN_EMIT_SESSION !== "0") process.stdout.write('{"session_id":"sess-123"}\\n');
process.stdout.write("done\\n");
`;

interface SpawnRecord {
  args: string[];
  cwd: string;
}

interface Fixture {
  bin: string;
  log: string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-drivers-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  for (const name of ["qwen", "codex", "claude"]) {
    writeFileSync(join(bin, name), FAKEBIN, { mode: 0o755 });
  }
  return {
    bin,
    log: join(root, "spawns.log"),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Prepend the fixture bin dir to PATH so fakebins win but `env node` works. */
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
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: false,
  created_at: null,
  updated_at: null,
  path: "work/0001-test.md",
  absPath: "/tmp/work/0001-test.md",
  body: "",
  extra: {},
  git: { branchExists: false, lastCommit: null, lastCommitAt: null },
};

const agent = (cli: string): Agent => ({ name: "engineer", cli, model: "big pickle", enabled: true });

async function waitFor(fn: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function spawns(fx: Fixture): SpawnRecord[] {
  const text = readFileSync(fx.log, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((l) => JSON.parse(l) as SpawnRecord);
}

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_EMIT_SESSION;
});

describe("qwen code driver", () => {
  it("spawns headless args, streams output, and resumes by session id", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "qwen");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/x", agent("qwen code"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => runner.output("0001")?.lines.length === 3, "qwen first-turn output");
      const lines = runner.output("0001")!.lines;
      expect(lines.map(dOf)).toContain("fake output line");
      expect(lines.map(dOf)).toContain('{"session_id":"sess-123"}');
      expect(runner.output("0001")!.sessionId).toBe("sess-123");

      const [run] = spawns(fx);
      expect(run.args[0]).toBe("-p");
      expect(run.args[1]).toContain("Task #0001");
      expect(run.args).toEqual(
        expect.arrayContaining(["--output-format", "stream-json"]),
      );

      await waitFor(() => !runner.isRunning("0001"), "first turn exit");
      const resumed = runner.send("0001", "continue the work", agent("qwen code"));
      expect(resumed.ok).toBe(true);
      await waitFor(() => spawns(fx).length === 2, "qwen resume spawn");
      await waitFor(() => !runner.isRunning("0001"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "--resume",
        "sess-123",
        "-p",
        "continue the work",
        "--output-format",
        "stream-json",
      ]);
      expect(resume.cwd).toBe(realpathSync(cwd));
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("degrades to --continue when no session id is known", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_EMIT_SESSION = "0";
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("qwen code"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "qwen no-id turn exit");

      runner.send("0001", "keep going", agent("qwen code"));
      await waitFor(() => spawns(fx).length === 2, "qwen continue spawn");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "--continue",
        "-p",
        "keep going",
        "--output-format",
        "stream-json",
      ]);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("codex driver", () => {
  it("spawns exec args, streams output, and resumes by session id", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "codex");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/x", agent("codex"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => runner.output("0001")?.lines.length === 3, "codex first-turn output");
      expect(runner.output("0001")!.lines.map(dOf)).toContain("fake output line");
      expect(runner.output("0001")!.sessionId).toBe("sess-123");

      const [run] = spawns(fx);
      expect(run.args[0]).toBe("exec");
      expect(run.args[1]).toContain("Task #0001");
      expect(run.args).toEqual(
        expect.arrayContaining(["--json", "--sandbox", "workspace-write"]),
      );

      await waitFor(() => !runner.isRunning("0001"), "first turn exit");
      runner.send("0001", "continue the work", agent("codex"));
      await waitFor(() => spawns(fx).length === 2, "codex resume spawn");
      await waitFor(() => !runner.isRunning("0001"), "resume turn exit");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "exec",
        "resume",
        "sess-123",
        "continue the work",
        "--json",
        "--sandbox",
        "workspace-write",
      ]);
      expect(resume.cwd).toBe(realpathSync(cwd));
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("degrades to resume --last when no session id is known", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    process.env.REPOOS_FAKEBIN_EMIT_SESSION = "0";
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("codex"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "codex no-id turn exit");

      runner.send("0001", "keep going", agent("codex"));
      await waitFor(() => spawns(fx).length === 2, "codex resume --last spawn");

      const [, resume] = spawns(fx);
      expect(resume.args).toEqual([
        "exec",
        "resume",
        "--last",
        "keep going",
        "--json",
        "--sandbox",
        "workspace-write",
      ]);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("claude code driver", () => {
  /**
   * The permission flag is load-bearing: agents are spawned with stdin ignored,
   * so an approval prompt can never reach a human. Without it claude denies
   * every write and build command, does nothing, and leaves the task wedged in
   * `active` — the exact failure this asserts against.
   */
  it("passes --dangerously-skip-permissions on both first turn and resume", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      const cwd = join(fx.bin, "wt", "claude");
      mkdirSync(cwd, { recursive: true });
      const start = runner.start(TASK, "feat/x", agent("claude code"), { cwd });
      expect(start.ok).toBe(true);

      await waitFor(() => runner.output("0001")?.lines.length === 3, "claude first-turn output");
      const [run] = spawns(fx);
      expect(run.args[0]).toBe("-p");
      expect(run.args[1]).toContain("Task #0001");
      expect(run.args).toContain("--dangerously-skip-permissions");

      await waitFor(() => !runner.isRunning("0001"), "first turn exit");
      runner.send("0001", "keep going", agent("claude code"));
      await waitFor(() => spawns(fx).length === 2, "claude resume spawn");

      const [, resume] = spawns(fx);
      expect(resume.args).toContain("keep going");
      expect(resume.args).toContain("--dangerously-skip-permissions");
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});

describe("fail-safe mission checklist (0067)", () => {
  /**
   * The launch mission must be a literal, verifiable checklist so an agent
   * cannot silently drop the both-copies status sync (the #0063 failure) or
   * leave the task `active` without signalling that it is waiting on the
   * human. These assertions keep the two load-bearing instructions in the
   * mission text so future rewrites can't silently remove them.
   */
  it("asserts the read-back verification and needs-input instructions", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    try {
      const runner = new AgentRunner(config(fx.bin), () => {});
      runner.start(TASK, "feat/x", agent("claude code"), { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0001"), "mission fixture turn exit");

      const [run] = spawns(fx);
      const mission = run.args[1];
      expect(mission).toContain("Task #0001");
      // both-copies status sync + read-back verification (anti-#0063)
      expect(mission).toContain("main-checkout copy");
      expect(mission).toContain("confirm it shows `status: review`");
      // needs-input instruction: flag both copies, keep the task active, stop
      expect(mission).toContain("needs_input: true");
      expect(mission).toContain("WITHOUT committing");
      expect(mission).toMatch(/Never silently leave the task `active` without the `needs_input` flag/);
    } finally {
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });
});
