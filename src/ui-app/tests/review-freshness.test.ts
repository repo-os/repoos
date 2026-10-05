import { describe, expect, it } from "vitest";
import {
  reportPredatesLatestHandoff,
  reviewSupersededByFixRound,
} from "../src/lib/reviewFreshness";

const task = {
  body: "## Activity\n\n- 2026-09-27T23:08:22Z · status active→review\n- 2026-09-27T23:20:31Z · status review→active\n- 2026-09-27T23:36:46Z · status active→review\n",
};

describe("review report freshness", () => {
  it("treats the prior round's report as outdated after a new handoff", () => {
    expect(reportPredatesLatestHandoff(task, "2026-09-27T23:18:30Z")).toBe(true);
  });

  it("accepts a report produced after the latest handoff", () => {
    expect(reportPredatesLatestHandoff(task, "2026-09-27T23:45:23.601Z")).toBe(false);
  });

  it("marks a report superseded while the engineer is fixing after review", () => {
    const bounced = {
      status: "active" as const,
      body: "## Activity\n\n- 2026-09-27T23:18:30Z · status review→active\n- 2026-09-27T23:36:46Z · status active→review\n",
    };
    expect(reviewSupersededByFixRound(bounced, "2026-09-27T23:10:00.000Z", true)).toBe(true);
    expect(reviewSupersededByFixRound(bounced, "2026-09-27T23:10:00.000Z", false)).toBe(true);
    expect(
      reviewSupersededByFixRound(
        { status: "active", body: "## Activity\n" },
        "2026-09-27T23:10:00.000Z",
        false,
      ),
    ).toBe(false);
    expect(reviewSupersededByFixRound(bounced, "2026-09-27T23:20:00.000Z", false)).toBe(false);
    expect(
      reviewSupersededByFixRound(
        { status: "review", body: bounced.body },
        "2026-09-27T23:10:00.000Z",
        false,
      ),
    ).toBe(false);
  });
});
