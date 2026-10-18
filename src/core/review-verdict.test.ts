import { describe, expect, it } from "vitest";
import {
  parseReviewRelevance,
  parseReviewVerdict,
  replaceReviewVerdict,
  stripReviewVerdictPrefix,
  verdictSummaryForNeedsInput,
} from "./review-verdict.js";

describe("parseReviewVerdict", () => {
  it("returns null for empty/missing markdown", () => {
    expect(parseReviewVerdict(null)).toBeNull();
    expect(parseReviewVerdict(undefined)).toBeNull();
    expect(parseReviewVerdict("")).toBeNull();
  });

  it("parses the backtick-wrapped form the prompt asks for", () => {
    expect(parseReviewVerdict("## Verdict\n`good to go` — nothing blocks sign-off.")).toBe(
      "good to go",
    );
  });

  // #0402: opencode-go/mimo-v2.5 wrote the verdict in markdown bold instead
  // of backticks. The old strict parser missed this entirely and the
  // auto-bounce gate silently never fired — see review-verdict.ts's doc
  // comment. The UI badge already handled this correctly; this locks that
  // same tolerance into the shared parser both sides now use.
  it("parses a bold-wrapped verdict", () => {
    expect(
      parseReviewVerdict(
        "## Verdict\n**needs some work** — the tab UI is good but two bugs remain.",
      ),
    ).toBe("needs some work");
  });

  it("parses a plain, unwrapped verdict", () => {
    expect(parseReviewVerdict("## Verdict\nback to the drawing board.")).toBe(
      "back to the drawing board",
    );
  });

  it("prefers the worse verdict when a milder one is only mentioned in passing", () => {
    expect(
      parseReviewVerdict(
        "## Verdict\nback to the drawing board — closer work would only need some work, but this misses the mark entirely.",
      ),
    ).toBe("back to the drawing board");
  });

  it("uses the declared verdict instead of later mentions in suggestions", () => {
    expect(
      parseReviewVerdict(
        "## Verdict\n`good to go` — nothing blocks sign-off.\n\n## Suggestions\nTest needs some work and back to the drawing board paths too.",
      ),
    ).toBe("good to go");
  });

  it("is case-insensitive", () => {
    expect(parseReviewVerdict("## Verdict\nGood To Go.")).toBe("good to go");
  });

  it("returns null when no known verdict phrase is present", () => {
    expect(parseReviewVerdict("## Bugs\nNone found.")).toBeNull();
  });

  it("scans the full document for legacy reports without a Verdict heading", () => {
    expect(
      parseReviewVerdict(
        "## Summary\nStill reviewing.\n\n## Outcome\ngood to go — ship it when ready.",
      ),
    ).toBe("good to go");
  });
});

describe("stripReviewVerdictPrefix (#0832)", () => {
  it("removes a backtick-wrapped verdict and em dash", () => {
    expect(stripReviewVerdictPrefix("`needs some work` — three defects remain.")).toBe(
      "three defects remain.",
    );
  });

  it("removes a bold-wrapped verdict", () => {
    expect(
      stripReviewVerdictPrefix("**needs some work** — contrast audit still fails."),
    ).toBe("contrast audit still fails.");
  });
});

describe("verdictSummaryForNeedsInput (#0832)", () => {
  it("caps the why portion at 120 characters", () => {
    const why = "x".repeat(200);
    const md = `## Verdict\n\`needs some work\` — ${why}\n`;
    const summary = verdictSummaryForNeedsInput(md);
    expect(summary).toMatch(/^`needs some work` — /);
    expect(summary!.length).toBeLessThanOrEqual("`needs some work` — ".length + 120);
    expect(summary).toContain("…");
  });
});

describe("replaceReviewVerdict (#0714)", () => {
  it("swaps the verdict label inside ## Verdict", () => {
    const src = "## Verdict\n`good to go` — ship it.\n\n## Bugs\nNone found.\n";
    expect(replaceReviewVerdict(src, "needs some work")).toContain("`needs some work`");
    expect(parseReviewVerdict(replaceReviewVerdict(src, "needs some work"))).toBe(
      "needs some work",
    );
  });
});

describe("parseReviewRelevance", () => {
  it("parses a bold-wrapped relevance label", () => {
    expect(
      parseReviewRelevance("## Relevance\n**still relevant** — the problem remains unsolved."),
    ).toBe("still relevant");
  });

  it("returns null for empty/missing markdown", () => {
    expect(parseReviewRelevance(null)).toBeNull();
  });
});
