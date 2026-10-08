import { describe, expect, it } from "vitest";
import { shotCapturePageUrl } from "../../core/shot-fixtures.js";
import { parseShotPlan } from "../../core/shot-plan.js";

describe("shot preview fixtures (#0743)", () => {
  it("appends shotState query for a declared fixture", () => {
    const url = shotCapturePageUrl("http://127.0.0.1:8000", {
      route: "/",
      state: "closeOut:active",
    });
    expect(url).toBe("http://127.0.0.1:8000/?shotState=closeOut%3Aactive");
  });

  it("rejects unknown fixture ids at capture URL build time", () => {
    expect(() =>
      shotCapturePageUrl("http://127.0.0.1:8000", { route: "/", state: "nope" }),
    ).toThrow(/unknown shot state/);
  });

  it("validates state in ## Shots JSON", () => {
    const body = `## Shots\n\`\`\`json\n[{"route":"/","state":"card:doneError"}]\n\`\`\``;
    expect(parseShotPlan(body).errors).toEqual([]);
    const bad = `## Shots\n\`\`\`json\n[{"route":"/","state":"unknown"}]\n\`\`\``;
    expect(parseShotPlan(bad).errors[0]).toMatch(/unknown "state" fixture/);
  });
});
