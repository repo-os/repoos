/**
 * Pressure guard delays engineer starts (#0836): spawnOrQueue must queue with
 * reason pressure instead of launching while load is over the threshold.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types.js";
import type { AgentEvent } from "../../server/agents.js";

const pressureReasonMock = vi.hoisted(() =>
  vi.fn<(config: RepoOSConfig) => string | null>(() => null),
);

vi.mock("../../core/pressure-guard.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/pressure-guard.js")>();
  return {
    ...actual,
    pressureReason: (config: RepoOSConfig) => pressureReasonMock(config),
  };
});

import { AgentRunner } from "../../server/agents.js";

const FAKEBIN = `#!/usr/bin/env node
process.stdout.write("fake output line\\n");
process.stdout.write('{"session_id":"sess-pressure"}\\n');
process.exit(0);
`;

const TASK: Task = {
  id: "0836",
  title: "Pressure guard",
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
  path: "work/0836-test.md",
  absPath: "/tmp/work/0836-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: true,
    worktreeExists: true,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
};

function agent(cli: string): Agent {
  return { name: "engineer", cli, model: "default", enabled: true };
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
    pressureGuard: { enabled: true, maxLoadPerCpu: 0.01 },
  };
}

describe("AgentRunner pressure guard (#0836)", () => {
  let root: string;
  let oldPath: string;
  const events: AgentEvent[] = [];

  afterEach(() => {
    pressureReasonMock.mockReset();
    pressureReasonMock.mockReturnValue(null);
    process.env.PATH = oldPath;
    events.length = 0;
    rmSync(root, { recursive: true, force: true });
  });

  it("queues a start with agent.queued reason pressure when load is high", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-pressure-agent-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "opencode"), FAKEBIN, { mode: 0o755 });
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;

    const detail = "system load is high (9.0× per CPU, limit 0.01×) — waiting for headroom";
    pressureReasonMock.mockReturnValue(detail);

    const runner = new AgentRunner(config(root), (e) => events.push(e));
    const cwd = join(root, "wt");
    mkdirSync(cwd, { recursive: true });
    const start = runner.start(TASK, "feat/x", agent("opencode"), { cwd });

    expect(start.ok).toBe(true);
    expect(start.queued).toBe(true);
    expect(runner.isRunning("0836")).toBe(false);
    expect(runner.isQueued("0836")).toBe(true);
    expect(runner.queued()).toEqual([
      expect.objectContaining({ id: "0836", reason: "pressure", detail }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.queued",
        id: "0836",
        reason: "pressure",
        detail,
      }),
    );
  });
});
