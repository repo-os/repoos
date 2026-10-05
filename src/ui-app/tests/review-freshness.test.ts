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
    expect(reviewSupersededByFixRound({ status: "active" }, true, true)).toBe(true);
    expect(reviewSupersededByFixRound({ status: "active" }, true, false)).toBe(true);
    expect(reviewSupersededByFixRound({ status: "review" }, true, false)).toBe(false);
  });
});
