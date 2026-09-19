/**
 * Truncated agent output (#0442). A streaming CLI cut mid-serialisation —
 * a large tool result hitting a context/buffer ceiling — used to make the
 * runner drop the whole turn: `JSON.parse` threw `Unterminated string in JSON
 * at position 284447`, the payload degraded to a raw line or vanished, and the
 * human was left with "tool-call formatting issue" and no output.
 *
 * Covers the three acceptance criteria: the turn's output survives, truncation
 * is reported as truncation (not as generic malformed JSON), and the events
 * that completed before the cut are preserved instead of discarded.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunner,
  extractOneShotReportText,
  parseJsonEvent,
  parseOneShotLine,
} from "../../server/agents";
import {
  isTruncationError,
  recoverTruncatedJson,
  TRUNCATION_NOTICE_PREFIX,
  truncationMessage,
} from "../../server/json-truncation";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import type { Logger } from "../../core/logger";
import { waitFor } from "./helpers";

/** How many characters of the event's text survive in a cut payload. */
const KEPT = 12;

/**
 * An opencode `text` event serialised and then cut off mid-string, the way a
 * process killed (or ceilinged) while writing leaves it. `keep` is how many
 * characters of the text made it out; the payload is trimmed before repair, so
 * a cut landing on a space yields the text up to that space.
 */
function cutTextEvent(text: string, keep = KEPT): { raw: string; kept: string } {
  const full = JSON.stringify({
    type: "text",
    sessionID: "ses-123",
    part: { type: "text", text },
  });
  const at = full.indexOf(text);
  return { raw: full.slice(0, at + keep), kept: text.slice(0, keep).trim() };
}

describe("recoverTruncatedJson", () => {
  it("returns null when there is nothing to recover", () => {
    // Valid JSON, plain text, and genuinely malformed JSON are all "not a
    // truncation" — the caller keeps its existing fallback for those.
    expect(recoverTruncatedJson('{"type":"text","part":{"text":"hi"}}')).toBeNull();
    expect(recoverTruncatedJson("Warning: no stdin data received")).toBeNull();
    expect(recoverTruncatedJson('{"type":}')).toBeNull();
    expect(recoverTruncatedJson("")).toBeNull();
  });

  it("keeps the events that completed before the cut", () => {
    const raw =
      '{"type":"step_start","sessionID":"ses-123"}\n' +
      '{"type":"text","sessionID":"ses-123","part":{"text":"first"}}\n' +
      '{"type":"text","sessionID":"ses-123","part":{"text":"cut off';
    const out = recoverTruncatedJson(raw);
    expect(out).not.toBeNull();
    expect(out!.recovered.slice(0, 2)).toEqual([
      '{"type":"step_start","sessionID":"ses-123"}',
      '{"type":"text","sessionID":"ses-123","part":{"text":"first"}}',
    ]);
    // The partial event is closed up rather than dropped.
    expect(JSON.parse(out!.recovered[2])).toEqual({
      type: "text",
      sessionID: "ses-123",
      part: { text: "cut off" },
    });
  });

  it("salvages the text that arrived before a string was cut (#0442)", () => {
    const { raw, kept } = cutTextEvent("I inspected the repo and found the bug in the parser");
    const out = recoverTruncatedJson(raw);
    expect(out?.recovered).toHaveLength(1);
    // The recovered event goes through the normal parser, so the partial text
    // becomes a real transcript entry instead of a dropped turn.
    expect(parseJsonEvent(out!.recovered[0])).toEqual({
      entry: { type: "text", text: kept },
      sessionID: "ses-123",
    });
  });

  it("drops a half-written key instead of inventing a value", () => {
    expect(recoverTruncatedJson('{"type":"text","part":{"tex')?.recovered).toEqual([
      '{"type":"text"}',
    ]);
  });

  it("closes a value cut after a number or a nested container", () => {
    expect(recoverTruncatedJson('{"a":1,"b":[1,2')?.recovered).toEqual(['{"a":1,"b":[1,2]}']);
    expect(recoverTruncatedJson('{"a":{"b":2},"c":3')?.recovered).toEqual(['{"a":{"b":2},"c":3}']);
  });

  it("gives up on the partial string when the cut lands inside an escape", () => {
    // The dangling `\\` is dropped and the text before it kept…
    expect(recoverTruncatedJson('{"a":"b","c":"x\\')?.recovered).toEqual(['{"a":"b","c":"x"}']);
    // …but a truncated \\u escape can't be closed into valid JSON at all, so
    // the repair falls back to the last complete value.
    expect(recoverTruncatedJson('{"a":"b","c":"\\u00')?.recovered).toEqual(['{"a":"b"}']);
  });

  it("reports the payload size in bytes and says what to do about it", () => {
    const { raw } = cutTextEvent("x".repeat(1000));
    const out = recoverTruncatedJson(raw);
    expect(out?.bytes).toBe(Buffer.byteLength(raw, "utf8"));
    expect(out?.message).toBe(truncationMessage(Buffer.byteLength(raw, "utf8")));
    expect(out?.message).toContain("Agent output was truncated (payload too large");
    expect(out?.message).toContain("Retry or reduce context.");
  });

  it("recognises the reported 284KB incident payload", () => {
    // The shape seen on #0440: one opencode event ~284KB, cut mid-string.
    const { raw, kept } = cutTextEvent("y".repeat(284_000), 284_000);
    expect(raw.length).toBeGreaterThan(284_000);
    const out = recoverTruncatedJson(raw);
    expect(out?.recovered).toHaveLength(1);
    expect(parseJsonEvent(out!.recovered[0])?.entry).toEqual({ type: "text", text: kept });
  });

  it("returns an empty recovery, not null, when nothing survives the cut", () => {
    // `{"` — the cut landed before even one complete value. Still a truncation,
    // so the caller can name the cause; there is just nothing to keep.
    const out = recoverTruncatedJson('{"');
    expect(out?.recovered).toEqual([]);
    expect(out?.message.startsWith(TRUNCATION_NOTICE_PREFIX)).toBe(true);
  });
});

describe("isTruncationError", () => {
  it("separates a cut-short payload from ordinary malformed JSON", () => {
    const caught = (text: string): unknown => {
      try {
        JSON.parse(text);
        return null;
      } catch (err) {
        return err;
      }
    };
    expect(isTruncationError(caught('{"a":"b'))).toBe(true);
    expect(isTruncationError(caught('{"a":}'))).toBe(false);
    expect(isTruncationError(new Error("not json at all"))).toBe(false);
    expect(isTruncationError(undefined)).toBe(false);
  });
});

describe("one-shot report extraction (review/CTO/PM)", () => {
  it("keeps the last complete text event when the cut left no text behind", () => {
    // `{"` recovers nothing, so the report falls back to the last text event
    // that did arrive — never to the raw unparseable payload.
    const output = '{"type":"text","sessionID":"ses-1","part":{"text":"first pass"}}\n{"';
    expect(extractOneShotReportText("opencode", output)).toBe("first pass");
  });

  it("uses the salvaged text when the cut landed inside the final answer", () => {
    const { raw, kept } = cutTextEvent("the verdict is that the fix works");
    const output = `{"type":"text","sessionID":"ses-1","part":{"text":"first pass"}}\n${raw}`;
    // The recovered partial event still yields a text entry, so the last text
    // wins — partial output beats no output.
    expect(extractOneShotReportText("opencode", output)).toBe(kept);
  });

  it("reports truncation rather than returning unparseable JSON", () => {
    expect(parseOneShotLine("opencode", '{"')).toEqual({
      s: "sys",
      d: expect.stringContaining("Agent output was truncated"),
    });
    expect(extractOneShotReportText("opencode", '{"')).toContain("Agent output was truncated");
  });

  it("leaves plain-text one-shot output untouched", () => {
    expect(extractOneShotReportText("kiro", "final answer")).toBe("final answer");
    expect(parseOneShotLine("opencode", "a plain warning line")).toEqual({
      s: "out",
      d: "a plain warning line",
    });
  });
});

// ── Runner end-to-end: a fake CLI whose last event is cut in half ──

const TASK: Task = {
  id: "0045",
  title: "Truncated stream",
  type: "bug",
  status: "ready",
  priority: "p2",
  area: "ai",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/truncated-stream",
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: "work/0045-truncated.md",
  absPath: "/tmp/work/0045-truncated.md",
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

const agent: Agent = { name: "engineer", cli: "opencode", model: "big pickle", enabled: true };

/** Fake `opencode` writing `events` as JSONL, then `tail` with no newline. */
function fakeBin(events: unknown[], tail: string): string {
  return [
    "#!/usr/bin/env node",
    `const events = ${JSON.stringify(events)};`,
    "for (const ev of events) process.stdout.write(JSON.stringify(ev) + String.fromCharCode(10));",
    `process.stdout.write(${JSON.stringify(tail)});`,
    "",
  ].join("\n");
}

function makeFixture(script: string): { bin: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-trunc-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode"), script, { mode: 0o755 });
  return { bin, clean: () => rmSync(root, { recursive: true, force: true }) };
}

/** Minimal logger that records `agent()` calls so tests can assert severity. */
function recordingLogger(): { logger: Logger; calls: { level: string; message: string }[] } {
  const calls: { level: string; message: string }[] = [];
  return {
    logger: {
      agent: (_id: string, level: string, message: string) => {
        calls.push({ level, message });
      },
    } as unknown as Logger,
    calls,
  };
}

let oldPath = "";

afterEach(() => {
  if (oldPath) {
    process.env.PATH = oldPath;
    oldPath = "";
  }
});

describe("AgentRunner with a truncated stream (#0442)", () => {
  it("preserves the events before the cut and reports the truncation", async () => {
    const { raw: tail, kept } = cutTextEvent("the answer is that the parser dropped everything");
    const fx = makeFixture(
      fakeBin(
        [
          { type: "text", sessionID: "ses-123", part: { type: "text", text: "Starting." } },
          {
            type: "tool_use",
            sessionID: "ses-123",
            part: {
              type: "tool",
              tool: "bash",
              state: { status: "completed", input: { command: "ls" }, output: "AGENTS.md" },
            },
          },
        ],
        tail,
      ),
    );
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    const log = recordingLogger();
    try {
      const runner = new AgentRunner(config(fx.bin), () => {}, { logger: log.logger });
      runner.start(TASK, "feat/truncated-stream", agent, { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0045"), "truncated turn exit");

      // The two complete events survive as structured entries, the cut event
      // survives as its partial text, and the truncation is named — instead of
      // the whole turn producing nothing but a raw JSON blob.
      expect(runner.output("0045")!.lines).toEqual([
        { type: "text", text: "Starting.", at: expect.any(String) },
        {
          type: "tool",
          tool: "bash",
          input: "ls",
          output: "AGENTS.md",
          state: "completed",
          at: expect.any(String),
        },
        { type: "text", text: kept, at: expect.any(String) },
        {
          type: "sys",
          d: truncationMessage(Buffer.byteLength(tail, "utf8")),
          at: expect.any(String),
        },
      ]);
      expect(runner.output("0045")!.truncation).toEqual({
        bytes: Buffer.byteLength(tail, "utf8"),
        recovered: 1,
      });
      // Partial output is a degraded turn, not a failed one.
      expect(log.calls.some((c) => c.level === "error" && c.message.includes("truncated"))).toBe(
        false,
      );
      // The session id still came off the events that made it through.
      expect(runner.output("0045")!.sessionId).toBe("ses-123");
    } finally {
      process.env.PATH = oldPath;
      oldPath = "";
      fx.clean();
    }
  });

  it("marks the turn failed when nothing survived the cut", async () => {
    // `{"` — the stream was cut before a single complete event was written.
    const fx = makeFixture(fakeBin([], '{"'));
    oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    const log = recordingLogger();
    try {
      const runner = new AgentRunner(config(fx.bin), () => {}, { logger: log.logger });
      runner.start(TASK, "feat/truncated-stream", agent, { cwd: fx.bin });
      await waitFor(() => !runner.isRunning("0045"), "empty truncated turn exit");

      const session = runner.output("0045")!;
      expect(session.truncation?.recovered).toBe(0);
      expect(session.lines).toEqual([
        {
          type: "sys",
          d: expect.stringContaining("Agent output was truncated"),
          at: expect.any(String),
        },
      ]);
      // A zero exit with no usable output must not read as a clean finish —
      // the task would otherwise sit silently in `active` with nothing running.
      expect(
        log.calls.some(
          (c) => c.level === "error" && c.message.includes("no usable output (truncated)"),
        ),
      ).toBe(true);
    } finally {
      process.env.PATH = oldPath;
      oldPath = "";
      fx.clean();
    }
  });
});
