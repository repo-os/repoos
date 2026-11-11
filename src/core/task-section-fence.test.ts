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
});
