import { describe, expect, it } from "vitest";
import { doneAtFromActivity } from "../../core/task";

describe("doneAtFromActivity (#0995 E3)", () => {
  it("returns the timestamp of the last status transition into done", () => {
    const body = `## Activity

- 2026-10-28T12:40:39Z · status ready→done
- 2026-10-31T08:00:00Z · note: stale flag cleared
`;
    expect(doneAtFromActivity(body)).toBe("2026-10-28T12:40:39Z");
  });

  it("uses the latest done transition when a task re-enters done", () => {
    const body = `## Activity

- 2026-10-20T10:00:00Z · status review→done
- 2026-10-25T11:00:00Z · status done→active
- 2026-10-28T12:40:39Z · status active→done
`;
    expect(doneAtFromActivity(body)).toBe("2026-10-28T12:40:39Z");
  });

  it("ignores a later done→done release line", () => {
    const body = [
      "- 2026-10-28T12:40:39Z · status ready→done",
      "- 2026-10-31T11:34:39Z · status done→done, release:success",
    ].join("\n");
    expect(doneAtFromActivity(body)).toBe("2026-10-28T12:40:39Z");
  });

  it("falls back to null when no done transition exists", () => {
    expect(doneAtFromActivity("## Activity\n\n- 2026-10-31T08:00:00Z · note\n")).toBeNull();
  });
});
