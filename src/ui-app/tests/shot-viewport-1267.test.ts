/**
 * #1267 — shots capture at phone and desktop widths, and a declared shot can
 * name its viewport. Parsing (`viewport` presets, rejected values), the
 * automatic fan-out to phone + desktop, the explicit `--viewport` pin, and the
 * size each capture's caption names. Plan-level only: no browser.
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_SHOT_VIEWPORT_PRESETS,
  buildCapturePlan,
  describeShotViewport,
  parseShotEntry,
  parseShotPlan,
  provenanceCaption,
  SHOT_VIEWPORT_PRESETS,
} from "../../core/shot-plan";
import { buildCliShotPlan } from "../../commands/shot";

const body = (shots: unknown[]) =>
  `## Shots\n\`\`\`json\n${JSON.stringify(shots, null, 2)}\n\`\`\`\n`;

describe("declared shot viewport presets (#1267)", () => {
  it("names the three presets at the documented sizes", () => {
    expect(SHOT_VIEWPORT_PRESETS).toEqual({
      phone: { width: 390, height: 844 },
      tablet: { width: 820, height: 1180 },
      desktop: { width: 1280, height: 800 },
    });
  });

  it.each([
    ["phone", 390, 844],
    ["tablet", 820, 1180],
    ["desktop", 1280, 800],
  ] as const)("viewport %s sets the preset width and height", (name, width, height) => {
    const parsed = parseShotEntry({ route: "/", viewport: name });
    expect(parsed.error).toBeUndefined();
    expect(parsed.shot).toMatchObject({
      viewport: name,
      viewportWidth: width,
      viewportHeight: height,
    });
  });

  it("accepts a viewport that repeats the preset's own width and height", () => {
    const parsed = parseShotEntry({
      route: "/",
      viewport: "phone",
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(parsed.error).toBeUndefined();
    expect(parsed.shot?.viewport).toBe("phone");
  });

  it.each([
    ["an unknown name", { viewport: "watch" }, 'unknown "viewport" "watch"'],
    ["a non-string", { viewport: 390 }, 'unknown "viewport" 390'],
    [
      "a width that contradicts the preset",
      { viewport: "phone", viewportWidth: 1280 },
      '"viewport" phone is 390x844',
    ],
  ])("rejects %s with a clear error", (_label, extra, expected) => {
    const parsed = parseShotEntry({ route: "/", ...extra });
    expect(parsed.shot).toBeUndefined();
    expect(parsed.error).toContain(expected);
  });

  it("lists the valid names when a viewport is unknown", () => {
    const parsed = parseShotEntry({ route: "/", viewport: "watch" });
    expect(parsed.error).toContain("use one of: phone, tablet, desktop");
  });

  it("rejects a bad viewport through the whole --shots list, naming the entry", () => {
    const plan = parseShotPlan(body([{ route: "/", viewport: "tv" }]));
    expect(plan.shots).toEqual([]);
    expect(plan.errors[0]).toContain("shot #1");
    expect(plan.errors[0]).toContain('unknown "viewport" "tv"');
  });
});

describe("automatic fan-out to phone and desktop (#1267)", () => {
  const matchedGlobs = new Map([["default", ["src/ui-app/**"]]]);

  it("captures a touched web target at phone and desktop, in that order", () => {
    const built = buildCapturePlan(["default"], [], { matchedGlobs });
    expect(AUTO_SHOT_VIEWPORT_PRESETS).toEqual(["phone", "desktop"]);
    expect(built.entries).toHaveLength(2);
    expect(built.entries.map((e) => [e.viewportWidth, e.viewportHeight])).toEqual([
      [390, 844],
      [1280, 800],
    ]);
    expect(built.entries.map((e) => e.route)).toEqual(["/", "/"]);
  });

  it("captions each automatic capture with its size and glob", () => {
    const built = buildCapturePlan(["default"], [], { matchedGlobs });
    expect(built.entries.map((e) => e.label)).toEqual([
      "auto: matched src/ui-app/** · phone 390x844",
      "auto: matched src/ui-app/** · desktop 1280x800",
    ]);
  });

  it("keeps the two sizes of one target as two distinct captures", () => {
    const built = buildCapturePlan(["default"], [], { matchedGlobs });
    expect(built.collapsed).toEqual([]);
    expect(built.entries[0].label).not.toBe(built.entries[1].label);
  });

  it("gives a command target one entry and no viewport", () => {
    const built = buildCapturePlan(["mac"], [], { commandTargets: new Set(["mac"]) });
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0].viewportWidth).toBeUndefined();
    expect(built.entries[0].provenance).toEqual({ kind: "auto" });
  });

  it("pins the fallback to one size when the caller passes a single viewport", () => {
    const built = buildCapturePlan(["default"], [], {
      matchedGlobs,
      viewports: [{ width: 1024, height: 768 }],
    });
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0]).toMatchObject({ viewportWidth: 1024, viewportHeight: 768 });
    expect(built.entries[0].label).toBe("auto: matched src/ui-app/** · 1024x768");
  });

  it("falls back to the default fan-out when the viewports list is empty", () => {
    const built = buildCapturePlan(["default"], [], { matchedGlobs, viewports: [] });
    expect(built.entries.map((e) => e.viewportWidth)).toEqual([390, 1280]);
  });

  it("does not fan out a declared shot: one capture at its own size", () => {
    const built = buildCapturePlan(
      ["default"],
      parseShotPlan(body([{ route: "/agents", viewport: "phone", label: "Agents" }])).shots,
    );
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0]).toMatchObject({ viewportWidth: 390, viewportHeight: 844 });
  });
});

describe("declared shot captions name their size (#1267)", () => {
  it("captions a declared shot with no viewport at the default desktop size", () => {
    const shots = parseShotPlan(body([{ route: "/", label: "Board" }])).shots;
    const built = buildCapturePlan(["default"], shots);
    expect(built.entries[0].viewportWidth).toBeUndefined();
    expect(built.entries[0].label).toBe("Board");
    expect(provenanceCaption(built.entries[0].provenance)).toBe(
      "declared: Board · desktop 1280x800",
    );
  });

  it("captions a tablet shot with its tablet size", () => {
    const shots = parseShotPlan(body([{ route: "/", viewport: "tablet", label: "Board" }])).shots;
    const built = buildCapturePlan(["default"], shots);
    expect(provenanceCaption(built.entries[0].provenance)).toBe(
      "declared: Board · tablet 820x1180",
    );
  });

  it("uses the caller's default size for a shot that declares none", () => {
    const shots = parseShotPlan(body([{ route: "/", label: "Board" }])).shots;
    const built = buildCapturePlan(["default"], shots, {
      defaultViewport: { width: 1024, height: 768 },
    });
    expect(provenanceCaption(built.entries[0].provenance)).toBe("declared: Board · 1024x768");
  });

  it("leaves a command target's caption without a size", () => {
    const built = buildCapturePlan(["mac"], [{ target: "mac", label: "Mac app" }], {
      commandTargets: new Set(["mac"]),
    });
    expect(provenanceCaption(built.entries[0].provenance)).toBe("declared: Mac app");
  });
});

describe("describeShotViewport (#1267)", () => {
  it("names a preset size and falls back to bare WxH for any other size", () => {
    expect(describeShotViewport(390, 844)).toBe("phone 390x844");
    expect(describeShotViewport(1024, 768)).toBe("1024x768");
  });
});

describe("repoos shot fallback viewport (#1267)", () => {
  const input = {
    body: "## Problem\nNothing declared.",
    targets: ["default"],
    matchedGlobs: new Map([["default", ["src/ui-app/**"]]]),
    docsContentOnly: new Set<string>(),
  };

  it("captures phone and desktop by default", () => {
    const plan = buildCliShotPlan(input);
    expect(plan.entries.map((e) => e.viewportWidth)).toEqual([390, 1280]);
  });

  it("captures only the typed --viewport size when it is explicit", () => {
    const plan = buildCliShotPlan({
      ...input,
      viewport: { width: 1024, height: 768 },
      viewportExplicit: true,
    });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({ viewportWidth: 1024, viewportHeight: 768 });
  });

  it("gives an undeclared shot the --viewport default when it is not explicit", () => {
    const plan = buildCliShotPlan({
      ...input,
      viewport: { width: 1280, height: 800 },
      viewportExplicit: false,
    });
    expect(plan.entries.map((e) => e.viewportWidth)).toEqual([390, 1280]);
  });
});
