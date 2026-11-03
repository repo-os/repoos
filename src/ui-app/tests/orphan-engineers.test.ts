import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import {
  collectRecordedEngineerPids,
  isManagedHarnessCommand,
  pidAlive,
} from "../../server/orphan-engineers.js";
import * as orphanEngineers from "../../server/orphan-engineers.js";

describe("orphan engineer identification (#0837)", () => {
  it("recognizes managed harness commands and rejects unrelated binaries", () => {
    expect(isManagedHarnessCommand("/usr/local/bin/cursor-agent --print foo")).toBe(true);
    expect(isManagedHarnessCommand("opencode run hello")).toBe(true);
    expect(isManagedHarnessCommand("node /path/to/vitest run")).toBe(false);
    expect(isManagedHarnessCommand("repoos serve --port 7171")).toBe(false);
  });

  it("collects only active engineer registry rows and ignores review turns", () => {
    const active = new Set(["0001"]);
    const entries = collectRecordedEngineerPids(
      [
        {
          taskId: "0001",
          pid: process.pid,
          workdir: "/wt/0001",
          branch: "feat/a",
          runId: "r1",
          kind: "engineer",
        },
        {
          taskId: "0002",
          pid: process.pid,
          workdir: "/wt/review",
          branch: "feat/b",
          runId: "r2",
          kind: "review",
        },
      ],
      [],
      active,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].taskId).toBe("0001");
  });

  it("stops and records activity when verification fails but the recorded group is live", async () => {
    const { AgentRunner } = await import("../../server/agents.js");
    const root = mkdtempSync(join(tmpdir(), "repoos-orphan-verify-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(
        join(root, "work", "0001-orphan.md"),
        `---
id: "0001"
title: Orphan verify
type: bug
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/orphan
---
## Test
`,
      );
      writeFileSync(
        join(fullCacheDir, "repoos-ownership.json"),
        JSON.stringify([
          {
            pid: process.pid,
            taskId: "0001",
            startedAt: new Date().toISOString(),
            executable: "",
            workdir: root,
          },
        ]),
      );
      const notes: string[] = [];
      const runner = new AgentRunner(
        {
          root,
          workDir: "work",
          docsDir: "docs",
          skillsDir: "skills",
          taskExtensions: [".md"],
          defaultStatus: "inbox" as const,
          defaultAssignee: "unassigned" as const,
          cacheDir,
          pressureGuard: { enabled: false },
        } as any,
        () => {},
        {
          onOrphanEngineerNote: (_id, note) => notes.push(note),
        },
      );
      const verifySpy = vi
        .spyOn(orphanEngineers, "verifyRecordedHarnessPid")
        .mockResolvedValue(false);
      const stopSpy = vi
        .spyOn(orphanEngineers, "stopRecordedEngineerPid")
        .mockImplementation(() => {});
      await runner.reconcileOrphanedEngineers([
        {
          id: "0001",
          title: "Orphan verify",
          status: "active",
          absPath: join(root, "work", "0001-orphan.md"),
          branch: "feat/orphan",
          body: "",
          type: "bug",
          priority: "p2",
          area: "server",
          assignedTo: "ai",
        } as any,
      ]);
      expect(runner.isRunning("0001")).toBe(false);
      expect(stopSpy).toHaveBeenCalledWith(process.pid, process.pid);
      expect(notes).toEqual([`stopped orphaned engineer pid ${process.pid}`]);
      verifySpy.mockRestore();
      stopSpy.mockRestore();
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("AgentRunner orphan reconcile (#0837)", () => {
  it("records adopted note when adoptRunningAgents re-attaches a verified engineer", async () => {
    const { AgentRunner } = await import("../../server/agents.js");
    const root = mkdtempSync(join(tmpdir(), "repoos-orphan-adopt-note-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      writeFileSync(
        join(fullCacheDir, "agents.json"),
        JSON.stringify({
          entries: [
            {
              taskId: "0001",
              pid: process.pid,
              workdir: root,
              branch: "feat/reload-adopt",
              runId: "run-reload",
              kind: "engineer",
            },
          ],
        }),
      );
      const notes: string[] = [];
      const runner = new AgentRunner(
        {
          root,
          workDir: "work",
          docsDir: "docs",
          skillsDir: "skills",
          taskExtensions: [".md"],
          defaultStatus: "inbox" as const,
          defaultAssignee: "unassigned" as const,
          cacheDir,
          pressureGuard: { enabled: false },
        } as any,
        () => {},
        { onOrphanEngineerNote: (_id, note) => notes.push(note) },
      );
      vi.spyOn(orphanEngineers, "verifyRecordedHarnessPid").mockResolvedValue(true);
      await runner.adoptRunningAgents();
      expect(runner.isRunning("0001")).toBe(true);
      expect(notes).toEqual([`adopted orphaned engineer pid ${process.pid}`]);
      vi.restoreAllMocks();
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not start a replacement while a recorded engineer PID is still alive", async () => {
    const { AgentRunner, resolveAgentForTask } = await import("../../server/agents.js");
    const root = mkdtempSync(join(tmpdir(), "repoos-orphan-no-dup-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      const taskFile = join(root, "work", "0001-dup.md");
      writeFileSync(
        taskFile,
        `---
id: "0001"
title: Dup guard
type: bug
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/dup
cli_override: opencode
---
## Test
`,
      );
      writeFileSync(
        join(fullCacheDir, "agents.json"),
        JSON.stringify({
          entries: [
            {
              taskId: "0001",
              pid: process.pid,
              workdir: root,
              branch: "feat/dup",
              runId: "run-1",
              kind: "engineer",
            },
          ],
        }),
      );
      const config = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox" as const,
        defaultAssignee: "unassigned" as const,
        cacheDir,
        pressureGuard: { enabled: false },
        agents: [{ name: "engineer", cli: "opencode", model: "default", enabled: true }],
      };
      const runner = new AgentRunner(config as any, () => {});
      vi.spyOn(orphanEngineers, "verifyRecordedHarnessPid").mockResolvedValue(true);
      await runner.adoptRunningAgents();
      expect(runner.isRunning("0001")).toBe(true);
      expect(pidAlive(process.pid)).toBe(true);

      const task = {
        id: "0001",
        title: "Dup guard",
        status: "active" as const,
        absPath: taskFile,
        branch: "feat/dup",
        body: "",
        type: "bug" as const,
        priority: "p2" as const,
        area: "server",
        assignedTo: "ai" as const,
      };
      const agent = resolveAgentForTask(config as any, task as any);
      const second = runner.start(task as any, "feat/dup", agent!, { cwd: root });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toMatch(/already running/i);
      vi.restoreAllMocks();
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records adopted orphaned engineer pid on reconcile when verification passes", async () => {
    const { AgentRunner } = await import("../../server/agents.js");
    const root = mkdtempSync(join(tmpdir(), "repoos-orphan-note-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(
        join(root, "work", "0001-note.md"),
        `---
id: "0001"
title: Note
type: bug
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/note
---
## Test
`,
      );
      writeFileSync(
        join(fullCacheDir, "repoos-ownership.json"),
        JSON.stringify([
          {
            pid: process.pid,
            taskId: "0001",
            startedAt: new Date().toISOString(),
            executable: "",
            workdir: root,
          },
        ]),
      );
      const notes: string[] = [];
      const runner = new AgentRunner(
        {
          root,
          workDir: "work",
          docsDir: "docs",
          skillsDir: "skills",
          taskExtensions: [".md"],
          defaultStatus: "inbox" as const,
          defaultAssignee: "unassigned" as const,
          cacheDir,
          pressureGuard: { enabled: false },
        } as any,
        () => {},
        { onOrphanEngineerNote: (_id, note) => notes.push(note) },
      );
      vi.spyOn(orphanEngineers, "verifyRecordedHarnessPid").mockResolvedValue(true);
      await runner.reconcileOrphanedEngineers([
        {
          id: "0001",
          title: "Note",
          status: "active",
          absPath: join(root, "work", "0001-note.md"),
          branch: "feat/note",
          body: "",
          type: "bug",
          priority: "p2",
          area: "server",
          assignedTo: "ai",
        } as any,
      ]);
      expect(runner.isRunning("0001")).toBe(true);
      expect(notes.some((n) => n === `adopted orphaned engineer pid ${process.pid}`)).toBe(true);
      vi.restoreAllMocks();
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finalizes an adopted turn whose process ended as a clean exit, not a crash (#1015)", async () => {
    const { AgentRunner } = await import("../../server/agents.js");
    const root = mkdtempSync(join(tmpdir(), "repoos-orphan-clean-exit-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      const taskFile = join(root, "work", "0001-clean.md");
      writeFileSync(
        taskFile,
        `---
id: "0001"
title: Adopted clean exit
type: bug
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/clean
---
## Test
`,
      );
      writeFileSync(
        join(fullCacheDir, "agents.json"),
        JSON.stringify({
          entries: [
            {
              taskId: "0001",
              pid: process.pid,
              workdir: root,
              branch: "feat/clean",
              runId: "run-clean",
              kind: "engineer",
            },
          ],
        }),
      );
      const readTask = () =>
        parseTask({
          content: readFileSync(taskFile, "utf8"),
          absPath: taskFile,
          root,
          defaultStatus: "inbox",
          defaultAssignee: "unassigned",
        });
      const runner = new AgentRunner(
        {
          root,
          workDir: "work",
          docsDir: "docs",
          skillsDir: "skills",
          taskExtensions: [".md"],
          defaultStatus: "inbox" as const,
          defaultAssignee: "unassigned" as const,
          cacheDir,
          pressureGuard: { enabled: false },
        } as any,
        () => {},
        { getTask: () => readTask() },
      );
      vi.spyOn(orphanEngineers, "verifyRecordedHarnessPid").mockResolvedValue(true);
      await runner.adoptRunningAgents();
      expect(runner.isRunning("0001")).toBe(true);

      // The adopted harness ends sometime after the reload. There is no
      // ChildProcess handle, so the only observer is reconcileDeadAgents().
      const entry = runner["entries"].get("0001") as
        | { adoptedPid?: number; processGroupLeader?: number }
        | undefined;
      expect(entry).toBeDefined();
      entry!.adoptedPid = 999_999_999;
      entry!.processGroupLeader = 999_999_999;

      runner.reconcileDeadAgents();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(runner.isRunning("0001")).toBe(false);
      const body = readFileSync(taskFile, "utf8");
      // Clean exit: the bounded clean-exit resume owns it, not a crash
      // escalation that parks the task on `needs_input`.
      expect(body).toContain("engineer turn ended without a handoff");
      expect(body).not.toContain("agent exited with an error");
      expect(readTask().needsInput).toBe(false);
      vi.restoreAllMocks();
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
