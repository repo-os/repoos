import { describe, expect, it } from "vitest";
import { parseReviewVerdict } from "../src/lib/reviewVerdict";

describe("parseReviewVerdict", () => {
  it("returns null for empty/missing markdown", () => {
    expect(parseReviewVerdict(null)).toBeNull();
    expect(parseReviewVerdict(undefined)).toBeNull();
    expect(parseReviewVerdict("")).toBeNull();
  });

  it("returns null when no known verdict phrase is present", () => {
    expect(parseReviewVerdict("## Bugs\nNone found.")).toBeNull();
  });

  it("parses 'good to go' as green", () => {
    const v = parseReviewVerdict("## Verdict\ngood to go — nothing blocks sign-off.");
    expect(v).toEqual({ label: "good to go", tone: "green" });
  });

  it("parses 'needs some work' as amber", () => {
    const v = parseReviewVerdict("## Verdict\nneeds some work — a few real defects.");
    expect(v).toEqual({ label: "needs some work", tone: "amber" });
  });

  it("parses 'back to the drawing board' as red", () => {
    const v = parseReviewVerdict(
      "## Verdict\nback to the drawing board\n\nDoesn't use the required components.",
    );
    expect(v).toEqual({ label: "back to the drawing board", tone: "red" });
  });

  it("is case-insensitive", () => {
    expect(parseReviewVerdict("## Verdict\nGood To Go.")).toEqual({
      label: "good to go",
      tone: "green",
    });
  });
});
