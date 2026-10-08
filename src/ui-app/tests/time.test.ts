import { describe, expect, it } from "vitest";
import { fmtDate, formatDuration, relTime, timestampTip } from "../src/lib/time";

const now = new Date("2026-08-07T12:00:00Z");

describe("relTime", () => {
  it("returns just now for a very recent build", () => {
    expect(relTime("2026-08-07T11:59:55Z", now)).toBe("just now");
    expect(relTime("2026-08-07T12:00:01Z", now)).toBe("just now");
  });

  it("formats seconds", () => {
    expect(relTime("2026-08-07T11:59:50Z", now)).toBe("10 seconds ago");
  });

  it("formats minutes", () => {
    expect(relTime("2026-08-07T11:57:00Z", now)).toBe("3 minutes ago");
    expect(relTime("2026-08-07T11:59:00Z", now)).toBe("1 minute ago");
  });

  it("formats hours up to 48", () => {
    expect(relTime("2026-08-07T09:00:00Z", now)).toBe("3 hours ago");
    expect(relTime("2026-08-05T12:00:00Z", now)).toBe("48 hours ago");
  });

  it("falls back to days beyond 48 hours", () => {
    expect(relTime("2026-08-05T11:00:00Z", now)).toBe("2 days ago");
    expect(relTime("2026-08-01T12:00:00Z", now)).toBe("6 days ago");
  });

  it("returns unknown when the timestamp is missing or unparseable", () => {
    expect(relTime(null, now)).toBe("unknown");
    expect(relTime(undefined, now)).toBe("unknown");
    expect(relTime("not-a-date", now)).toBe("unknown");
  });
});

describe("fmtDate", () => {
  it("includes the local weekday, day and month", () => {
    const iso = "2026-08-07T12:00:00Z";
    const d = new Date(iso);
    const date = fmtDate(iso);
    expect(date).toContain(new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d));
    expect(date).toContain(String(d.getDate()));
    expect(date).toContain(new Intl.DateTimeFormat(undefined, { month: "short" }).format(d));
  });

  it("returns an empty string for missing or unparseable input", () => {
    expect(fmtDate(null)).toBe("");
    expect(fmtDate(undefined)).toBe("");
    expect(fmtDate("not-a-date")).toBe("");
  });
});

describe("timestampTip", () => {
  it("combines the relative age and the local date", () => {
    const tip = timestampTip("2026-08-07T11:57:00Z", now);
    expect(tip).toBe(`3 minutes ago · ${fmtDate("2026-08-07T11:57:00Z")}`);
  });

  it("formats seconds and hours too", () => {
    expect(timestampTip("2026-08-07T11:59:50Z", now)).toMatch(/^10 seconds ago · /);
    expect(timestampTip("2026-08-07T09:00:00Z", now)).toMatch(/^3 hours ago · /);
  });

  it("falls back to the relative-only text for missing input", () => {
    expect(timestampTip(null, now)).toBe("unknown");
    expect(timestampTip("not-a-date", now)).toBe("unknown");
  });
});

describe("formatDuration", () => {
  it("formats sub-minute spans in seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(4200)).toBe("4s");
    expect(formatDuration(59_400)).toBe("59s");
  });

  it("formats minutes with zero-padded seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(187_000)).toBe("3m 07s");
    expect(formatDuration(59 * 60_000 + 59_000)).toBe("59m 59s");
  });

  it("formats hours with zero-padded minutes", () => {
    expect(formatDuration(60 * 60_000)).toBe("1h 00m");
    expect(formatDuration(64 * 60_000 + 30_000)).toBe("1h 04m");
  });

  it("clamps negative and non-finite input to 0s", () => {
    expect(formatDuration(-5000)).toBe("0s");
    expect(formatDuration(Number.NaN)).toBe("0s");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0s");
  });
});
