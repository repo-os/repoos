import { describe, expect, it } from "vitest";
import {
  hubTaskRoutePath,
  normalizeHubTaskSearchQuery,
  searchHubTasks,
} from "../../core/hub-task-search.js";

describe("hub task search core", () => {
  it("routes palette selections through the work deep link", () => {
    expect(hubTaskRoutePath("0476")).toBe("/work?task=0476");
  });

  it("bounds and ranks matches without returning bodies", () => {
    const hits = searchHubTasks(
      "0476",
      [
        {
          id: "0476",
          title: "Add privacy-preserving cross-server task search",
          status: "active",
          updated_at: "2026-09-22T00:00:00.000Z",
        },
        { id: "0100", title: "Unrelated", status: "ready", updated_at: null },
        { id: "0475", title: "Privacy polish elsewhere", status: "done", updated_at: null },
      ],
      8,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("0476");
    expect(hits.every((hit) => !("body" in hit))).toBe(true);
    expect(hits[0].routePath).toBe("/work?task=0476");
  });

  it("rejects overlong and too-short queries at normalization", () => {
    expect(normalizeHubTaskSearchQuery("a")).toBeNull();
    expect(normalizeHubTaskSearchQuery("  ab  ")).toBe("ab");
    expect(normalizeHubTaskSearchQuery("x".repeat(81))).toBeNull();
  });
});
