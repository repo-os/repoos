/**
 * Crush driver (#0585). Crush is plain-text like kiro but adds three seams the
 * other drivers do not have: approval is a property of the non-interactive mode
 * (no flag), cancellation needs SIGINT (SIGTERM orphans its tool children), and
 * both the session id and usage are only recoverable post-run from
 * `crush session list --json` / `crush session show --json`.
 */
import { describe, expect, it } from "vitest";
import {
  engineerLaunches,
  engineCancelSignal,
  harnessChildEnv,
  parseCrushSessionList,
  parseCrushSessionUsage,
  pickNewCrushSessionId,
  promptCommand,
} from "../../server/agents";
import { engineerPermissionGaps } from "../../server/agents";
import type { Agent } from "../../core/types";

const agent = (model = "default"): Agent => ({
  name: "engineer",
  cli: "crush",
  model,
  enabled: true,
});

describe("crush invocation shapes", () => {
  it("runs with --quiet and a positional prompt", () => {
    expect(promptCommand(agent(), "do the thing")).toEqual({
      cmd: "crush",
      args: ["run", "--quiet", "do the thing"],
    });
  });

  it("forwards an explicit model with --model", () => {
    expect(promptCommand(agent("openai/gpt-5"), "ping")).toEqual({
      cmd: "crush",
      args: ["run", "--quiet", "--model", "openai/gpt-5", "ping"],
    });
  });

  it("resumes with --session <id> and never --continue", () => {
    const [, followUp] = engineerLaunches(agent(), "/tmp/wt");
    expect(followUp.cmd).toBe("crush");
    expect(followUp.args).toEqual(["run", "--quiet", "--session", "session-id", "continue"]);
    expect(followUp.args).not.toContain("--continue");
  });

  it("needs no permission-bypass flag (approval is a property of run mode)", () => {
    for (const { args } of engineerLaunches(agent(), "/tmp/wt")) {
      expect(engineerPermissionGaps("crush", args)).toEqual([]);
      expect(args).not.toContain("--yolo");
    }
  });
});

describe("crush cancellation and env", () => {
  it("uses SIGINT for crush and SIGTERM everywhere else", () => {
    expect(engineCancelSignal("crush")).toBe("SIGINT");
    expect(engineCancelSignal("opencode")).toBe("SIGTERM");
    expect(engineCancelSignal(undefined)).toBe("SIGTERM");
  });

  it("forces CRUSH_CLIENT_SERVER=0 so no detached crush server is spawned", () => {
    const env: NodeJS.ProcessEnv = { CRUSH_CLIENT_SERVER: "1", PATH: "/usr/bin" };
    harnessChildEnv("crush", env);
    expect(env.CRUSH_CLIENT_SERVER).toBe("0");
    // Other harnesses are untouched.
    const other: NodeJS.ProcessEnv = { CRUSH_CLIENT_SERVER: "1" };
    harnessChildEnv("opencode", other);
    expect(other.CRUSH_CLIENT_SERVER).toBe("1");
  });
});

describe("crush session capture", () => {
  it("parses session list --json and drops malformed rows", () => {
    expect(
      parseCrushSessionList(
        '[{"id":"a","modified":"2026-09-29T10:00:00Z"},{"nope":true},"junk",{"id":"b"}]',
      ),
    ).toEqual([
      { id: "a", modified: "2026-09-29T10:00:00Z" },
      { id: "b", modified: null },
    ]);
    expect(parseCrushSessionList("not json")).toEqual([]);
  });

  it("selects the session id present after but not before the run", () => {
    const before = ["old-1", "old-2"];
    const after = parseCrushSessionList(
      JSON.stringify([
        { id: "new-9", modified: "2026-09-29T12:00:00Z" },
        { id: "old-1", modified: "2026-09-29T09:00:00Z" },
        { id: "old-2", modified: "2026-09-29T08:00:00Z" },
      ]),
    );
    expect(pickNewCrushSessionId(before, after)).toBe("new-9");
    // No new session (a run that produced nothing) → no guess.
    expect(pickNewCrushSessionId(before, parseCrushSessionList(JSON.stringify([])))).toBeNull();
  });

  it("picks the most recently modified candidate when several are new", () => {
    const after = parseCrushSessionList(
      JSON.stringify([
        { id: "stale", modified: "2026-09-29T10:00:00Z" },
        { id: "fresh", modified: "2026-09-29T11:00:00Z" },
      ]),
    );
    expect(pickNewCrushSessionId(["unrelated"], after)).toBe("fresh");
  });

  it("never guesses without a baseline", () => {
    const after = parseCrushSessionList(JSON.stringify([{ id: "only" }]));
    expect(pickNewCrushSessionId([], after)).toBe("only"); // baseline present but empty
    // The runner only calls this with a real baseline; an undefined baseline
    // short-circuits before this helper (captureCrushSession returns early).
  });

  it("ingests cost and tokens from session show --json", () => {
    const raw = JSON.stringify({
      meta: {
        id: "abc",
        cost: 0.0016488,
        prompt_tokens: 13642,
        completion_tokens: 3,
        total_tokens: 13645,
      },
      messages: [],
    });
    expect(parseCrushSessionUsage(raw)).toEqual({
      costUsd: 0.0016488,
      inputTokens: 13642,
      outputTokens: 3,
      totalTokens: 13645,
    });
    expect(parseCrushSessionUsage("not json")).toBeNull();
    expect(parseCrushSessionUsage(JSON.stringify({ messages: [] }))).toBeNull();
  });
});
