/**
 * Every write-capable coding-agent driver must be launched with permissions
 * that let an engineer run what the job needs — `repoos check`, bun/bunx, git —
 * unattended. Three incidents in one day came from drivers that couldn't:
 * Codex's sandbox blocking localhost (#0406), Copilot's allowlist missing
 * `repoos`/`bunx` (#0412), and Qwen launched without approvals off. This test
 * fails the moment a driver's launch args, or a new driver, leaves a gap.
 */
import { describe, expect, it } from "vitest";
import { AGENT_CLIS } from "../../core/config";
import {
  detectPermissionDenial,
  engineerLaunches,
  engineerPermissionGaps,
} from "../../server/agents";

describe("engineer launch permissions", () => {
  it.each([...AGENT_CLIS])("%s can run repoos check, bun, bunx and git unattended", (cli) => {
    for (const { args } of engineerLaunches(
      { name: "engineer", cli, model: "default", enabled: true },
      "/tmp/worktree",
    )) {
      expect(engineerPermissionGaps(cli, args)).toEqual([]);
    }
  });

  it("reports a driver with no declared permission model", () => {
    expect(engineerPermissionGaps("some-new-cli", [])).toEqual([
      'no permission model is declared for "some-new-cli" in engineerPermissionGaps',
    ]);
  });

  it("names each missing Copilot allowlist entry", () => {
    const gaps = engineerPermissionGaps("github copilot", [
      "--allow-tool",
      "shell(bun:*)",
      "--allow-tool",
      "shell(git:*)",
    ]);
    expect(gaps).toHaveLength(2);
    expect(gaps.join(" ")).toContain("`repoos`");
    expect(gaps.join(" ")).toContain("`bunx`");
  });

  it("flags a Codex sandbox without network", () => {
    expect(engineerPermissionGaps("codex", ["exec", "--sandbox", "workspace-write"])).toEqual([
      expect.stringContaining("network is off"),
    ]);
  });
});

describe("runtime permission-denial detection", () => {
  it("recognizes Copilot's denied tool call", () => {
    const line = JSON.stringify({
      type: "tool.execution_complete",
      data: {
        success: false,
        error: { message: "Permission denied and could not request permission from user" },
      },
    });
    expect(detectPermissionDenial("copilot", line)).toContain("--allow-tool");
  });

  it("ignores the same text when an agent is only reading source code", () => {
    const line = JSON.stringify({
      type: "tool.execution_complete",
      data: {
        success: true,
        result: { content: "// Permission denied and could not request permission" },
      },
    });
    expect(detectPermissionDenial("copilot", line)).toBeNull();
  });

  it("recognizes non-empty permission_denials in Claude/Qwen results only", () => {
    const denied = JSON.stringify({
      type: "result",
      permission_denials: [{ tool_name: "Bash", tool_input: { command: "repoos check" } }],
    });
    expect(detectPermissionDenial("claude", denied)).toContain("Claude Code");
    expect(detectPermissionDenial("qwen", denied)).toContain("Qwen Code");
    expect(
      detectPermissionDenial("claude", JSON.stringify({ type: "result", permission_denials: [] })),
    ).toBeNull();
  });

  it("recognizes Codex's sandbox blocking a localhost bind", () => {
    expect(
      detectPermissionDenial(
        "codex",
        '{"aggregated_output":"Error: listen EPERM: operation not permitted 127.0.0.1"}',
      ),
    ).toContain("sandbox");
    expect(detectPermissionDenial("opencode", "listen EPERM")).toBeNull();
  });
});
