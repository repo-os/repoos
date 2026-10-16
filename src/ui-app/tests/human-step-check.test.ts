/**
 * #0804 — server wiring for the optional human-step decision check.
 *
 * The provider is always injected; no test touches the network. Covers the
 * outcome mapping (off / shadow / agent / human / unavailable / failure) and
 * the persistence contract: an "agent" verdict suppresses the keyword check
 * while the acceptance criteria are unchanged, and stops suppressing when they
 * change.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import {
  HUMAN_STEP_QUESTION_ID,
  HUMAN_STEP_REASON_QUESTION_ID,
} from "../../core/human-step-decision.js";
import { needsHumanStepFingerprint } from "../../core/task-underspecified.js";
import {
  RoutingProviderError,
  type RoutingAnswer,
  type RoutingDecisionProvider,
} from "../../core/model-routing/types.js";
import { runHumanStepDecisionCheck } from "../../server/human-step-decision.js";
import { flagNeedsHumanStepIfNeeded } from "../../server/task-underspecified-flag.js";

function baseConfig(root: string, modelRouting: RepoOSConfig["modelRouting"]): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    modelRouting,
  };
}

function answers(probability: number, reason: string): Record<string, RoutingAnswer> {
  return {
    [HUMAN_STEP_QUESTION_ID]: { id: HUMAN_STEP_QUESTION_ID, type: "noul", probability },
    [HUMAN_STEP_REASON_QUESTION_ID]: {
      id: HUMAN_STEP_REASON_QUESTION_ID,
      type: "choice",
      choice: reason,
      confidence: 0.9,
      probabilities: { [reason]: 0.9 },
    },
  };
}

function fakeProvider(
  answer: Record<string, RoutingAnswer> | (() => never),
): RoutingDecisionProvider {
  return {
    id: "jev",
    decide: async () => {
      if (typeof answer === "function") answer();
      return { model: "fake", answers: answer as Record<string, RoutingAnswer>, usage: null };
    },
  };
}

const TASK: Pick<Task, "id" | "title" | "body"> = {
  id: "0804",
  title: "Rotate the signing keys",
  body: "## Acceptance criteria\n\n- [ ] Rotate the API keys in the dev config\n",
};

describe("runHumanStepDecisionCheck outcome mapping (#0804)", () => {
  const automatic = { mode: "automatic" as const, provider: "jev" as const, humanStepCheck: true };

  it("is off when the setting is unset (default)", async () => {
    const config = baseConfig("/tmp/repoos-nope", { mode: "automatic", provider: "jev" });
    const result = await runHumanStepDecisionCheck(config, TASK, {
      provider: fakeProvider(answers(0.9, "account")),
      recordUsage: false,
    });
    expect(result.outcome).toBe("off");
  });

  it("blocks and explains when the model says a human step is needed", async () => {
    const config = baseConfig("/tmp/repoos-nope", automatic);
    const result = await runHumanStepDecisionCheck(config, TASK, {
      provider: fakeProvider(answers(0.93, "account")),
      recordUsage: false,
    });
    expect(result.outcome).toBe("human");
    expect(result.detail).toContain("split");
    expect(result.decision?.needsHumanStep).toBe(true);
  });

  it("starts the task when the model says an agent can do it", async () => {
    const config = baseConfig("/tmp/repoos-nope", automatic);
    const result = await runHumanStepDecisionCheck(config, TASK, {
      provider: fakeProvider(answers(0.05, "none")),
      recordUsage: false,
    });
    expect(result.outcome).toBe("agent");
    expect(result.decision?.needsHumanStep).toBe(false);
  });

  it("records but never blocks in shadow mode", async () => {
    const config = baseConfig("/tmp/repoos-nope", {
      mode: "shadow",
      provider: "jev",
      humanStepCheck: true,
    });
    const result = await runHumanStepDecisionCheck(config, TASK, {
      provider: fakeProvider(answers(0.99, "device")),
      recordUsage: false,
    });
    expect(result.outcome).toBe("shadow");
    expect(result.decision?.needsHumanStep).toBe(true);
  });

  it("is unavailable when no provider can be built", async () => {
    const config = baseConfig("/tmp/repoos-nope", automatic);
    const result = await runHumanStepDecisionCheck(config, TASK, {
      provider: null,
      recordUsage: false,
    });
    expect(result.outcome).toBe("unavailable");
  });

  it("falls back on a provider failure instead of blocking", async () => {
    const config = baseConfig("/tmp/repoos-nope", automatic);
    const result = await runHumanStepDecisionCheck(config, TASK, {
      provider: fakeProvider(() => {
        throw new RoutingProviderError("auth", "bad key");
      }),
      recordUsage: false,
    });
    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("bad key");
  });
});

describe("human-step verdict suppresses the keyword check (#0804)", () => {
  /** A 'keys' task the keyword heuristic would flag. */
  const KEYS_BODY = `## Problem

Replace the token store.

## Desired UX

N/A

## Acceptance criteria

- [ ] The dev config no longer reads the API keys from disk
- [ ] Tests still pass

## Notes for AI

Standard.
`;

  function fixture(bodyLabel: string, body: string) {
    const root = mkdtempSync(join(tmpdir(), "repoos-human-step-"));
    const workDir = join(root, "work");
    mkdirSync(workDir, { recursive: true });
    const taskPath = join(workDir, "0804-keys.md");
    writeFileSync(
      taskPath,
      `---
id: "0804"
title: Keys task
type: feature
status: ready
priority: p2
area: server
assigned_to: ai
${bodyLabel}---
${body}`,
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
    const config = baseConfig(root, {});
    const task = parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
    return {
      root,
      taskPath,
      config,
      task,
      reread: () =>
        parseTask({
          content: readFileSync(taskPath, "utf8"),
          absPath: taskPath,
          root,
          defaultStatus: config.defaultStatus,
          defaultAssignee: config.defaultAssignee,
        }),
      clean: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  it("flags the keyword match when there is no model verdict", () => {
    const fx = fixture("", KEYS_BODY);
    try {
      const flagged = flagNeedsHumanStepIfNeeded(fx.config, fx.task);
      expect(flagged?.needsInputReason).toBe("needs-human-step");
    } finally {
      fx.clean();
    }
  });

  it("does not flag an agent-doable 'keys' task when the model says no", () => {
    const fx = fixture("", KEYS_BODY);
    try {
      const flagged = flagNeedsHumanStepIfNeeded(fx.config, fx.task, {
        humanStepDecision: "agent",
      });
      expect(flagged).toBeNull();
    } finally {
      fx.clean();
    }
  });

  it("a persisted 'agent' verdict suppresses the check while the criteria are unchanged", () => {
    const key = needsHumanStepFingerprint(KEYS_BODY);
    const fx = fixture(`human_step_decision: agent\nhuman_step_decision_key: ${key}\n`, KEYS_BODY);
    try {
      expect(fx.task.humanStepDecision).toBe("agent");
      expect(flagNeedsHumanStepIfNeeded(fx.config, fx.task)).toBeNull();
    } finally {
      fx.clean();
    }
  });

  it("a changed body invalidates a persisted 'agent' verdict", () => {
    const key = needsHumanStepFingerprint(KEYS_BODY);
    const changed = KEYS_BODY.replace(
      "- [ ] Tests still pass",
      "- [ ] Verify on a real device with production credentials",
    );
    const fx = fixture(`human_step_decision: agent\nhuman_step_decision_key: ${key}\n`, changed);
    try {
      const flagged = flagNeedsHumanStepIfNeeded(fx.config, fx.task);
      expect(flagged?.needsInputReason).toBe("needs-human-step");
    } finally {
      fx.clean();
    }
  });

  it("clears a stale keyword flag when the model says no", () => {
    const fx = fixture("needs_input: true\nneeds_input_reason: needs-human-step\n", KEYS_BODY);
    try {
      const cleared = flagNeedsHumanStepIfNeeded(fx.config, fx.task, {
        humanStepDecision: "agent",
      });
      expect(cleared).not.toBeNull();
      expect(cleared!.needsInput).toBe(false);
      expect(fx.reread().needsInput).toBe(false);
    } finally {
      fx.clean();
    }
  });

  it("preserves a persisted 'human' verdict when the keyword check would miss or reword it", () => {
    // No word the regex matches, so without the model guard the check would
    // clear the model's flag on the next sweep.
    const cleanBody = KEYS_BODY.replace(
      "- [ ] The dev config no longer reads the API keys from disk",
      "- [ ] The token store is replaced",
    );
    const key = needsHumanStepFingerprint(cleanBody);
    const fx = fixture(
      `needs_input: true\nneeds_input_reason: needs-human-step\nneeds_input_detail: Decision model says so\nhuman_step_decision: human\nhuman_step_decision_key: ${key}\n`,
      cleanBody,
    );
    try {
      expect(flagNeedsHumanStepIfNeeded(fx.config, fx.task)).toBeNull();
      expect(fx.reread().needsInputReason).toBe("needs-human-step");
    } finally {
      fx.clean();
    }
  });
});
