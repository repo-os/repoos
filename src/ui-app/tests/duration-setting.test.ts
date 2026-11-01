import { describe, expect, it } from "vitest";
import { getConfigSchema } from "../../core/config";
import { durationUnitFor, formatDurationMs, parseDurationMs } from "../src/lib/duration-setting";

describe("Settings duration fields (#0995 E5)", () => {
  it("shows 180000 ms as 3 minutes and 600000 ms as 10 minutes", () => {
    expect(durationUnitFor("watchdog.phantomDetectMs", 180000)).toBe("min");
    expect(formatDurationMs(180000, "min")).toBe("3");
    expect(formatDurationMs(600000, "min")).toBe("10");
    expect(parseDurationMs("3", "min")).toBe(180000);
    expect(parseDurationMs("10", "min")).toBe(600000);
  });

  it("round-trips fractional and non-round millisecond values", () => {
    for (const ms of [180500, 90500, 1500, 0, 8000]) {
      const unit = ms >= 60_000 && ms % 60_000 === 0 ? "min" : "s";
      expect(parseDurationMs(formatDurationMs(ms, unit), unit)).toBe(ms);
    }
    expect(parseDurationMs(formatDurationMs(180000, "min"), "min")).toBe(180000);
  });

  it("converts min, max and step into the display unit", () => {
    expect(formatDurationMs(15000, "min")).toBe("0.25");
    expect(parseDurationMs("0.25", "min")).toBe(15000);
    expect(parseDurationMs("1", "s")).toBe(1000);
  });

  it("gives every millisecond Settings number an explicit unit", () => {
    const fields = getConfigSchema().filter((f) => f.type === "number" && f.key.endsWith("Ms"));
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(durationUnitFor(f.key, Number(f.default)), f.key).not.toBeNull();
    }
  });
});
