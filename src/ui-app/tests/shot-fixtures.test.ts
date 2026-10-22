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
    ).toThrow(/unknown "state" fixture "nope" — use one of: .*closeOut:active/u);
    // A branch-aware validator (#0786) admits ids main's compiled list lacks.
    const branch = (id: string) => id === "closeOut:stalled";
    expect(
      shotCapturePageUrl(
        "http://127.0.0.1:8000",
        { route: "/", state: "closeOut:stalled" },
        branch,
      ),
    ).toContain("shotState=closeOut%3Astalled");
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

  it("accepts the dev:running fixture for the Dev page (#0801)", () => {
    const url = shotCapturePageUrl("http://127.0.0.1:8000", {
      route: "/dev",
      state: "dev:running",
    });
    expect(url).toBe("http://127.0.0.1:8000/dev?shotState=dev%3Arunning");
    const body = `## Shots\n\`\`\`json\n[{"route":"/dev","state":"dev:running"}]\n\`\`\``;
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
