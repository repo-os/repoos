import { describe, expect, it } from "vitest";
import { builtInRunNotice } from "../src/lib/builtInRunNotice";
import type { RepoEvent } from "../src/types";

const event = (over: Partial<Extract<RepoEvent, { type: "built-in.run" }>> = {}) =>
  ({
    type: "built-in.run",
    agent: "tech-debt",
    label: "Tech Debt Agent",
    findings: 0,
    taskId: null,
    runDoc: null,
    at: "2026-09-19T11:07:11Z",
    ...over,
  }) as Extract<RepoEvent, { type: "built-in.run" }>;

describe("builtInRunNotice", () => {
  it("reports the finding count and the single task they became", () => {
    expect(builtInRunNotice(event({ findings: 3, taskId: "0455" }))).toBe(
      "Tech Debt Agent finished — 3 findings, task #0455 created",
    );
  });

  it("does not pluralize a single finding", () => {
    expect(builtInRunNotice(event({ findings: 1, taskId: "0455" }))).toBe(
      "Tech Debt Agent finished — 1 finding, task #0455 created",
    );
  });

  it("says ran clean for a run that found nothing", () => {
    expect(builtInRunNotice(event())).toBe("Tech Debt Agent finished — ran clean");
  });

  it("omits the task when findings were recorded but nothing was filed", () => {
    expect(builtInRunNotice(event({ findings: 2 }))).toBe("Tech Debt Agent finished — 2 findings");
  });

  it("falls back to the agent slug when the server sent no label", () => {
    expect(builtInRunNotice(event({ label: "" }))).toBe("tech-debt finished — ran clean");
  });
});
