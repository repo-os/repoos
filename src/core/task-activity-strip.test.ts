import { describe, expect, it } from "vitest";
import { stripLastStatusActivityEntry } from "./task.js";

describe("stripLastStatusActivityEntry", () => {
  it("removes the last matching status transition from Activity", () => {
    const body = `## Problem

x

## Activity

- 2026-01-01T00:00:00Z · created · api
- 2026-01-02T00:00:00Z · status active→review
`;
    const next = stripLastStatusActivityEntry(body, "active", "review");
    expect(next).not.toContain("active→review");
    expect(next).toContain("created · api");
  });

  it("is a no-op when the last entry does not match", () => {
    const body = `## Activity

- 2026-01-02T00:00:00Z · status inbox→ready
`;
    expect(stripLastStatusActivityEntry(body, "active", "review")).toBe(body);
  });
});
