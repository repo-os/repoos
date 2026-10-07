/**
 * #0734 — required visual evidence: meaningful assertions, plan-fingerprint
 * reuse, and the reviewer's missing-evidence rule. Pure/unit level: no browser.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCapturePlan,
  describeShotAssertion,
  parseShotPlan,
  sameDeclaredShot,
  shotPlanFingerprint,
} from "../../core/shot-plan";
import {
  evaluateShotAssertions,
  evaluateShotAssertion,
  formatAssertionSummary,
  type AssertionPage,
} from "../../core/shot-assertions";
import { reviewMission } from "../../server/review";
import { preflightUiEvidence } from "../../server/ui-handoff-gate";
import { reusableAutoCaptures } from "../../server/shot-capture";
import * as shotCapture from "../../server/shot-capture";
import type { ShotMeta } from "../../server/shots";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

function bodyWithShots(json: string): string {
  return ["## Problem", "", "prose", "", "## Shots", "", "```json", json, "```", ""].join("\n");
}

/** A page whose `evaluate` answers with a fixed {count,text} for any selector. */
function fakePage(probe: { count: number; text: string }): AssertionPage {
  return {
    async evaluate<T>(): Promise<T> {
      return probe as unknown as T;
    },
  };
}

describe("declared shot assertions (#0734)", () => {
  it("parses a well-formed assert list", () => {
    const { shots, errors } = parseShotPlan(
      bodyWithShots('[{"route":"/","assert":[{"selector":".row","minCount":2,"label":"rows"}]}]'),
    );
    expect(errors).toEqual([]);
    expect(shots[0]?.assert).toEqual([{ selector: ".row", minCount: 2, label: "rows" }]);
  });

  it("rejects an assertion with nothing to check", () => {
    const { shots, errors } = parseShotPlan(
      bodyWithShots('[{"route":"/","assert":[{"label":"nothing"}]}]'),
    );
    expect(shots).toEqual([]);
    expect(errors[0]).toMatch(/needs a "selector" and\/or "text"/);
  });

  it("rejects count and minCount together", () => {
    const { errors } = parseShotPlan(
      bodyWithShots('[{"route":"/","assert":[{"selector":".x","count":1,"minCount":1}]}]'),
    );
    expect(errors[0]).toMatch(/either "count" or "minCount"/);
  });

  it("carries assertions into capture entries and the fingerprint", () => {
    const { shots } = parseShotPlan(
      bodyWithShots('[{"route":"/","label":"Board","assert":[{"selector":".row","minCount":1}]}]'),
    );
    const plan = buildCapturePlan(["default"], shots);
    expect(plan.entries[0]?.assert).toHaveLength(1);
    const fp1 = shotPlanFingerprint(plan.entries);
    // A plan with a DIFFERENT assertion fingerprints differently, so a stale
    // capture can never be reused for it.
    const other = buildCapturePlan(
      ["default"],
      [{ route: "/", label: "Board", assert: [{ selector: ".row", minCount: 3 }] }],
    );
    expect(shotPlanFingerprint(other.entries)).not.toBe(fp1);
  });

  it("treats two declarations as different when only their assertions differ", () => {
    const a = { route: "/", assert: [{ selector: ".row", minCount: 1 }] };
    const b = { route: "/", assert: [{ selector: ".row", minCount: 2 }] };
    expect(sameDeclaredShot(a, b)).toBe(false);
    expect(sameDeclaredShot(a, a)).toBe(true);
  });

  it("describes an assertion for failure details", () => {
    expect(describeShotAssertion({ selector: ".row", minCount: 2, label: "rows present" })).toBe(
      "rows present · selector .row · at least 2",
    );
    expect(describeShotAssertion({ text: "Saved", optional: true })).toBe(
      'text "Saved" · (optional)',
    );
  });
});

describe("evaluateShotAssertions (#0734)", () => {
  it("passes when the selector matches at least the minimum", async () => {
    const report = await evaluateShotAssertions(fakePage({ count: 3, text: "one two" }), [
      { selector: ".row", minCount: 2, label: "rows" },
    ]);
    expect(report.failures).toEqual([]);
    expect(report.outcomes[0]?.passed).toBe(true);
    expect(formatAssertionSummary(report)).toBe("1/1 assertion(s) passed");
  });

  it("blocks when a required selector matches nothing", async () => {
    const outcome = await evaluateShotAssertion(fakePage({ count: 0, text: "" }), {
      selector: ".review-row",
      label: "review rows present",
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.blocking).toBe(true);
    expect(outcome.detail).toContain("matched 0 element(s)");
  });

  it("enforces an exact count", async () => {
    const outcome = await evaluateShotAssertion(fakePage({ count: 2, text: "" }), {
      selector: ".row",
      count: 5,
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.detail).toContain("expected exactly 5");
  });

  it("checks required text", async () => {
    const pass = await evaluateShotAssertion(fakePage({ count: 1, text: "Saved changes" }), {
      selector: ".banner",
      text: "saved",
    });
    expect(pass.passed).toBe(true);
    const fail = await evaluateShotAssertion(fakePage({ count: 1, text: "Error" }), {
      selector: ".banner",
      text: "saved",
    });
    expect(fail.passed).toBe(false);
    expect(fail.detail).toContain('does not contain "saved"');
  });

  it("records an optional failure without blocking", async () => {
    const report = await evaluateShotAssertions(fakePage({ count: 0, text: "" }), [
      { selector: ".maybe", optional: true },
    ]);
    expect(report.outcomes[0]?.passed).toBe(false);
    expect(report.outcomes[0]?.blocking).toBe(false);
    expect(report.failures).toEqual([]);
  });

  it("checks a text-only assertion against the whole body", async () => {
    const outcome = await evaluateShotAssertion(fakePage({ count: 1, text: "No reviews yet" }), {
      text: "no reviews yet",
    });
    expect(outcome.passed).toBe(true);
  });
});

describe("stale capture reuse (#0734)", () => {
  const shot = (over: Partial<ShotMeta>): ShotMeta => ({
    name: "x-1.png",
    target: "web",
    path: "work/.attachments/1/shots/x-1.png",
    url: "/api/tasks/1/shots/x-1.png",
    size: 10,
    mime: "image/png",
    capturedAt: "2026-01-01T00:00:00Z",
    origin: "auto",
    ...over,
  });

  it("reuses a capture bound to the same plan and tree", () => {
    const shots = [shot({ planFingerprint: "fp-1", sourceIdentity: "abc" })];
    expect(reusableAutoCaptures(shots, "fp-1", "abc")).toHaveLength(1);
  });

  it("does NOT reuse a capture whose plan fingerprint changed", () => {
    const shots = [shot({ planFingerprint: "fp-old", sourceIdentity: "abc" })];
    expect(reusableAutoCaptures(shots, "fp-new", "abc")).toEqual([]);
  });

  it("does NOT reuse a capture from a different tested tree", () => {
    const shots = [shot({ planFingerprint: "fp-1", sourceIdentity: "old" })];
    expect(reusableAutoCaptures(shots, "fp-1", "new")).toEqual([]);
  });

  it("does NOT reuse a pre-#0734 capture with no fingerprint", () => {
    const shots = [shot({})];
    expect(reusableAutoCaptures(shots, "fp-1", "abc")).toEqual([]);
  });
});

describe("ui evidence preflight (#0734)", () => {
  const temps: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  function task(body: string): { config: RepoOSConfig; task: Task } {
    const root = mkdtempSync(join(tmpdir(), "repoos-preflight-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    return {
      config,
      task: {
        id: "0734pf",
        title: "t",
        path: "work/0734pf.md",
        absPath: join(root, "work/0734pf.md"),
        status: "active",
        branch: "feat/x",
        area: "web",
        body,
      } as Task,
    };
  }

  it("blocks before the expensive suite when required assertions cannot resolve", async () => {
    const { config, task: t } = task(
      bodyWithShots('[{"route":"/","assert":[{"selector":".row"}]}]'),
    );
    // The plan stands down entirely (e.g. no preview target resolved) — but the
    // task REQUIRES visual assertions, so the preflight must still block.
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      reason: "the declared shots could not resolve a preview target",
    });
    const result = await preflightUiEvidence(config, t);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/required visual assertions/);
  });

  it("blocks on a malformed assertion declaration", async () => {
    const { config, task: t } = task(bodyWithShots('[{"route":"/","assert":[{"label":"x"}]}]'));
    const result = await preflightUiEvidence(config, t);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/malformed/);
  });

  it("passes when no required assertions are declared", async () => {
    const { config, task: t } = task("");
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      reason: "no UI change to capture",
    });
    const result = await preflightUiEvidence(config, t);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });
});

describe("reviewMission missing-evidence rule (#0734)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  it("forbids good-to-go while visual proof is absent and names the evidence path", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-mission-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
    } as unknown as RepoOSConfig;
    const task = {
      id: "0734",
      title: "t",
      path: "work/0734.md",
      absPath: join(root, "work/0734.md"),
      status: "review",
      branch: "feat/x",
      area: "web",
      body: "## Problem\nsomething",
    } as Task;
    const agent = { name: "reviewer", cli: "claude", instructions: "" } as unknown as Agent;
    const mission = reviewMission(task, agent, join(root, "wt"), "main", config);
    expect(mission).toMatch(/Do NOT write `good to go` while saying visual proof is/);
    expect(mission).toContain(join(root, "work/.attachments/0734/shots"));
    expect(mission).toContain(join(root, ".repoos/ui-verification/0734.json"));
    expect(mission).toContain("MAIN");
  });
});
