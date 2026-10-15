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

  it("rejects unknown fixture ids when parsing ## Shots (not at URL build time)", () => {
    const bad = `## Shots\n\`\`\`json\n[{"route":"/","state":"nope"}]\n\`\`\``;
    expect(parseShotPlan(bad).errors[0]).toMatch(/unknown "state" fixture/);
    // State is validated at parse time; URL build trusts the declaration (#0786).
    expect(shotCapturePageUrl("http://127.0.0.1:8000", { route: "/", state: "nope" })).toContain(
      "shotState=nope",
    );
  });

  it("validates state in ## Shots JSON", () => {
    const body = `## Shots\n\`\`\`json\n[{"route":"/","state":"card:doneError"}]\n\`\`\``;
    expect(parseShotPlan(body).errors).toEqual([]);
    const bad = `## Shots\n\`\`\`json\n[{"route":"/","state":"unknown"}]\n\`\`\``;
    expect(parseShotPlan(bad).errors[0]).toMatch(/unknown "state" fixture/);
  });

  it("accepts the dev:failed fixture for the Dev page (#0775)", () => {
    const url = shotCapturePageUrl("http://127.0.0.1:8000", {
      route: "/dev",
      state: "dev:failed",
    });
    expect(url).toBe("http://127.0.0.1:8000/dev?shotState=dev%3Afailed");
    const body = `## Shots\n\`\`\`json\n[{"route":"/dev","state":"dev:failed"}]\n\`\`\``;
    expect(parseShotPlan(body).errors).toEqual([]);
  });

  it("accepts the closeOut:stalled fixture for the stalled card (#0778)", () => {
    const url = shotCapturePageUrl("http://127.0.0.1:8000", {
      route: "/",
      state: "closeOut:stalled",
    });
    expect(url).toBe("http://127.0.0.1:8000/?shotState=closeOut%3Astalled");
    const body = `## Shots\n\`\`\`json\n[{"route":"/","state":"closeOut:stalled"}]\n\`\`\``;
    expect(parseShotPlan(body).errors).toEqual([]);
  });
});
