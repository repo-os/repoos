import { describe, expect, it } from "vitest";
import {
  computeNextRun,
  dueOccurrence,
  isValidIanaTimezone,
  occurrenceKey,
  parseTimeOfDay,
} from "./schedule-time.js";

describe("schedule-time", () => {
  it("validates IANA timezones", () => {
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("Not/A_Zone")).toBe(false);
  });

  it("parses time of day", () => {
    expect(parseTimeOfDay("09:30")).toEqual({ hour: 9, minute: 30 });
    expect(parseTimeOfDay("25:00")).toBeNull();
  });

  it("computes next daily run in timezone", () => {
    const timing = {
      cadence: "daily" as const,
      timezone: "UTC",
      timeOfDay: "09:00",
    };
    const after = new Date("2026-08-13T10:00:00Z");
    const next = computeNextRun(timing, after);
    expect(next?.toISOString()).toBe("2026-08-14T09:00:00.000Z");
  });

  it("dedupes with occurrence keys", () => {
    const timing = {
      cadence: "daily" as const,
      timezone: "UTC",
      timeOfDay: "09:00",
    };
    const due = new Date("2026-08-13T09:00:00Z");
    const key = occurrenceKey(timing, due);
    expect(key).toBe("daily:2026-08-13");
    const again = dueOccurrence(timing, new Date("2026-08-13T12:00:00Z"), key);
    expect(again).toBeNull();
  });

  it("catch-up returns latest missed daily slot once", () => {
    const timing = {
      cadence: "daily" as const,
      timezone: "UTC",
      timeOfDay: "09:00",
    };
    const now = new Date("2026-08-15T12:00:00Z");
    const due = dueOccurrence(timing, now, "");
    expect(due?.key).toBe("daily:2026-08-15");
  });
});
