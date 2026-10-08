import { describe, expect, it } from "vitest";
import { normalizeTaskBody, taskBodyNeedsNormalize } from "./task.js";
import { extractSection, ACTIVITY_HEADING } from "./task.js";

/** tuk-private #0004-style: duplicate Activity headings back-to-back. */
const DOUBLE_ACTIVITY = `## Problem

Missing feature.

## Activity

- 2026-10-05T01:00:00Z · created

## Activity

- 2026-10-05T02:00:00Z · status inbox→ready
`;

/** tuk-private #0006-style: spec indented, trailing Activity flush. */
const INDENTED_SPEC_TRAILING_ACTIVITY = `  ## Problem

  Whole spec block indented.

  ## Activity

  - 2026-10-05T01:00:00Z · created

## Activity

- 2026-10-05T02:00:00Z · cli_override
`;

describe("normalizeTaskBody (#0702)", () => {
  it("merges duplicate ## Activity sections in order", () => {
    const out = normalizeTaskBody(DOUBLE_ACTIVITY);
    expect(out.split(ACTIVITY_HEADING).length - 1).toBe(1);
    const activity = extractSection(out, ACTIVITY_HEADING);
    expect(activity).toContain("· created");
    expect(activity).toContain("inbox→ready");
    expect(activity!.indexOf("created")).toBeLessThan(activity!.indexOf("inbox→ready"));
  });

  it("strips a common leading indent and merges Activity", () => {
    const out = normalizeTaskBody(INDENTED_SPEC_TRAILING_ACTIVITY);
    expect(out.startsWith("## Problem")).toBe(true);
    expect(out.split(ACTIVITY_HEADING).length - 1).toBe(1);
    const activity = extractSection(out, ACTIVITY_HEADING);
    expect(activity).toContain("· created");
    expect(activity).toContain("cli_override");
  });

  it("leaves an already-canonical body unchanged", () => {
    const canonical = `## Problem

Fine.

## Activity

- 2026-10-05T01:00:00Z · created
`;
    expect(taskBodyNeedsNormalize(canonical)).toBe(false);
    expect(normalizeTaskBody(canonical)).toBe(canonical);
  });

  it("strips uniform two-space indent on the whole body", () => {
    const indented = `  ## Problem

  Text.

  ## Activity

  - 2026-10-05T01:00:00Z · created
`;
    const out = normalizeTaskBody(indented);
    expect(out.startsWith("## Problem")).toBe(true);
    expect(out.split(ACTIVITY_HEADING).length - 1).toBe(1);
  });
});
