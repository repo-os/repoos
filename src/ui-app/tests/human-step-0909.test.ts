/**
 * #0909 — sticky human-step overrides, model-before-keyword flagging, tags/split.
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import type { RepoOSConfig } from "../../core/types.js";
import {
  HUMAN_STEP_CLEARED_OVERRIDE_REASON,
  humanStepOverrideSuppresses,
} from "../../core/human-step-override.js";
import {
  HUMAN_STEP_QUESTION_ID,
  HUMAN_STEP_REASON_QUESTION_ID,
} from "../../core/human-step-decision.js";
import { needsHumanStepFingerprint } from "../../core/task-underspecified.js";
import type { RoutingAnswer } from "../../core/model-routing/types.js";
import { patchTaskFile } from "../../server/write.js";
import { flagNeedsHumanStepIfNeededAsync } from "../../server/task-underspecified-flag.js";
import { splitHumanStepTask } from "../../server/human-step-split.js";

function baseConfig(root: string, modelRouting?: RepoOSConfig["modelRouting"]): RepoOSConfig {
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

const KEYS_BODY = `## Problem

Rotate keys.

## Desired UX

N/A

## Acceptance criteria

- [ ] The dev config no longer reads the API keys from disk
- [ ] Tests still pass

## Notes for AI

Standard.
`;

function taskFile(id: string, extra = "", body = KEYS_BODY): string {
  return `---
id: "${id}"
title: Keys
type: feature
status: inbox
priority: p2
area: server
assigned_to: ai
${extra}---
${body}`;
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

describe("sticky human-step override (#0909)", () => {
  it("suppresses while the fingerprint matches and re-evaluates after criteria change", () => {
    const config = baseConfig("/tmp");
    const fp = needsHumanStepFingerprint(KEYS_BODY);
    const withOverride = {
      body: KEYS_BODY,
      humanStepOverride: "false positive",
      humanStepOverrideKey: fp,
    };
    expect(humanStepOverrideSuppresses(config, withOverride)).toBe(true);
    const changed = KEYS_BODY.replace("Tests still pass", "Verify on a real device");
    expect(humanStepOverrideSuppresses(config, { ...withOverride, body: changed })).toBe(false);
  });

  it("records fingerprint when needs_input is cleared through patchTaskFile", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-sticky-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const path = join(work, "0909.md");
    writeFileSync(
      path,
      taskFile("0909", "needs_input: true\nneeds_input_reason: needs-human-step\n"),
    );
    const config = baseConfig(root);
    try {
      const cleared = patchTaskFile(config, path, { needsInput: false }, { actor: "human@test" });
      expect(cleared.humanStepOverrideKey).toBe(needsHumanStepFingerprint(KEYS_BODY));
      expect(cleared.humanStepOverrideBy).toBe("human@test");
      expect(cleared.humanStepOverride).toBe(HUMAN_STEP_CLEARED_OVERRIDE_REASON);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not re-flag after clear until acceptance criteria change", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-sticky-flag-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const path = join(work, "0909b.md");
    const fp = needsHumanStepFingerprint(KEYS_BODY);
    writeFileSync(
      path,
      taskFile(
        "0909b",
        `human_step_override: ${HUMAN_STEP_CLEARED_OVERRIDE_REASON}\nhuman_step_override_key: ${fp}\n`,
      ),
    );
    const config = baseConfig(root);
    try {
      const task = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(await flagNeedsHumanStepIfNeededAsync(config, task)).toBeNull();
      const editedProblem = KEYS_BODY.replace("Rotate keys.", "Rotate keys with more context.");
      writeFileSync(
        path,
        taskFile(
          "0909b",
          `human_step_override: ${HUMAN_STEP_CLEARED_OVERRIDE_REASON}\nhuman_step_override_key: ${fp}\n`,
          editedProblem,
        ),
      );
      const afterBodyEdit = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(await flagNeedsHumanStepIfNeededAsync(config, afterBodyEdit)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("model check before keyword (#0909)", () => {
  it("does not flag when the model says the mention is not a human step", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-model-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const path = join(work, "0909c.md");
    writeFileSync(path, taskFile("0909c"));
    const config = baseConfig(root, {
      mode: "automatic",
      provider: "jev",
      humanStepCheck: true,
    });
    try {
      const task = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      vi.spyOn(
        await import("../../server/human-step-decision.js"),
        "runHumanStepDecisionCheck",
      ).mockImplementation(async () => ({
        outcome: "agent",
        decision: {
          needsHumanStep: false,
          probability: 0.1,
          reason: "none",
          explanation:
            "Decision model (10%): no step only a human can do — an AI agent can do this task.",
        },
      }));
      const flagged = await flagNeedsHumanStepIfNeededAsync(config, task);
      expect(flagged?.needsInput).not.toBe(true);
      expect(flagged?.humanStepDecision).toBe("agent");
      vi.restoreAllMocks();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags with quoted criterion when the model says a human is required", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-model-human-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const path = join(work, "0909d.md");
    writeFileSync(path, taskFile("0909d"));
    const config = baseConfig(root, {
      mode: "automatic",
      provider: "jev",
      humanStepCheck: true,
    });
    try {
      const task = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      vi.spyOn(
        await import("../../server/human-step-decision.js"),
        "runHumanStepDecisionCheck",
      ).mockImplementation(async () => ({
        outcome: "human",
        detail:
          "Decision model (91%): split this into an AI task and a human task — it needs a real account, credential, or API key.",
        decision: {
          needsHumanStep: true,
          probability: 0.91,
          reason: "account",
          explanation:
            "Decision model (91%): split this into an AI task and a human task — it needs a real account, credential, or API key.",
        },
      }));
      const flagged = await flagNeedsHumanStepIfNeededAsync(config, task);
      expect(flagged?.needsInputReason).toBe("needs-human-step");
      expect(flagged?.needsInputDetail).toContain('Criterion "');
      expect(flagged?.needsInputDetail).toContain("Decision model");
      vi.restoreAllMocks();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("split human-step tasks (#0909)", () => {
  const mixedBody = KEYS_BODY.replace(
    "## Acceptance criteria\n\n- [ ] The dev config",
    "## Acceptance criteria\n\n- [ai] The dev config",
  ).replace(
    "- [ ] Tests still pass",
    "- [human] Verify on a real device with production credentials",
  );

  it("creates a held human task that depends on the AI task", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-split-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root });
    const path = join(work, "0909e.md");
    writeFileSync(path, taskFile("0909e", "", mixedBody));
    const config = baseConfig(root);
    try {
      const task = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      const result = await splitHumanStepTask(config, task, "cli");
      expect(result.humanTask.isHeld).toBe(true);
      expect(result.humanTask.assignee).toBe("human");
      expect(result.humanTask.dependsOn).toEqual(["0909e"]);
      expect(result.source.body).not.toContain("[human]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
