import { describe, expect, it } from "vitest";
import { isWatchdogCheckWaitTaskDelta } from "../../core/watchdog-task-diff.js";

const path = "work/0999-watchdog-task.md";
const original = `---
id: "0999"
title: Watchdog task
needs_input: false
---

## Problem

Keep this body unchanged.

## Activity

- 2026-11-01T00:00:00Z · created · user
`;
const escalation = `---
id: "0999"
title: Watchdog task
needs_input: true
needs_input_reason: check-wait
needs_input_detail: "waiting: checks for 10 minutes"
updated_at: "2026-11-01T00:10:00Z"
---

## Problem

Keep this body unchanged.

## Activity

- 2026-11-01T00:00:00Z · created · user
- 2026-11-01T00:10:00Z · watchdog: check wait escalated · waiting: checks for 10 minutes · next step: investigate the abnormal wait; the flag clears when the check starts
`;

describe("watchdog task-file delta validation", () => {
  it("accepts a matching check-wait escalation and recovery sequence", () => {
    const recovered = `---
id: "0999"
title: Watchdog task
needs_input: false
updated_at: "2026-11-01T00:12:00Z"
---

## Problem

Keep this body unchanged.

## Activity

- 2026-11-01T00:00:00Z · created · user
- 2026-11-01T00:10:00Z · watchdog: check wait escalated · waiting: checks for 10 minutes · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T00:12:00Z · watchdog: check wait ended or recovered — cleared needs_input
`;
    expect(isWatchdogCheckWaitTaskDelta(original, escalation, path)).toBe(true);
    expect(isWatchdogCheckWaitTaskDelta(escalation, recovered, path)).toBe(true);
    expect(isWatchdogCheckWaitTaskDelta(original, recovered, path)).toBe(true);
  });

  it.each([
    ["detail", escalation.replace("waiting: checks for 10 minutes", "waiting: something else")],
    ["updated_at", escalation.replace('2026-11-01T00:10:00Z"', '2026-11-01T00:11:00Z"')],
    [
      "reason",
      escalation.replace("needs_input_reason: check-wait", "needs_input_reason: human-note"),
    ],
    ["flag", escalation.replace("needs_input: true", "needs_input: false")],
  ])("rejects a human or unrelated %s field value", (_field, changed) => {
    expect(isWatchdogCheckWaitTaskDelta(original, changed, path)).toBe(false);
  });
});
