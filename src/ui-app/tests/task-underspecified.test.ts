import { describe, expect, it } from "vitest";
import {
  UNDERSPECIFIED_MIN_BODY_CHARS,
  assessTaskUnderspecified,
  assessTaskNeedsHumanStep,
  fleshOutRequirementsPrompt,
  splitHumanStepRequirementsPrompt,
  NEEDS_HUMAN_STEP_HINT,
} from "../../core/task-underspecified.js";
import { needsInputClearsOnSuccessfulReview } from "../../core/needs-input.js";

const SUBSTANTIVE =
  "Enough detail here to describe intent, constraints, and verification without tripping the short-body heuristic.";

function wellFormedBody(): string {
  return [
    "## Problem",
    "",
    SUBSTANTIVE.repeat(3),
    "",
    "## Desired UX",
    "",
    SUBSTANTIVE.repeat(3),
    "",
    "## Acceptance criteria",
    "",
    "- [ ] Users can complete the flow end to end",
    "- [ ] Automated checks cover the new behavior",
    "",
    "## Notes for AI",
    "",
    SUBSTANTIVE.repeat(2),
    "",
    "## Activity",
    "",
    "- 2026-01-01T00:00:00Z · created",
  ].join("\n");
}

describe("assessTaskUnderspecified", () => {
  it("builds explicit instructions for splitting or overriding human steps", () => {
    const prompt = splitHumanStepRequirementsPrompt();
    expect(prompt).toContain("--human-step-override");
    expect(prompt).toContain("--depends-on <id>");
    expect(prompt).toContain("--assigned-to human --hold true");
    expect(prompt).toContain("Never hand-edit task files");
    expect(prompt).toContain("fakes or fixtures");
  });
  const bundleBody = (omitE2Acceptance = false) => {
    const part = (id: string) => [
      `## ${id} · Fix ${id}`,
      "",
      "### Problem",
      "",
      SUBSTANTIVE.repeat(2),
      "",
      "### Desired UX",
      "",
      SUBSTANTIVE.repeat(2),
      "",
      "### Acceptance criteria",
      "",
      "- [ ] The behavior is covered by a focused regression test.",
      "",
      "### Notes for AI",
      "",
      SUBSTANTIVE.repeat(2),
    ];
    const e2 = part("E2");
    if (omitE2Acceptance) {
      const at = e2.indexOf("### Acceptance criteria");
      e2.splice(at, 2);
      e2.splice(e2.indexOf("- [ ] The behavior is covered by a focused regression test."), 1);
    }
    return ["## Items", "", "- [ ] E1", "- [ ] E2", "", ...part("E1"), "", ...e2].join("\n");
  };

  it("accepts the documented per-item bundle layout", () => {
    const result = assessTaskUnderspecified(bundleBody());
    expect(result.underspecified).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("names the bundle item and subsection when an item is incomplete", () => {
    const result = assessTaskUnderspecified(bundleBody(true));
    expect(result.underspecified).toBe(true);
    expect(result.detail).toContain("E2: missing Acceptance criteria");
  });

  it("keeps the PM instructions compatible with bundle structure", () => {
    const prompt = fleshOutRequirementsPrompt(undefined, "core");
    expect(prompt).toContain("do not flatten them into task-level sections");
  });

  it("does not flag a well-formed task body", () => {
    const result = assessTaskUnderspecified(wellFormedBody());
    expect(result.underspecified).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it("flags missing required sections", () => {
    const body = `## Original prompt\n\nRough idea only.\n`;
    const result = assessTaskUnderspecified(body);
    expect(result.underspecified).toBe(true);
    expect(result.detail).toContain("missing sections:");
    expect(result.detail).toContain("Problem");
  });

  it("flags when the body is only the original prompt", () => {
    const body = `## Original prompt\n\nShip widgets faster.\n`;
    const result = assessTaskUnderspecified(body);
    expect(result.underspecified).toBe(true);
    expect(result.detail).toContain("body is only the original prompt");
  });

  it("flags empty required sections", () => {
    const body = [
      "## Problem",
      "",
      "Real problem text.",
      "",
      "## Desired UX",
      "",
      "_What should the end experience be?_",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] ...",
      "",
      "## Notes for AI",
      "",
      SUBSTANTIVE,
    ].join("\n");
    const result = assessTaskUnderspecified(body);
    expect(result.underspecified).toBe(true);
    expect(result.detail).toContain("empty sections:");
    expect(result.detail).toContain("Desired UX");
  });

  it(`flags bodies under ${UNDERSPECIFIED_MIN_BODY_CHARS} characters excluding original prompt`, () => {
    const body = [
      "## Problem",
      "",
      "Short.",
      "",
      "## Desired UX",
      "",
      "Also short.",
      "",
      "## Acceptance criteria",
      "",
      "- [ ] One thing",
      "",
      "## Notes for AI",
      "",
      "Brief.",
      "",
      "## Original prompt",
      "",
      "The user's raw prompt that should not count toward length.",
    ].join("\n");
    const result = assessTaskUnderspecified(body);
    expect(result.underspecified).toBe(true);
    expect(result.detail).toContain(`body under ${UNDERSPECIFIED_MIN_BODY_CHARS} characters`);
  });

  it("flags unfilled placeholder markers", () => {
    const body = [
      "## Problem",
      "",
      "TODO",
      "",
      "## Desired UX",
      "",
      SUBSTANTIVE,
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Done when shipped",
      "",
      "## Notes for AI",
      "",
      SUBSTANTIVE,
    ].join("\n");
    const result = assessTaskUnderspecified(body);
    expect(result.underspecified).toBe(true);
    expect(result.detail).toContain("placeholder markers");
  });

  it("does not require Desired UX for non-UI areas", () => {
    const body = [
      "## Problem",
      "",
      SUBSTANTIVE.repeat(3),
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Automated checks pass",
      "",
      "## Notes for AI",
      "",
      SUBSTANTIVE.repeat(2),
    ].join("\n");
    const result = assessTaskUnderspecified(body, { area: "server" });
    expect(result.underspecified).toBe(false);
    expect(result.detail).not.toContain("Desired UX");
  });

  it("does not flag prose that merely mentions TODO or TBD", () => {
    const body = [
      "## Problem",
      "",
      SUBSTANTIVE.repeat(3),
      "",
      "## Desired UX",
      "",
      SUBSTANTIVE.repeat(3),
      "",
      "## Acceptance criteria",
      "",
      "- [ ] Unfilled placeholder markers (`TODO`, `TBD`, `<placeholder>`) trip the heuristic",
      "- [ ] A well-formed task passes",
      "",
      "## Notes for AI",
      "",
      SUBSTANTIVE.repeat(2),
    ].join("\n");
    const result = assessTaskUnderspecified(body);
    expect(result.detail).not.toContain("placeholder markers");
  });

  it("skips a task assigned to a human (#0815)", () => {
    const stub = "## Original prompt\n\nRough idea only.\n";
    expect(assessTaskUnderspecified(stub, { assignee: "human" }).underspecified).toBe(false);
    // The same stub still flags for an AI task.
    expect(assessTaskUnderspecified(stub, { assignee: "ai" }).underspecified).toBe(true);
  });
});

describe("assessTaskNeedsHumanStep (#0698)", () => {
  const wellFormed = [
    "## Problem",
    "",
    SUBSTANTIVE.repeat(3),
    "",
    "## Desired UX",
    "",
    SUBSTANTIVE.repeat(3),
    "",
    "## Acceptance criteria",
    "",
    "- [ ] Unit tests pass",
    "",
    "## Notes for AI",
    "",
    SUBSTANTIVE.repeat(2),
  ].join("\n");

  it("does not flag ordinary agent-only acceptance criteria", () => {
    const result = assessTaskNeedsHumanStep(wellFormed);
    expect(result.needsHumanStep).toBe(false);
  });

  it("flags real-device and credential requirements in acceptance criteria", () => {
    const body = wellFormed.replace(
      "- [ ] Unit tests pass",
      "- [ ] Verify on a real device with production credentials\n- [ ] Firebase project registered",
    );
    const result = assessTaskNeedsHumanStep(body);
    expect(result.needsHumanStep).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.detail).toContain(NEEDS_HUMAN_STEP_HINT.slice(0, 40));
  });

  it("skips a task assigned to a human (#0815)", () => {
    const body = wellFormed.replace(
      "- [ ] Unit tests pass",
      "- [ ] Verify on a real device with production credentials",
    );
    expect(assessTaskNeedsHumanStep(body, { assignee: "human" }).needsHumanStep).toBe(false);
    expect(assessTaskNeedsHumanStep(body, { assignee: "ai" }).needsHumanStep).toBe(true);
  });
});

describe("underspecified needs_input review clear rules", () => {
  it("is not cleared by a successful review run", () => {
    expect(
      needsInputClearsOnSuccessfulReview({
        status: "review",
        needsInputReason: "underspecified",
      }),
    ).toBe(false);
  });
});
