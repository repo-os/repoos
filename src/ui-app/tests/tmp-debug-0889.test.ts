import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import { parseTask } from "../../core/task";
import type { Agent, RepoOSConfig } from "../../core/types";
import { waitFor } from "./helpers";

const SCRIPT = `#!/usr/bin/env node
const fs = require("fs");
if (process.env.REPOOS_ARGV_LOG) fs.appendFileSync(process.env.REPOOS_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write("working\\n");
setTimeout(() => process.exit(0), 250);
`;

describe("debug 0889", () => {
  it("resume debug", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dbg-"));
    const work = join(root, "work");
    const bin = join(root, "bin");
    mkdirSync(work, { recursive: true });
    mkdirSync(bin, { recursive: true });
    const taskPath = join(work, "0889-nul.md");
    writeFileSync(
      taskPath,
      `---\nid: "0889"\ntitle: NUL\ntype: bug\nstatus: active\npriority: p2\narea: server\nassigned_to: ai\nbranch: feat/0889-nul\n---\n## Problem\nx\n`,
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
    writeFileSync(join(bin, "opencode"), SCRIPT, { mode: 0o755 });
    const argvLog = join(root, "argv.log");
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath ?? ""}`;
    process.env.REPOOS_ARGV_LOG = argvLog;
    const config: RepoOSConfig = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      maxConcurrentAgents: 2,
    };
    const task = parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
    const agent: Agent = { name: "engineer", cli: "opencode", model: "test-model", instructions: "", enabled: true };
    const runner = new AgentRunner(config, () => {}, {
      stallTimeoutMs: 10_000,
      getTask: () =>
        parseTask({
          content: readFileSync(taskPath, "utf8"),
          absPath: taskPath,
          root,
          defaultStatus: config.defaultStatus,
          defaultAssignee: config.defaultAssignee,
        }),
    });
    try {
      console.log("START", runner.start(task, "feat/0889-nul", agent, { cwd: root }));
      await waitFor(() => {
        try {
          return readFileSync(argvLog, "utf8").trim().length > 0;
        } catch {
          return false;
        }
      }, "first spawn");
      console.log("argv1", readFileSync(argvLog, "utf8"));
      for (let i = 0; i < 20; i++) {
        console.log("tick", i, "running", runner.isRunning("0889"));
        if (!runner.isRunning("0889")) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const sent = runner.send("0889", "hello\u0000world", agent);
      console.log("SEND", sent);
      for (let i = 0; i < 20; i++) {
        console.log(
          "tick2",
          i,
          "running",
          runner.isRunning("0889"),
          "args",
          (() => {
            try {
              return readFileSync(argvLog, "utf8").trim().split("\n").length;
            } catch {
              return 0;
            }
          })(),
        );
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(true).toBe(true);
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_ARGV_LOG;
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
