import { describe, expect, it } from "vitest";
import { relTime } from "../src/lib/time";

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
