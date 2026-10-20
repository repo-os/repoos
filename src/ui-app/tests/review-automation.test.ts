/**
 * #0865 — shared review automation gate per trigger path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_RUN_TRIGGERS,
  decideReviewAutomation,
  isExplicitReviewTrigger,
} from "../../server/review-automation.js";
import * as reviewTreeIdentity from "../../server/review-tree-identity.js";
import {
  openFindingsSameTreeDecision,
  type ReviewGuardReport,
} from "../../server/review-tree-identity.js";
import type { RepoOSConfig, Task } from "../../core/types";

const config = { root: "/tmp", cacheDir: ".repoos", workDir: "work" } as RepoOSConfig;
const task = { id: "0865", branch: "feat/x" } as Task;

const openReport: ReviewGuardReport = {
  state: "ok",
  markdown: "## Verdict\nneeds some work\n",
  treeIdentity: "abc:ev",
};

const sameTree = "abc:ev";

describe("decideReviewAutomation (#0865)", () => {
  afterEach(() => vi.restoreAllMocks());

  const automaticTriggers = Object.values(REVIEW_RUN_TRIGGERS).filter(
    (t) => !isExplicitReviewTrigger(t),
  );

  for (const trigger of automaticTriggers) {
    it(`${trigger} skips unchanged tree with open findings`, () => {
      const expected = openFindingsSameTreeDecision(openReport, sameTree, { manual: false });
      expect(expected.action).toBe("skip");
      vi.spyOn(reviewTreeIdentity, "decideAutomaticReview").mockReturnValue(expected);
      const decision = decideReviewAutomation(config, task, openReport, trigger);
      expect(decision.action).toBe("skip");
      expect(decision.trigger).toBe(trigger);
      expect(reviewTreeIdentity.decideAutomaticReview).toHaveBeenCalledWith(
        config,
        task,
        openReport,
        { manual: false },
      );
    });
  }

  it("explicit-again always runs on unchanged tree with open findings", () => {
    const expected = openFindingsSameTreeDecision(openReport, sameTree, { manual: true });
    expect(expected.action).toBe("run");
    vi.spyOn(reviewTreeIdentity, "decideAutomaticReview").mockReturnValue(expected);
    const decision = decideReviewAutomation(
      config,
      task,
      openReport,
      REVIEW_RUN_TRIGGERS.EXPLICIT_AGAIN,
    );
    expect(decision.action).toBe("run");
    expect(decision.trigger).toBe(REVIEW_RUN_TRIGGERS.EXPLICIT_AGAIN);
    expect(reviewTreeIdentity.decideAutomaticReview).toHaveBeenCalledWith(
      config,
      task,
      openReport,
      { manual: true },
    );
  });

  it("status-enter-review runs when HEAD/evidence identity changed", () => {
    const expected = openFindingsSameTreeDecision(openReport, "def:ev", { manual: false });
    expect(expected.action).toBe("run");
    vi.spyOn(reviewTreeIdentity, "decideAutomaticReview").mockReturnValue(expected);
    const decision = decideReviewAutomation(
      config,
      task,
      openReport,
      REVIEW_RUN_TRIGGERS.STATUS_ENTER_REVIEW,
    );
    expect(decision.action).toBe("run");
  });
});
