/**
 * #0751 — per-shot verdicts for the handoff UI-verification block.
 *
 * The block used to print the raw capture log; `shotVerdict` derives a
 * `matches`/`check` badge from the evidence the gate already records (step
 * misses, route match, assertion outcomes) and names a failed step in plain
 * words, keeping the raw message for the details toggle. The three cases the
 * task calls out — every step passed, a failed step, and no steps — are covered
 * here, plus the header sentence.
 */
import { describe, expect, it } from "vitest";
import { handoffSummary, shotVerdict } from "../src/lib/handoff-verification";
import type { UiHandoffCaptureEvidence } from "../src/types";

function capture(over: Partial<UiHandoffCaptureEvidence> = {}): UiHandoffCaptureEvidence {
  return {
    target: "web",
    route: "/agents",
    label: "Agents page",
    url: "http://127.0.0.1:9000/agents",
    finalRoute: "/agents",
    routeMatched: true,
    assertions: [],
    assertionsPassed: 0,
    assertionsChecked: 0,
    ...over,
  };
}

describe("shotVerdict (#0751)", () => {
  it("matches when every declared step succeeded and the capture landed", () => {
    const view = shotVerdict(
      capture({
        assertions: [
          { description: "selector .row", passed: true, detail: "", blocking: true },
          { description: "text Saved", passed: true, detail: "", blocking: true },
        ],
        assertionsPassed: 2,
        assertionsChecked: 2,
      }),
    );
    expect(view.verdict).toBe("matches");
    expect(view.reason).toBe("");
    expect(view.details).toEqual([]);
  });

  it("checks a shot whose step could not find its target, in plain words", () => {
    const view = shotVerdict(
      capture({
        targetWarnings: [
          'click [data-test-id="fullscreen"]: locator.click: Timeout 5000ms exceeded. on /agents',
        ],
      }),
    );
    expect(view.verdict).toBe("check");
    expect(view.reason).toBe('couldn\'t find [data-test-id="fullscreen"] to click');
    // The raw selector + timeout message stays available under "details".
    expect(view.details[0]).toContain("Timeout 5000ms exceeded");
  });

  it("matches a shot with no declared steps and a clean capture", () => {
    const view = shotVerdict(capture());
    expect(view.verdict).toBe("matches");
    expect(view.reason).toBe("");
    expect(view.details).toEqual([]);
  });

  it("checks a selector miss with a plain-words reason", () => {
    const view = shotVerdict(
      capture({ targetWarnings: ["selector .todo-row matched nothing on /"] }),
    );
    expect(view.verdict).toBe("check");
    expect(view.reason).toBe("couldn't find .todo-row");
  });

  it("checks a route mismatch even with no step warnings", () => {
    const view = shotVerdict(
      capture({
        routeMatched: false,
        finalRoute: "/login",
        redirectNote: "declared route /agents but the browser landed on /login",
      }),
    );
    expect(view.verdict).toBe("check");
    expect(view.reason).toBe("landed on /login instead of /agents");
    expect(view.details.some((d) => d.includes("landed on /login"))).toBe(true);
  });

  it("checks a failed blocking assertion but tolerates an optional one", () => {
    const blocking = shotVerdict(
      capture({
        assertions: [
          {
            description: "review rows present",
            passed: false,
            detail: "matched 0",
            blocking: true,
          },
        ],
        assertionsChecked: 1,
      }),
    );
    expect(blocking.verdict).toBe("check");
    expect(blocking.reason).toBe("review rows present");

    const optional = shotVerdict(
      capture({
        assertions: [
          { description: "empty state shown", passed: false, detail: "matched 0", blocking: false },
        ],
        assertionsChecked: 1,
      }),
    );
    expect(optional.verdict).toBe("matches");
  });
});

describe("handoffSummary (#0751)", () => {
  it("summarises all-matching shots in one sentence", () => {
    const s = handoffSummary([
      shotVerdict(capture()),
      shotVerdict(capture({ route: "/", finalRoute: "/" })),
    ]);
    expect(s).toMatchObject({ total: 2, matching: 2, checking: 0 });
    expect(s.sentence).toBe("2 shots, all 2 captured, none need checking");
  });

  it("counts shots that need checking", () => {
    const s = handoffSummary([
      shotVerdict(capture()),
      shotVerdict(capture({ targetWarnings: ["waitFor .drawer matched nothing on /"] })),
    ]);
    expect(s).toMatchObject({ total: 2, matching: 1, checking: 1 });
    expect(s.sentence).toBe("2 shots, 1 of 2 captured, 1 needs checking");
  });

  it("reads sensibly for a single shot and for none", () => {
    expect(handoffSummary([shotVerdict(capture())]).sentence).toBe(
      "1 shot, all 1 captured, none need checking",
    );
    expect(handoffSummary([]).sentence).toBe("0 shots, none captured, none need checking");
  });
});
