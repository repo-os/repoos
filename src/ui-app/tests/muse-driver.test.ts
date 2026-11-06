/**
 * Muse Code (Meta) driver. `muse exec --json` streams one MSP-envelope JSON
 * object per line; the session id is the envelope's stream id (the
 * `--session-id` value when one was passed), the answer arrives as
 * `run.output.delta` fragments plus the terminal `run.terminal` record, tool
 * activity is an intent/result pair, and per-turn tokens arrive in `run.usage`.
 * `--session-id` takes only UUIDs (anything else exits 2), so RepoOS mints the
 * id instead of deriving it. Cancellation is plain SIGTERM.
 */
import { describe, expect, it } from "vitest";
import {
  engineerLaunches,
  engineerPermissionGaps,
  engineCancelSignal,
  extractOneShotReportText,
  extractUsage,
  isValidMuseSessionId,
  newConversationSessionId,
  parseMuseEvent,
  parseOneShotLine,
  pmCommand,
  promptCommand,
  reviewCommand,
  supportsChosenSessionId,
} from "../../server/agents";
import { MUSE_ENGINEER_MAX_MODEL_STEPS, MUSE_MAX_MODEL_STEPS } from "../../core/agent-contract";
import type { Agent } from "../../core/types";

const agent = (model = "default"): Agent => ({
  name: "engineer",
  cli: "muse",
  model,
  enabled: true,
});

const UUID = "123e4567-e89b-12d3-a456-426614174000";

const env = (payload_type: string, payload: unknown, streamId = UUID): string =>
  JSON.stringify({
    schema_version: 1,
    stream: { kind: "session", id: streamId },
    sequence: 1,
    payload_type,
    payload,
  });

describe("muse invocation shapes", () => {
  it("runs headless JSONL with trust, approval mode, and a step cap", () => {
    expect(promptCommand(agent(), "do the thing")).toEqual({
      cmd: "muse",
      args: [
        "exec",
        "--json",
        "--trust-workspace",
        "--approval-mode",
        "never",
        "--max-model-steps",
        String(MUSE_MAX_MODEL_STEPS),
        "--reasoning-effort",
        "medium",
        "do the thing",
      ],
    });
  });

  it("forwards an explicit model with --model", () => {
    const { args } = promptCommand(agent("muse-spark-1.3"), "ping");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("muse-spark-1.3");
  });

  it("pins a client-chosen UUID on first launch and resumes it, never --continue", () => {
    const [launch, followUp] = engineerLaunches(agent(), "/tmp/wt", UUID);
    expect(launch.cmd).toBe("muse");
    expect(launch.args).toContain("--session-id");
    expect(launch.args[launch.args.indexOf("--session-id") + 1]).toBe(UUID);
    expect(followUp.cmd).toBe("muse");
    expect(followUp.args).toEqual(expect.arrayContaining(["--session-id", UUID]));
    expect(followUp.args).not.toContain("--continue");
  });

  it("never passes a non-UUID session id (muse exits 2 on those)", () => {
    const [launch, followUp] = engineerLaunches(agent(), "/tmp/wt", "repoos-0001-engineer");
    expect(launch.args).not.toContain("--session-id");
    expect(followUp.args).not.toContain("--session-id");
    expect(followUp.args).not.toContain("repoos-0001-engineer");
  });

  it("supports chosen session ids but mints UUIDs, unlike pi's deterministic shape", () => {
    expect(supportsChosenSessionId("muse")).toBe(true);
    expect(isValidMuseSessionId(UUID)).toBe(true);
    expect(isValidMuseSessionId("repoos-0001-engineer")).toBe(false);
    expect(isValidMuseSessionId(undefined)).toBe(false);
    // UUID v4 shape (randomUUID), never the deterministic task-role shape.
    expect(newConversationSessionId("muse", "0001")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newConversationSessionId("muse", "0001")).not.toBe(
      newConversationSessionId("muse", "0001"),
    );
    expect(newConversationSessionId("pi", "0001")).toBe("repoos-0001-engineer");
  });

  it("keeps the shared flag set on resume (muse forgets options between processes)", () => {
    const [, followUp] = engineerLaunches(agent("muse-spark-1.3"), "/tmp/wt", UUID);
    expect(followUp.args).toEqual([
      "exec",
      "--json",
      "--yolo",
      "--trust-workspace",
      "--approval-mode",
      "never",
      "--max-model-steps",
      String(MUSE_ENGINEER_MAX_MODEL_STEPS),
      "--reasoning-effort",
      "medium",
      "--session-id",
      UUID,
      "--model",
      "muse-spark-1.3",
      "continue",
    ]);
  });

  it("needs the approval-mode flag and keeps SIGTERM as the cancellation signal", () => {
    for (const { args } of engineerLaunches(agent(), "/tmp/wt")) {
      expect(engineerPermissionGaps("muse", args)).toEqual([]);
    }
    expect(engineerPermissionGaps("muse", ["exec", "--json"])).toEqual([
      expect.stringContaining("--approval-mode"),
    ]);
    expect(engineCancelSignal("muse")).toBe("SIGTERM");
  });

  it("restricts advisory one-shots to read-only flags", () => {
    const pm = pmCommand(agent(), "author the body", "/tmp/wt");
    expect(pm.cmd).toBe("muse");
    expect(pm.args).toContain("--disable-write");
    expect(pm.args).toContain("--disable-shell");
    const review = reviewCommand(agent(), "review this", "/tmp/wt", {
      sessionId: UUID,
      resume: false,
    });
    expect(review.args).toContain("--disable-write");
    expect(review.args).toContain("--disable-shell");
    expect(review.args).toContain("--session-id");
    // A non-UUID caller id (pi's reviewer shape) is never passed through.
    const legacy = reviewCommand(agent(), "review this", "/tmp/wt", {
      sessionId: "repoos-0001-reviewer-1",
      resume: false,
    });
    expect(legacy.args).not.toContain("--session-id");
  });
});

describe("muse event parsing", () => {
  it("captures the session id from the envelope stream", () => {
    expect(parseMuseEvent(env("run.lifecycle.started", { kind: "run_started" }))).toEqual({
      sessionID: UUID,
    });
  });

  it("captures the model from run.model.configured", () => {
    expect(
      parseMuseEvent(
        env("run.model.configured", { kind: "run_model_configured", model_id: "muse-spark-1.3" }),
      ),
    ).toEqual({ sessionID: UUID, model: "muse-spark-1.3" });
  });

  it("reports the per-turn model call count from run.usage (step-cap detection)", () => {
    expect(parseMuseEvent(env("run.usage", { kind: "run_usage", calls: 200, models: [] }))).toEqual(
      { sessionID: UUID, usageCalls: 200 },
    );
  });

  it("gives engineer turns a larger step cap than probes and advisory turns", () => {
    expect(MUSE_ENGINEER_MAX_MODEL_STEPS).toBeGreaterThan(MUSE_MAX_MODEL_STEPS);
  });

  it("surfaces incremental delta text", () => {
    expect(
      parseMuseEvent(env("run.output.delta", { kind: "run_output_delta", text: "OK" })),
    ).toEqual({ sessionID: UUID, entry: { type: "text", text: "OK" }, textDelta: true });
  });

  it("surfaces the terminal answer and marks completion", () => {
    expect(
      parseMuseEvent(
        env("run.terminal.completed", { kind: "run_terminal", terminal: "completed", text: "OK" }),
      ),
    ).toEqual({
      sessionID: UUID,
      entry: { type: "text", text: "OK" },
      terminal: "completed",
    });
  });

  it("surfaces a failed terminal as a system line, not an answer", () => {
    const parsed = parseMuseEvent(
      env("run.terminal.completed", {
        kind: "run_terminal",
        terminal: "failed",
        reason: "model error",
      }),
    );
    expect(parsed?.terminal).toBe("failure");
    expect(parsed?.entry).toEqual({ type: "sys", d: "Muse run model error." });
  });

  it("pairs a tool intent with its result", () => {
    const start = parseMuseEvent(
      env("task.lifecycle.side_effect_intent", {
        kind: "task_lifecycle",
        event: {
          kind: "side_effect_intent",
          operation: "tool:search",
          idempotency_key: "tool:call-1",
          policy_decision: "allow:policy",
        },
      }),
    );
    expect(start?.toolEvent).toEqual({ phase: "start", id: "call-1", tool: "search" });
    const end = parseMuseEvent(
      env("tool.result", {
        kind: "tool_result",
        call_id: "call-1",
        text: "no matches",
        correlation_facts: { tool_name: "search", outcome: "success" },
      }),
    );
    expect(end?.toolEvent).toEqual({
      phase: "complete",
      id: "call-1",
      tool: "search",
      output: "no matches",
      error: false,
    });
  });

  it("marks error outcomes on tool results", () => {
    const end = parseMuseEvent(
      env("tool.result", {
        kind: "tool_result",
        call_id: "call-9",
        text: "denied",
        correlation_facts: { tool_name: "shell", outcome: "error" },
      }),
    );
    expect(end?.toolEvent).toEqual({
      phase: "complete",
      id: "call-9",
      tool: "shell",
      output: "denied",
      error: true,
    });
  });

  it("swallows usage and lifecycle records (usage folds from the raw line)", () => {
    expect(
      parseMuseEvent(
        env("run.usage", {
          kind: "run_usage",
          models: [{ model: "muse-spark-1.3", input_tokens: 10, output_tokens: 2 }],
        }),
      ),
    ).toEqual({ sessionID: UUID });
    expect(parseMuseEvent(env("session.run.linked", { kind: "session_run_linked" }))).toEqual({
      sessionID: UUID,
    });
  });

  it("returns null for non-JSON", () => {
    expect(parseMuseEvent("not json")).toBeNull();
    expect(parseMuseEvent("")).toBeNull();
  });
});

describe("muse usage extraction", () => {
  const usageLine = env("run.usage", {
    kind: "run_usage",
    models: [
      {
        model: "muse-spark-1.3",
        input_tokens: 28767,
        cached_tokens: 120,
        output_tokens: 19,
        reasoning_tokens: 9,
        calls: 1,
      },
    ],
    calls: 1,
    completed_calls: 1,
    failed_calls: 0,
    cancelled_calls: 0,
  });

  it("folds per-turn tokens as authoritative (one exec is one turn)", () => {
    expect(extractUsage(usageLine)).toMatchObject({
      inputTokens: 28767,
      outputTokens: 19,
      totalTokens: 28786,
      cacheReadTokens: 120,
      authoritative: true,
      turns: 1,
    });
    // No cost field exists in the stream — never fabricated.
    expect(extractUsage(usageLine).costUsd).toBeUndefined();
  });

  it("sums multi-model turns", () => {
    const line = env("run.usage", {
      kind: "run_usage",
      models: [
        { model: "a", input_tokens: 10, output_tokens: 2, calls: 1 },
        { model: "b", input_tokens: 5, output_tokens: 1, calls: 2 },
      ],
    });
    expect(extractUsage(line)).toMatchObject({
      inputTokens: 15,
      outputTokens: 3,
      totalTokens: 18,
      turns: 3,
    });
  });
});

describe("muse one-shot transcript", () => {
  it("ignores delta fragments and keeps the terminal answer once", () => {
    const delta = env("run.output.delta", { kind: "run_output_delta", text: "O" });
    const terminal = env("run.terminal.completed", {
      kind: "run_terminal",
      terminal: "completed",
      text: "OK",
    });
    // Deltas are swallowed in the one-shot path; only the terminal record
    // yields an entry, so the answer is not appended twice.
    expect(parseOneShotLine("muse", delta)).toBeNull();
    expect(parseOneShotLine("muse", terminal)).toEqual({ type: "text", text: "OK" });
    expect(extractOneShotReportText("muse", `${delta}\n${terminal}`)).toBe("OK");
  });
});
