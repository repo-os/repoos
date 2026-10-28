import { describe, expect, it } from "vitest";
import {
  CHECK_WAIT_ESCALATION_MS,
  CHECK_WAIT_REMINDER_MS,
  createCheckWaitRecorder,
  formatWaitDuration,
} from "../../core/check-wait.js";

function recorder() {
  const lines: string[] = [];
  let now = 1_000_000;
  const rec = createCheckWaitRecorder(
    (line) => lines.push(line),
    () => now,
  );
  return {
    lines,
    rec,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("check wait recorder (#0974)", () => {
  it("announces the first wait reason, then reminds with the elapsed time", () => {
    const f = recorder();
    f.rec.onStatusLine("[pressure] load above 3× per cpu");
    expect(f.lines).toEqual(["waiting: [pressure] load above 3× per cpu"]);
    f.advance(30_000);
    f.rec.onStatusLine("[pressure] load above 3× per cpu");
    expect(f.lines).toHaveLength(1); // before the reminder interval: silent
    f.advance(CHECK_WAIT_REMINDER_MS);
    f.rec.onStatusLine("[pressure] load above 3× per cpu");
    expect(f.lines.at(-1)).toContain("for 1m");
  });

  it("updates the reason (queue position) without restarting the clock", () => {
    const f = recorder();
    f.rec.onStatusLine("[queue] waiting for a local check slot (0 ahead, position 1)");
    f.advance(CHECK_WAIT_REMINDER_MS + 1);
    f.rec.onStatusLine("[queue] waiting for a local check slot (1 ahead, position 2)");
    expect(f.lines).toHaveLength(2);
    expect(f.lines[1]).toContain("position 2) for 1m");
    const finished = f.rec.finish();
    expect(finished?.startedAt).toBe(1_000_000);
    expect(finished?.endedAt).toBe(1_000_000 + CHECK_WAIT_REMINDER_MS + 1);
    expect(f.rec.waitedMs()).toBe(CHECK_WAIT_REMINDER_MS + 1);
  });

  it("names the needs-input escalation exactly once past ten minutes", () => {
    const f = recorder();
    f.rec.onStatusLine("[pressure] memory pressure critical");
    f.advance(CHECK_WAIT_ESCALATION_MS);
    f.rec.onStatusLine("[pressure] memory pressure critical");
    expect(f.lines.filter((l) => l.includes("surfaced as needs input"))).toHaveLength(1);
    f.advance(CHECK_WAIT_REMINDER_MS);
    f.rec.onStatusLine("[pressure] memory pressure critical");
    expect(f.lines.filter((l) => l.includes("surfaced as needs input"))).toHaveLength(1);
  });

  it("stays silent for a run that never waited", () => {
    const f = recorder();
    expect(f.rec.finish()).toBeNull();
    expect(f.rec.waitedMs()).toBe(0);
    expect(f.lines).toEqual([]);
  });

  it("formats compact durations", () => {
    expect(formatWaitDuration(0)).toBe("0s");
    expect(formatWaitDuration(42_000)).toBe("42s");
    expect(formatWaitDuration(26 * 60_000)).toBe("26m");
    expect(formatWaitDuration(75 * 60_000)).toBe("1h 15m");
  });
});
