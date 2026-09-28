/**
 * `last_check_failure` must survive the frontmatter round-trip.
 *
 * Regression: `scheduleCheckFailureRetry` assigned a structured object
 * ({ stage, command, exitCode, detail, timestamp }) to that key. Task
 * frontmatter is a flat scalar format, so `serializeScalar` stringified it
 * with String(v) and every task that hit a handoff check failure recorded the
 * literal `[object Object]` — discarding the only durable record of why the
 * check failed. Eight task files in work/ carry the corrupted value.
 *
 * Nested YAML is NOT the fix: the key regex in `scanFrontmatterLines` has no
 * leading-whitespace tolerance, so an indented child line is skipped on read
 * and the value round-trips back as null. Hence a single flattened line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import { parseDocument } from "../../core/frontmatter";
import { formatCheckFailure, scheduleCheckFailureRetry } from "../../server/handoff";
import type { AgentRunner } from "../../server/agents";

interface Fixture {
  root: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

function taskText(extra = ""): string {
  return `---
id: "0001"
title: Check failure fixture
type: feature
status: active
priority: p2
area: agent
assigned_to: ai
branch: feat/check-failure-fixture
${extra}---
Body
`;
}

function makeFixture(extra = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-check-failure-"));
  const taskPath = join(root, "work", "0001-fixture.md");
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(taskPath, taskText(extra));
  return {
    root,
    taskPath,
    config: {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
    },
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function readTask(fx: Fixture): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  });
}

function makeFakeRunner(): AgentRunner {
  return {
    send: () => ({ ok: true }),
    system: () => {},
    persistHandoffFailure: () => {},
  } as unknown as AgentRunner;
}

const DETAIL = "✗ formatting (oxfmt --check)\n  src/server/handoff.ts: reformat needed";

describe("formatCheckFailure", () => {
  it("flattens to one line so a multi-line detail cannot break the block", () => {
    const out = formatCheckFailure(DETAIL, "1");
    expect(out).not.toContain("\n");
    expect(out).toContain("repoos check (exit 1) at ");
    // Newlines collapsed to single spaces, nothing lost but the breaks.
    expect(out).toContain("✗ formatting (oxfmt --check) src/server/handoff.ts: reformat needed");
  });

  it("omits the exit code when the detail carries none", () => {
    expect(formatCheckFailure("check failed", null)).not.toContain("exit");
  });

  it("truncates an enormous detail rather than bloating the committed file", () => {
    const out = formatCheckFailure("x".repeat(5000), "1");
    expect(out).toContain("(truncated)");
    expect(out.length).toBeLessThan(700);
  });
});

describe("scheduleCheckFailureRetry frontmatter (#last_check_failure)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists a readable string, never [object Object]", async () => {
    const fx = makeFixture();
    try {
      const task = readTask(fx);
      const scheduled = scheduleCheckFailureRetry(
        fx.config,
        task,
        { step: "check", ok: false, detail: `repoos check failed with exit 1:\n${DETAIL}` },
        makeFakeRunner(),
      );
      expect(scheduled).toBe(true);
      await vi.runAllTimersAsync();

      const raw = readFileSync(fx.taskPath, "utf8");
      // The regression itself, asserted against the bytes on disk.
      expect(raw).not.toContain("[object Object]");
      expect(raw).toMatch(/^last_check_failure: /m);

      // …and the value must survive a fresh parse, not just look right.
      const { data } = parseDocument(raw);
      expect(typeof data.last_check_failure).toBe("string");
      expect(data.last_check_failure as string).toContain("repoos check");
      expect(data.last_check_failure as string).toContain("oxfmt --check");

      // The retry count alongside it still parses as a number.
      expect(data.check_retry_count).toBe(1);
    } finally {
      fx.clean();
    }
  });

  it("keeps the rest of the frontmatter and the body intact", async () => {
    const fx = makeFixture();
    try {
      const task = readTask(fx);
      scheduleCheckFailureRetry(
        fx.config,
        task,
        { step: "check", ok: false, detail: "repoos check failed with exit 1" },
        makeFakeRunner(),
      );
      await vi.runAllTimersAsync();

      const updated = readTask(fx);
      expect(updated.id).toBe("0001");
      expect(updated.title).toBe("Check failure fixture");
      expect(updated.body.trim()).toBe("Body");
    } finally {
      fx.clean();
    }
  });
});
