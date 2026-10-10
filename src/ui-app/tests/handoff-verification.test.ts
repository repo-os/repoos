/**
 * #0751/#0753 — per-shot handoff verdicts.
 *
 * #0751 derived a `matches`/`check` badge from the evidence the gate already
 * records (step misses, route match, assertion outcomes) and named a failed
 * step in plain words. #0753 moved that verdict onto the Changes tab's shot row
 * as a check/cross icon with a popover, folded the handoff-wide issues into the
 * same popover, and dropped the standalone summary block. This file covers the
 * three cases the task calls out — a matching shot, a checking shot with a
 * failed step, and a handoff with issues — plus the popover/issue helpers.
 */
import { describe, expect, it } from "vitest";
import {
  handoffContextLine,
  handoffIssueGroups,
  handoffIssueLines,
  orphanHandoffSentence,
  shotVerdict,
  verdictSentence,
} from "../src/lib/handoff-verification";
import type {
  UiHandoffCaptureEvidence,
  UiHandoffVerificationEvidence,
} from "../src/types";

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

function evidence(
  over: Partial<UiHandoffVerificationEvidence> = {},
): UiHandoffVerificationEvidence {
  return { at: "2026-10-10T10:00:00Z", issues: [], blankShots: [], captures: 1, ...over };
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
    // The raw selector + timeout message stays available alongside the reason.
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

describe("verdictSentence (#0753)", () => {
  it("says a matching shot ran every step and was captured", () => {
    expect(verdictSentence(shotVerdict(capture()))).toBe(
      "matches: every declared step ran and the capture was taken",
    );
  });

  it("prefaces a check with its plain-words reason", () => {
    const view = shotVerdict(
      capture({ targetWarnings: ['click [data-test-id="fullscreen"]: Timeout 5000ms exceeded'] }),
    );
    expect(verdictSentence(view)).toBe(
      'check: couldn\'t find [data-test-id="fullscreen"] to click',
    );
  });
});

describe("handoffIssueGroups / handoffIssueLines (#0753)", () => {
  it("returns no groups for a clean handoff", () => {
    expect(handoffIssueGroups([], [])).toEqual([]);
    expect(handoffIssueLines(evidence())).toEqual([]);
    expect(handoffIssueLines(undefined)).toEqual([]);
  });

  it("groups console/request/overflow issues under human labels, in order", () => {
    const groups = handoffIssueGroups(
      [
        { kind: "console", message: "TypeError: x is undefined" },
        { kind: "request", message: "GET /api/x failed", url: "/api/x", viewportWidth: 390 },
        { kind: "overflow", message: "content wider than viewport", viewportWidth: 1280 },
      ],
      [],
    );
    expect(groups.map((g) => g.kind)).toEqual([
      "console errors",
      "failed same-origin requests",
      "overflow",
    ]);
    // The failed request keeps its URL and viewport in one line.
    expect(groups[1]!.items[0]).toContain("/api/x");
    expect(groups[1]!.items[0]).toContain("@390px");
  });

  it("lists blank captures and shot warnings", () => {
    const lines = handoffIssueLines(
      evidence({ blankShots: ["shot-1.png"], warnings: ["highlight .x matched nothing on /"] }),
    );
    expect(lines).toContain("blank captures:");
    expect(lines.some((l) => l.includes("shot-1.png"))).toBe(true);
    expect(lines.some((l) => l.includes("[shot-warning] highlight .x"))).toBe(true);
  });
});

describe("handoffContextLine (#0753)", () => {
  it("names the tested tree and evidence directory", () => {
    expect(
      handoffContextLine(
        evidence({ sourceIdentity: "abc1234", evidenceDir: "work/.attachments/0753/shots" }),
      ),
    ).toBe("tested tree abc1234 · PNGs at work/.attachments/0753/shots");
  });

  it("is empty when the handoff recorded neither", () => {
    expect(handoffContextLine(evidence())).toBe("");
    expect(handoffContextLine(null)).toBe("");
  });
});

describe("orphanHandoffSentence (#0753)", () => {
  it("keeps a matching orphan's verdict, noting it left the shot list", () => {
    expect(orphanHandoffSentence(shotVerdict(capture()))).toBe(
      "matches, but no longer in the shot list",
    );
  });

  it("keeps a checking orphan's reason too", () => {
    const view = shotVerdict(capture({ targetWarnings: ["selector .x matched nothing on /"] }));
    expect(orphanHandoffSentence(view)).toBe(
      "check: couldn't find .x (no longer in the shot list)",
    );
  });
});
