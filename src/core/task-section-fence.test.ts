import { describe, expect, it } from "vitest";
import { extractSection, removeSection, replaceSection } from "./task.js";

const FENCE = "```";
const BODY = [
  "## Problem",
  "",
  "x",
  "",
  "## Step-by-step guide",
  "",
  `${FENCE}md`,
  "## Example heading",
  FENCE,
  "",
  "1. Do it.",
  "",
  "## Activity",
  "",
  "- 2026-11-12T00:00:00Z · created",
  "",
].join("\n");

describe("section scanning ignores ## lines inside fenced code (#1074)", () => {
  it("extractSection keeps a fenced ## line inside its section", () => {
    const s = extractSection(BODY, "## Step-by-step guide");
    expect(s).toContain("## Example heading");
    expect(s).toContain("1. Do it.");
    expect(s).not.toContain("## Activity");
  });

  it("replaceSection replaces the whole section, fence included", () => {
    const out = replaceSection(BODY, "## Step-by-step guide", "## Step-by-step guide\n\n1. New.");
    expect(out).not.toContain("Example heading");
    expect(out).toContain("1. New.");
    expect(out).toContain("## Activity");
    expect(out.split(FENCE).length - 1).toBe(0);
  });

  it("removeSection removes the whole section, fence included", () => {
    const out = removeSection(BODY, "## Step-by-step guide");
    expect(out).not.toContain("Example heading");
    expect(out).not.toContain(FENCE);
    expect(out).toContain("## Problem");
    expect(out).toContain("## Activity");
  });

  it("a closing fence with an info string does not end the fence", () => {
    const body = ["## A", "", "````", `${FENCE}md`, "## Inside", "````", "", "## B", "b"].join(
      "\n",
    );
    expect(extractSection(body, "## A")).toContain("## Inside");
    expect(extractSection(body, "## A")).not.toContain("## B");
  });

  it("a heading shown inside a fenced sample ahead of the real section is ignored", () => {
    const body = [
      "## Problem",
      "",
      `${FENCE}md`,
      "## Step-by-step guide",
      "1. sample",
      FENCE,
      "",
      "## Step-by-step guide",
      "",
      "1. real",
      "",
      "## Acceptance criteria",
      "",
      "- ok",
    ].join("\n");
    expect(extractSection(body, "## Step-by-step guide")).toContain("1. real");
    expect(extractSection(body, "## Step-by-step guide")).not.toContain("1. sample");
    const out = replaceSection(body, "## Step-by-step guide", "## Step-by-step guide\n\n1. New.");
    expect(out).toContain("## Acceptance criteria");
    expect(out).toContain("1. sample");
    expect(out).toContain("1. New.");
    expect(out).not.toContain("1. real");
  });

  it("inline code that starts with backticks is not a fence opener", () => {
    const body = ["## A", "", "```inline``` text", "", "## B", "b"].join("\n");
    expect(extractSection(body, "## A")).not.toContain("## B");
    expect(extractSection(body, "## B")).toContain("b");
  });

  it("an unclosed fence is plain text and hides nothing after it", () => {
    const body = ["## Problem", "", FENCE, "", "## Acceptance criteria", "", "- [ ] a"].join("\n");
    expect(extractSection(body, "## Acceptance criteria")).toContain("- [ ] a");
    expect(extractSection(body, "## Problem")).not.toContain("## Acceptance criteria");
    const replaced = replaceSection(
      body,
      "## Acceptance criteria",
      "## Acceptance criteria\n\n- [ ] b",
    );
    expect(replaced.match(/## Acceptance criteria/g)).toHaveLength(1);
    expect(removeSection(body, "## Acceptance criteria")).not.toContain("Acceptance");
  });
});
