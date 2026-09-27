import { describe, expect, it } from "vitest";
import {
  UNDERSPECIFIED_MIN_BODY_CHARS,
  assessTaskUnderspecified,
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
