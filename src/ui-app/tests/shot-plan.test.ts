/**
 * #0594 — the declarative `## Shots` list: parsing out of the task body, the
 * capture plan built from resolved targets, and the server-side auto-capture
 * gates (never a browser — the browser path is exercised by the UI smoke test
 * and by hand).
 */
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "../../core/config";
import {
  buildCapturePlan,
  parseShotPlan,
  resolveDeclaredTarget,
  sameDeclaredShot,
  shotPlanFingerprint,
  validateDeclaredShotTargets,
  parseShotEntry,
} from "../../core/shot-plan";
import {
  extractFixturesFromSource,
  createFixtureValidator,
  readBranchFixtureValidator,
} from "../../core/shot-fixtures";
import {
  buildCliShotPlan,
  parseShotArgs,
  type CliShotPlan,
  type CliShotPlanInput,
} from "../../commands/shot";
import { describeTargetPathMatches, targetsForPaths } from "../../core/shot-targets";
import { captureShotPage, type ShotDriverPage } from "../../core/shot-page";
import { planAutoCapture, runAutoShotCapture } from "../../server/shot-capture";
import type { PreviewManager } from "../../server/preview";
import { localShotStore } from "../../server/shots";
import type { RepoOSConfig, Task } from "../../core/types";
import type { PreviewConfig } from "../../core/types";

const PREVIEW: PreviewConfig = {
  command: "bun run dev --port {port}",
  paths: ["src/ui-app/**"],
  targets: [{ name: "Docs site", areas: ["docs"], paths: ["user-docs/**"], command: "bun dev" }],
};

function bodyWithShots(json: string): string {
  return [
    "## Problem",
    "",
    "Some prose first, no list before the heading.",
    "",
    "## Shots",
    "",
    "```json",
    json,
    "```",
    "",
    "## Activity",
  ].join("\n");
}

describe("resolveDeclaredTarget", () => {
  it("aliases explicit default to the sole named target when no app target is resolved", () => {
    expect(resolveDeclaredTarget("default", ["web"])).toEqual({ target: "web" });
  });

  it("keeps an explicit default on the main app when it is among resolved targets", () => {
    expect(resolveDeclaredTarget("default", ["default", "Docs site"])).toEqual({
      target: "default",
    });
    const shots = [
      { target: "default", route: "/settings?tab=general", label: "Settings" },
      { target: "Docs site", route: "/configuration", label: "Configuration" },
    ];
    const capture = buildCapturePlan(["default", "Docs site"], shots, {
      docsContentOnly: new Set(["Docs site"]),
    });
    expect(capture.entries.map(({ target, route }) => [target, route])).toEqual([
      ["default", "/settings?tab=general"],
      ["Docs site", "/configuration"],
    ]);
    expect(capture.errors).toEqual([]);
  });
});

describe("validateDeclaredShotTargets", () => {
  it("accepts default when it is the only configured target name", () => {
    expect(
      validateDeclaredShotTargets([{ route: "/", target: "default" }], {
        command: "echo preview",
      }),
    ).toEqual([]);
  });

  it("accepts default as an alias when only one named target exists", () => {
    expect(
      validateDeclaredShotTargets([{ route: "/", target: "default" }], {
        command: "echo preview",
        targets: [{ name: "web", areas: ["web"], command: "echo web" }],
      }),
    ).toEqual([]);
  });

  it("rejects unknown targets with the valid name list", () => {
    const errors = validateDeclaredShotTargets([{ route: "/", target: "nope" }], {
      command: "echo preview",
      targets: [{ name: "web", areas: ["web"], command: "echo web" }],
    });
    expect(errors[0]).toMatch(/unknown target "nope"/);
    expect(errors[0]).toMatch(/default, web/);
  });
});

describe("parseShotPlan", () => {
  it("returns no shots (and no errors) when the section is absent", () => {
    expect(parseShotPlan("## Problem\nNothing to see.")).toEqual({ shots: [], errors: [] });
  });

  it("parses a single entry and defaults everything optional", () => {
    const { shots, errors } = parseShotPlan(bodyWithShots('{"route": "/board"}'));
    expect(errors).toEqual([]);
    expect(shots).toEqual([{ route: "/board" }]);
  });

  it("parses an array with steps typed per key", () => {
    const json =
      '[{"label":"Drawer","target":"default","route":"/","steps":[{"click":"button.new"},{"fill":"input.q","text":"hi"},{"waitFor":".drawer"},{"waitMs":200}]}]';
    const { shots, errors } = parseShotPlan(bodyWithShots(json));
    expect(errors).toEqual([]);
    expect(shots[0]?.steps).toEqual([
      { click: "button.new" },
      { fill: "input.q", text: "hi" },
      { waitFor: ".drawer" },
      { waitMs: 200 },
    ]);
  });

  it("keeps a highlight selector like any other string key (#0603)", () => {
    const { shots, errors } = parseShotPlan(
      bodyWithShots('[{"route":"/","highlight":".new-badge","label":"New badge"}]'),
    );
    expect(errors).toEqual([]);
    expect(shots[0]?.highlight).toBe(".new-badge");
  });

  it("rejects an empty highlight like other string keys (#0603)", () => {
    const { shots, errors } = parseShotPlan(bodyWithShots('[{"route":"/","highlight":""}]'));
    expect(shots).toEqual([]);
    expect(errors[0]).toMatch(/"highlight" expects a non-empty string/);
  });

  it("is case-tolerant on the heading and skips other sections", () => {
    expect(parseShotPlan("## shots\n\n```json\n[]\n```").shots).toEqual([]);
    expect(parseShotPlan("## Screenshots\n\n```json\n{}\n```").shots).toEqual([]);
  });

  it("reports bad JSON and bad entries without dropping the good ones", () => {
    const bad = parseShotPlan(bodyWithShots("not json"));
    expect(bad.shots).toEqual([]);
    expect(bad.errors[0]).toMatch(/does not parse/i);

    const mixed = parseShotPlan(bodyWithShots('[{"route":"/ok"},{"label":42},{"steps":[{}]}]'));
    expect(mixed.shots).toEqual([{ route: "/ok" }]);
    expect(mixed.errors).toHaveLength(2);
  });

  it("reports step shape errors with (none) or the extra keys listed", () => {
    const zeroKeys = parseShotPlan(bodyWithShots('[{"route":"/","steps":[{}]}]'));
    expect(zeroKeys.errors).toEqual([
      "shot #1 step #1: a step needs exactly one of click/fill/waitFor/hover/waitMs (none)",
    ]);

    const multi = parseShotPlan(
      bodyWithShots('[{"route":"/","steps":[{"click":"button","waitMs":100}]}]'),
    );
    expect(multi.errors).toEqual([
      "shot #1 step #1: a step needs exactly one of click/fill/waitFor/hover/waitMs (click, waitMs)",
    ]);
  });

  it("accepts a hover step (#0830)", () => {
    const { shots, errors } = parseShotPlan(
      bodyWithShots('[{"route":"/agents","steps":[{"hover":".median-bar"}]}]'),
    );
    expect(errors).toEqual([]);
    expect(shots[0]?.steps).toEqual([{ hover: ".median-bar" }]);
  });

  it("reports a contentful section with no fenced list", () => {
    const { shots, errors } = parseShotPlan("## Shots\n\nJust prose, no JSON.\n");
    expect(shots).toEqual([]);
    expect(errors[0]).toMatch(/no fenced JSON/i);
  });

  it("parses a light/dark theme and rejects anything else (#0782)", () => {
    const ok = parseShotPlan(
      bodyWithShots('[{"route":"/work","theme":"dark"},{"route":"/work","theme":"light"}]'),
    );
    expect(ok.errors).toEqual([]);
    expect(ok.shots.map((s) => s.theme)).toEqual(["dark", "light"]);

    const bad = parseShotPlan(bodyWithShots('[{"route":"/work","theme":"blue"}]'));
    expect(bad.shots).toEqual([]);
    expect(bad.errors[0]).toMatch(/"theme" expects "light" or "dark"/);
  });

  it("parses viewportWidth and reducedMotion (#0787)", () => {
    const ok = parseShotPlan(
      bodyWithShots(
        '[{"route":"/work","viewportWidth":390,"reducedMotion":true},{"route":"/","viewportWidth":1280}]',
      ),
    );
    expect(ok.errors).toEqual([]);
    expect(ok.shots[0]?.viewportWidth).toBe(390);
    expect(ok.shots[0]?.reducedMotion).toBe(true);
    expect(ok.shots[1]?.viewportWidth).toBe(1280);

    const bad = parseShotPlan(bodyWithShots('[{"route":"/work","viewportWidth":100}]'));
    expect(bad.shots).toEqual([]);
    expect(bad.errors[0]).toMatch(/viewportWidth/);
  });
});

describe("buildCapturePlan", () => {
  it("falls back to one '/' entry per resolved target, captioned as auto match", () => {
    const { entries, errors } = buildCapturePlan(["Docs site", "default"], [], {
      matchedGlobs: new Map([
        ["Docs site", ["user-docs/**"]],
        ["default", ["src/ui-app/**"]],
      ]),
    });
    expect(errors).toEqual([]);
    // #0603: the fallback always captions itself — label + provenance.
    expect(entries).toEqual([
      {
        target: "Docs site",
        route: "/",
        label: "auto: matched user-docs/**",
        provenance: { kind: "auto", globs: ["user-docs/**"] },
      },
      {
        target: "default",
        route: "/",
        label: "auto: matched src/ui-app/**",
        provenance: { kind: "auto", globs: ["src/ui-app/**"] },
      },
    ]);
  });

  it("labels a fallback with no known glob as plain auto", () => {
    const { entries } = buildCapturePlan(["default"], []);
    expect(entries[0]?.label).toBe("auto");
    expect(entries[0]?.provenance).toEqual({ kind: "auto" });
  });

  it("skips a docs-content-only target on the fallback path (#0603)", () => {
    const { entries, autoSkips } = buildCapturePlan(["Docs site", "default"], [], {
      docsContentOnly: new Set(["Docs site"]),
    });
    expect(entries.map((e) => e.target)).toEqual(["default"]);
    expect(autoSkips[0]).toMatch(/Docs site skipped: no docs shot declared/);
  });

  it("inherits a caller-requested route into every fallback entry (#0610)", () => {
    // The CLI used to build these entries itself and then discard them, so a
    // typed route lost to the fallback's hardcoded `/`.
    const { entries, autoSkips } = buildCapturePlan(["Docs site", "default"], [], {
      route: "/repo/commits/abc123",
      matchedGlobs: new Map([["default", ["src/ui-app/**"]]]),
    });
    expect(entries.map((e) => [e.target, e.route])).toEqual([
      ["Docs site", "/repo/commits/abc123"],
      ["default", "/repo/commits/abc123"],
    ]);
    // Still captioned (#0603): a request is not a declaration, but a shot with
    // no reason is never anonymous.
    expect(entries[1]?.label).toBe("auto: matched src/ui-app/**");
    expect(autoSkips).toEqual([]);
  });

  it("normalizes a requested route without its leading slash (#0610)", () => {
    const { entries } = buildCapturePlan(["default"], [], { route: "settings" });
    expect(entries[0]?.route).toBe("/settings");
  });

  it("captures a docs-content-only target when a route was requested (#0610)", () => {
    // The skip exists because `/` would be the docs home page. A route the
    // caller named by hand is exactly the justification it asks for.
    const requested = buildCapturePlan(["Docs site"], [], {
      route: "/configuration",
      docsContentOnly: new Set(["Docs site"]),
    });
    expect(requested.entries.map((e) => e.route)).toEqual(["/configuration"]);
    expect(requested.autoSkips).toEqual([]);
  });

  it("applies a caller-requested selector to the fallback (#0610)", () => {
    // `--selector` with no route used to be dropped too: it suppressed the
    // declared list, then lost to the `/` entries built in its place.
    const { entries } = buildCapturePlan(["default"], [], { selector: ".sidebar" });
    expect(entries[0]).toMatchObject({ route: "/", selector: ".sidebar" });
  });

  it("leaves declared entries their own route/selector (#0610)", () => {
    // Options only fill the fallback: a declared entry's steps/highlight/label
    // were authored for its own route.
    const { entries } = buildCapturePlan(
      ["default"],
      [{ route: "/board", selector: ".card", label: "Board" }],
      { route: "/settings", selector: ".sidebar" },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      route: "/board",
      selector: ".card",
      label: "Board",
      provenance: { kind: "declared", label: "Board" },
    });
  });

  it("maps an omitted target to the default target or the sole resolution", () => {
    const one = buildCapturePlan(["default"], [{ route: "/board", label: "Board" }]);
    expect(one.entries[0].target).toBe("default");
    expect(one.entries[0].provenance).toEqual({ kind: "declared", label: "Board" });

    const sole = buildCapturePlan(["Docs site"], [{ route: "/", highlight: ".title" }]);
    expect(sole.entries[0].target).toBe("Docs site");
    expect(sole.entries[0]).toMatchObject({ highlight: ".title" });
  });

  it("requires a declared route for a docs-content-only target (#0603)", () => {
    // user-docs/*.md matched the Docs site glob, but the task declared no
    // route: shooting `/` would caption the docs home page, not the edit.
    const routed = buildCapturePlan(
      ["Docs site"],
      [{ route: "/configuration", label: "Config page" }],
      { docsContentOnly: new Set(["Docs site"]) },
    );
    expect(routed.entries).toHaveLength(1);

    const routeless = buildCapturePlan(["Docs site"], [{ label: "no route" }], {
      docsContentOnly: new Set(["Docs site"]),
    });
    expect(routeless.entries).toEqual([]);
    // One visible line, not an error plus a near-duplicate skip (#0603 review).
    expect(routeless.errors).toHaveLength(1);
    expect(routeless.errors[0]).toMatch(/matched only documentation content/);
    expect(routeless.autoSkips).toEqual([]);
  });

  it("notes a docs-content target no declared entry even mentioned (#0603)", () => {
    // Declarations cover `default` only; the matched Docs site is content-only
    // and never named — one skip note explains why it is not captured.
    const mixed = buildCapturePlan(["Docs site", "default"], [{ route: "/", label: "Board" }], {
      docsContentOnly: new Set(["Docs site"]),
    });
    expect(mixed.entries.map((e) => e.target)).toEqual(["default"]);
    expect(mixed.errors).toEqual([]);
    expect(mixed.autoSkips).toHaveLength(1);
    expect(mixed.autoSkips[0]).toMatch(/Docs site skipped: no docs shot declared/);
  });

  it("keeps multi-entry plans for the same target (one preview, many shots)", () => {
    const { entries } = buildCapturePlan(
      ["default"],
      [
        { route: "/", label: "Board" },
        { route: "/", label: "Drawer", steps: [{ click: "button.new" }] },
      ],
    );
    expect(entries).toHaveLength(2);
    expect(entries[1].steps).toEqual([{ click: "button.new" }]);
    expect(entries[0].provenance).toEqual({ kind: "declared", label: "Board" });
  });

  it("collapses near-duplicate declared shots and merges highlights (#0613)", () => {
    const { entries, collapsed } = buildCapturePlan(
      ["default"],
      [
        { route: "/agents", highlight: ".detect-row", label: "Row" },
        { route: "/agents", highlight: ".detect-compat-slot", label: "Slot" },
      ],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].highlight).toBe(".detect-row, .detect-compat-slot");
    expect(entries[0].highlights).toEqual([".detect-row", ".detect-compat-slot"]);
    expect(collapsed).toEqual(["Slot"]);
  });

  it("adopts a later highlight when the first duplicate had none (#0613)", () => {
    const { entries } = buildCapturePlan(
      ["default"],
      [
        { route: "/agents", label: "Row" },
        { route: "/agents", highlight: ".detect-row", label: "Slot" },
      ],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].highlight).toBe(".detect-row");
  });

  it("keeps a light and a dark capture of one route as two entries (#0782)", () => {
    const { entries, collapsed } = buildCapturePlan(
      ["default"],
      [
        { route: "/work", theme: "light", label: "Board (light)" },
        { route: "/work", theme: "dark", label: "Board (dark)" },
      ],
    );
    expect(entries).toHaveLength(2);
    expect(collapsed).toEqual([]);
    expect(entries.map((e) => e.theme)).toEqual(["light", "dark"]);
    // Theme binds the plan identity: flipping it forces a re-capture, and the
    // delete-sync treats the two declarations as different shots.
    expect(shotPlanFingerprint([entries[0]!])).not.toBe(shotPlanFingerprint([entries[1]!]));
    expect(
      sameDeclaredShot({ route: "/work", theme: "light" }, { route: "/work", theme: "dark" }),
    ).toBe(false);
    expect(sameDeclaredShot({ route: "/work", theme: "light" }, { route: "/work" })).toBe(false);
    expect(
      sameDeclaredShot({ route: "/work", theme: "light" }, { route: "/work", theme: "light" }),
    ).toBe(true);
  });

  it("rejects a declared target the resolution missed, with an actionable error", () => {
    const { entries, errors } = buildCapturePlan(["Docs site"], [{ target: "Landing page" }]);
    expect(entries).toEqual([]);
    expect(errors[0]).toMatch(/do not include "Landing page"/);
  });

  it("errors — instead of capturing nothing or everything — when no target resolved", () => {
    const empty = buildCapturePlan([], []);
    expect(empty.entries).toEqual([]);
    expect(empty.errors[0]).toMatch(/no preview target/i);
    expect(empty.autoSkips).toEqual([]);
  });
});

describe("buildCliShotPlan (#0610)", () => {
  /** A task declaring one shot, so precedence is observable. */
  const BODY = bodyWithShots('[{"target":"default","route":"/board","label":"Board"}]');

  function plan(args: string[], patch: Partial<CliShotPlanInput> = {}): CliShotPlan {
    const opts = parseShotArgs(args);
    expect(opts.error).toBeUndefined();
    return buildCliShotPlan({
      body: BODY,
      route: opts.route,
      selector: opts.selector,
      targets: ["default"],
      matchedGlobs: new Map([["default", ["src/ui-app/**"]]]),
      docsContentOnly: new Set<string>(),
      ...patch,
    });
  }

  it("carries a typed positional route into the capture entry", () => {
    // The reported bug: `repoos shot /repo/commits/abc123` captured `/`.
    const built = plan(["/repo/commits/abc123"]);
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0]).toMatchObject({
      target: "default",
      route: "/repo/commits/abc123",
    });
  });

  it("replaces the declared list when a route or selector is pinned", () => {
    const routed = plan(["/settings"]);
    expect(routed.entries.map((e) => e.route)).toEqual(["/settings"]);
    expect(routed.entries[0].provenance).toEqual({
      kind: "auto",
      globs: ["src/ui-app/**"],
    });

    const selector = plan(["--selector", ".sidebar"]);
    expect(selector.entries[0]).toMatchObject({ route: "/", selector: ".sidebar" });
    expect(selector.entries[0].provenance.kind).toBe("auto");
  });

  it("honors the declared list when no route or selector was pinned", () => {
    const built = plan([]);
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0]).toMatchObject({
      route: "/board",
      label: "Board",
      provenance: { kind: "declared", label: "Board" },
    });
  });

  it("surfaces declared-list problems and docs skips as visible notes", () => {
    // A malformed list drops to no declarations, so the plan is the `/`
    // fallback — with the parse error still reported, not swallowed.
    const malformed = plan([], { body: bodyWithShots("not json") });
    expect(malformed.declaredErrors[0]).toMatch(/does not parse/i);
    expect(malformed.entries.map((e) => e.route)).toEqual(["/"]);

    const docs = plan(["--target", "Docs site"], {
      body: "## Problem\n\nProse only.",
      targets: ["Docs site"],
      docsContentOnly: new Set(["Docs site"]),
    });
    expect(docs.entries).toEqual([]);
    expect(docs.skips[0]).toMatch(/Docs site skipped: no docs shot declared/);
  });
});

function fixtureConfig(root: string): RepoOSConfig {
  return loadConfig(root);
}

function fakeTask(patch: Partial<Task> = {}): Task {
  return {
    id: "0594",
    branch: "feat/x",
    body: "",
    absPath: "/dev/null/task.md",
    ...patch,
  } as unknown as Task;
}

describe("planAutoCapture gates (#0594)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-plan-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    return root;
  }

  it("stands down when the task has no branch", () => {
    const root = repo();
    const plan = planAutoCapture(fixtureConfig(root), fakeTask({ branch: undefined }));
    expect(plan).toMatchObject({ reason: expect.stringContaining("no branch") });
  });

  it("stands down when an engineer-made capture pre-empts it", () => {
    const root = repo();
    const config = fixtureConfig(root);
    localShotStore(config, "0594").save({ target: "default", data: "aGk=", mime: "image/png" });
    const plan = planAutoCapture(config, fakeTask());
    expect(plan).toMatchObject({ reason: expect.stringContaining("already captured") });
  });

  it("does not let an earlier automatic capture pre-empt a re-capture", () => {
    const root = repo();
    const config = fixtureConfig(root);
    const store = localShotStore(config, "0594");
    store.save({ target: "default", data: "aGk=", mime: "image/png", origin: "auto" });
    const plan = planAutoCapture(config, fakeTask());
    expect(plan).not.toMatchObject({ reason: expect.stringContaining("already captured") });
    expect(store.removeAuto()).toBe(1);
    expect(store.list()).toEqual([]);
  });

  it("stands down outside a repo: nothing matched the changed paths", () => {
    // The fixture dir is not a git worktree, so the diff read fails soft and
    // the gate reports "touches no paths" rather than capturing blind.
    const root = repo();
    const plan = planAutoCapture(fixtureConfig(root), fakeTask());
    expect(plan).toMatchObject({ reason: expect.stringContaining("touches no") });
  });

  it("captures declared shots even when the diff matches no glob (#0603 review)", () => {
    // Declared shots resolve targets the way the CLI does — paths, then area,
    // then the default command — so an explicit declaration is honored even
    // with an unreadable (here: non-git) diff.
    const root = repo();
    writeFileSync(join(root, "repoos.toml"), '[preview]\ncommand = "bun dev"\n');
    const config = fixtureConfig(root);
    const plan = planAutoCapture(
      config,
      fakeTask({
        branch: "feat/x",
        body: bodyWithShots('[{"route": "/settings", "label": "Settings"}]'),
      }),
    );
    expect(plan).toEqual({
      entries: [
        {
          target: "default",
          route: "/settings",
          label: "Settings",
          provenance: { kind: "declared", label: "Settings" },
        },
      ],
      errors: [],
      blockingErrors: [],
      skips: [],
      collapsed: [],
    });
  });

  it("stands down for a tests-only diff inside a UI glob (#0603, the #0600 shape)", () => {
    // #0600's real diff was work-note + test files under src/ui-app/tests/.
    // planAutoCapture delegates the target set to computeTaskShotContext; the
    // pure filter is pinned in shot-targets.test.ts. Here the point is: with
    // detected empty (tests filtered), the plan is a skip, never entries.
    const root = repo();
    writeFileSync(
      join(root, "repoos.toml"),
      '[preview]\npaths = ["src/ui-app/**"]\ncommand = "bun dev"\n',
    );
    const config = fixtureConfig(root);
    expect(
      targetsForPaths(config.preview, [
        "src/ui-app/tests/handoff-guard.test.ts",
        "work/0600-note.md",
      ]),
    ).toEqual([]);
    // The plan therefore has nothing to capture — a UI-glob touch that is all
    // tests is not a UI change. buildCapturePlan-level proof:
    const detail = describeTargetPathMatches(config.preview, [
      "src/ui-app/tests/handoff-guard.test.ts",
      "work/0600-note.md",
    ]);
    expect(detail).toEqual([]);
  });
});

describe("runAutoShotCapture status prefix (#0597)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });
  const previews = {} as PreviewManager;

  it("adds exactly one shots: skipped — prefix to skip outcomes", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-prefix-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const logs: string[] = [];
    const result = await runAutoShotCapture(
      fixtureConfig(root),
      fakeTask({ id: "0597-skip", branch: undefined }),
      previews,
      (_id, _level, message) => logs.push(message),
    );
    const expected = "shots: skipped — the task has no branch yet";
    expect(result).toMatchObject({ status: "skipped", detail: expected });
    expect(logs).toEqual([expected]);
    expect(result.detail).not.toMatch(/shots: skipped — skipped/);
  });

  it("records the spec'd no-UI-change skip for a diff with no glob evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-noui-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const logs: string[] = [];
    const result = await runAutoShotCapture(
      fixtureConfig(root),
      fakeTask({ id: "0603-noui" }),
      previews,
      (_id, _level, message) => logs.push(message),
    );
    expect(result.status).toBe("skipped");
    // The wording scope 1 mandates, visible in log + activity.
    expect(result.detail).toMatch(/^shots: skipped — .*no UI change to capture/);
    expect(logs).toEqual([result.detail]);
  });

  it("skips with a resolution reason when declared shots cannot resolve a target", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-decl-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const logs: string[] = [];
    const result = await runAutoShotCapture(
      fixtureConfig(root),
      fakeTask({ id: "0603-decl", body: bodyWithShots('[{"route": "/", "label": "Board"}]') }),
      previews,
      (_id, _level, message) => logs.push(message),
    );
    expect(result.status).toBe("skipped");
    expect(result.detail).toMatch(/^shots: skipped — the declared shots could not resolve/);
    expect(logs).toEqual([result.detail]);
  });
});

describe("captureShotPage highlight (#0603)", () => {
  interface RecordedEvaluate {
    body: string;
    arg: string;
  }

  /** Minimal ShotDriverPage fake that records evaluate calls in order. */
  function fakePage(options: { evaluate?: boolean; matches?: number }) {
    const evaluations: RecordedEvaluate[] = [];
    const screenshots: number[] = [];
    const page = {
      async goto(): Promise<void> {},
      async waitForLoadState(): Promise<void> {},
      async waitForTimeout(): Promise<void> {},
      async setViewportSize(): Promise<void> {},
      locator(): unknown {
        return {};
      },
      async screenshot(): Promise<Buffer> {
        screenshots.push(evaluations.length);
        return Buffer.from("png");
      },
      async close(): Promise<void> {},
      ...(options.evaluate === false
        ? {}
        : {
            async evaluate(body: string, arg: string): Promise<unknown> {
              evaluations.push({ body, arg });
              return options.matches ?? 0;
            },
          }),
    } as unknown as ShotDriverPage & {
      __evaluations: RecordedEvaluate[];
      __screenshots: number[];
    };
    (page as unknown as Record<string, unknown>).__evaluations = evaluations;
    (page as unknown as Record<string, unknown>).__screenshots = screenshots;
    return page;
  }

  it("draws the highlight before capture and removes it after (#0603)", async () => {
    const page = fakePage({ matches: 2 });
    await captureShotPage(
      page,
      "http://x/",
      { highlight: ".new-badge", route: "/" },
      {
        waitMs: 0,
        fullPage: false,
      },
    );
    const evals = page.__evaluations;
    expect(evals.length).toBe(2);
    // Draw first, with the selector interpolated into the script.
    expect(evals[0].body).toContain(".new-badge");
    expect(evals[0].body).toContain("outline: 3px solid");
    expect(evals[1].body).toContain("removeAttribute");
    // The screenshot happened between draw and undo.
    expect(page.__screenshots).toEqual([1]);
  });

  it("captures unhighlighted when the page cannot evaluate (#0603)", async () => {
    const page = fakePage({ evaluate: false });
    const png = await captureShotPage(
      page,
      "http://x/",
      { highlight: ".x", route: "/" },
      {
        waitMs: 0,
        fullPage: false,
      },
    );
    expect(png).toBeInstanceOf(Buffer);
  });

  it("skips the dance entirely without a highlight selector", async () => {
    const page = fakePage({ matches: 0 });
    await captureShotPage(
      page,
      "http://x/",
      { steps: [], route: "/" },
      { waitMs: 0, fullPage: false },
    );
    expect(page.__evaluations).toEqual([]);
  });

  it("invokes onHighlightMiss when the highlight matches nothing (#0613)", async () => {
    const page = fakePage({ matches: 0 });
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { highlight: ".missing", route: "/board" },
      { waitMs: 0, fullPage: false },
      { onHighlightMiss: (selector) => misses.push(selector) },
    );
    expect(misses).toEqual([".missing"]);
  });

  it("reports a miss for each merged highlight individually (#0613)", async () => {
    const page = fakePage({ matches: 0 });
    // `.live` matches, `.stale` does not — a comma-joined check would hide it.
    (page as unknown as { evaluate: unknown }).evaluate = async (body: string, arg: string) =>
      body.includes("querySelectorAll(sel)") && arg === ".live" ? 1 : 0;
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { highlight: ".live, .stale", highlights: [".live", ".stale"], route: "/board" },
      { waitMs: 0, fullPage: false },
      { onHighlightMiss: (selector) => misses.push(selector) },
    );
    expect(misses).toEqual([".stale"]);
  });

  it("counts a match even when an overlapping selector already marked the element (#0613)", async () => {
    // Run the real draw script against a tiny DOM where `.item` and `div.item`
    // hit the same element, so the second selector sees it pre-marked.
    class FakeElement {
      attrs = new Set<string>();
      hasAttribute(name: string) {
        return this.attrs.has(name);
      }
      setAttribute(name: string) {
        this.attrs.add(name);
      }
      removeAttribute(name: string) {
        this.attrs.delete(name);
      }
    }
    const el = new FakeElement();
    const doc = {
      querySelectorAll: (sel: string) => (sel === ".item" || sel === "div.item" ? [el] : []),
      getElementById: () => null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { append() {} },
    };
    const page = fakePage({ matches: 0 });
    (page as unknown as { evaluate: unknown }).evaluate = async (body: string) =>
      new Function("document", "Element", `return ${body}`)(doc, FakeElement);
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { highlight: ".item, div.item", highlights: [".item", "div.item"], route: "/board" },
      { waitMs: 0, fullPage: false },
      { onHighlightMiss: (selector) => misses.push(selector) },
    );
    expect(misses).toEqual([]);
  });

  it("falls back to the whole window when selector matches nothing (#0613)", async () => {
    const page = fakePage({ matches: 0 });
    page.locator = () =>
      ({
        count: async () => 0,
        screenshot: async () => Buffer.from("crop"),
      }) as unknown as ReturnType<ShotDriverPage["locator"]>;
    const misses: string[] = [];
    const png = await captureShotPage(
      page,
      "http://x/",
      { selector: ".missing", route: "/board" },
      { waitMs: 0, fullPage: false },
      { onSelectorMiss: (selector) => misses.push(selector) },
    );
    expect(misses).toEqual([".missing"]);
    expect(png).toBeInstanceOf(Buffer);
    expect(page.__screenshots).toEqual([0]);
  });

  it("still captures when the draw script throws (best-effort, #0603)", async () => {
    const page = fakePage({ matches: 0 });
    (page as unknown as { evaluate: () => Promise<void> }).evaluate = async () => {
      throw new Error("execution context destroyed");
    };
    const png = await captureShotPage(
      page,
      "http://x/",
      { highlight: ".x", route: "/" },
      {
        waitMs: 0,
        fullPage: false,
      },
    );
    expect(png).toBeInstanceOf(Buffer);
  });
});

describe("captureShotPage theme (#0782)", () => {
  interface Recorded {
    evaluations: string[];
    screenshots: number[];
  }

  /** A minimal page that records the theme scripts evaluate receives. */
  function fakePage(options: { evaluate?: boolean } = {}): ShotDriverPage & Recorded {
    const recorded: Recorded = { evaluations: [], screenshots: [] };
    const page = {
      async goto(): Promise<void> {},
      async waitForLoadState(): Promise<void> {},
      async waitForTimeout(): Promise<void> {},
      async setViewportSize(): Promise<void> {},
      locator(): unknown {
        return {};
      },
      async screenshot(): Promise<Buffer> {
        recorded.screenshots.push(recorded.evaluations.length);
        return Buffer.from("png");
      },
      async close(): Promise<void> {},
      ...(options.evaluate === false
        ? {}
        : {
            async evaluate(body: string): Promise<unknown> {
              recorded.evaluations.push(body);
              return 0;
            },
          }),
    } as unknown as ShotDriverPage & Recorded;
    Object.assign(page, recorded);
    return page;
  }

  it("pins the declared theme on the mounted page before the screenshot", async () => {
    const page = fakePage();
    await captureShotPage(
      page,
      "http://x/work",
      { route: "/work", theme: "dark" },
      {
        waitMs: 0,
        fullPage: false,
      },
    );
    expect(page.evaluations).toHaveLength(1);
    // The same two values the contrast audit writes: the stored choice (so the
    // config store's own init agrees) and the resolved data-theme (so the
    // mounted page restyles now).
    expect(page.evaluations[0]).toContain('localStorage.setItem("repoos.theme", "dark")');
    expect(page.evaluations[0]).toContain('document.documentElement.dataset.theme = "dark"');
    // Applied before the frame was composed, not after it.
    expect(page.screenshots).toEqual([1]);
  });

  it("touches nothing when the entry declares no theme", async () => {
    const page = fakePage();
    await captureShotPage(
      page,
      "http://x/work",
      { route: "/work" },
      {
        waitMs: 0,
        fullPage: false,
      },
    );
    expect(page.evaluations).toEqual([]);
  });

  it("records a theme miss — never a silently wrong-theme frame", async () => {
    const misses: string[] = [];
    const page = fakePage({ evaluate: false });
    const png = await captureShotPage(
      page,
      "http://x/work",
      { route: "/work", theme: "light" },
      { waitMs: 0, fullPage: false },
      { onThemeMiss: (theme, route) => misses.push(`${theme} on ${route}`) },
    );
    expect(png).toBeInstanceOf(Buffer);
    expect(misses).toEqual(["light on /work"]);

    // Same verdict when evaluate exists but the script throws.
    const throwing = fakePage();
    (throwing as unknown as { evaluate: () => Promise<void> }).evaluate = async () => {
      throw new Error("execution context destroyed");
    };
    const misses2: string[] = [];
    await captureShotPage(
      throwing,
      "http://x/work",
      { route: "/work", theme: "dark" },
      { waitMs: 0, fullPage: false },
      { onThemeMiss: (theme, route) => misses2.push(`${theme} on ${route}`) },
    );
    expect(misses2).toEqual(["dark on /work"]);
  });
});

describe("captureShotPage loading-state detection (#0755)", () => {
  /**
   * A ShotDriverPage whose `evaluate` answers the loading-state probe with
   * `loadingResult` and the highlight probe with 0. Distinguishes the two by the
   * probe's own marker text, so the test exercises the real integration point.
   */
  function fakePage(loadingResult: string, opts: { evaluate?: boolean } = {}) {
    const loadingCalls: string[] = [];
    const page = {
      async goto(): Promise<void> {},
      async waitForLoadState(): Promise<void> {},
      async waitForTimeout(): Promise<void> {},
      async setViewportSize(): Promise<void> {},
      locator(): unknown {
        // A declared `waitFor` step resolves against this; give it a no-op so
        // the choreography reaches the loading probe.
        return { first: undefined, waitFor: async () => {} };
      },
      async screenshot(): Promise<Buffer> {
        return Buffer.from("png");
      },
      async close(): Promise<void> {},
      ...(opts.evaluate === false
        ? {}
        : {
            async evaluate(body: string): Promise<unknown> {
              // The loading probe is the only one that references aria-busy.
              if (body.includes('aria-busy="true"') || body.includes("loading text")) {
                loadingCalls.push(body);
                return loadingResult;
              }
              return 0;
            },
          }),
    } as unknown as ShotDriverPage & { __loadingCalls: string[] };
    (page as unknown as Record<string, unknown>).__loadingCalls = loadingCalls;
    return page;
  }

  it("reports a loading state after the steps and settle as a failed step", async () => {
    const page = fakePage('loading text "Loading changes…"');
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { steps: [{ waitFor: '[data-task-id="9999"]' }], route: "/drawer" },
      { waitMs: 0, fullPage: false },
      { onLoadingState: (message, route) => misses.push(`${message} on ${route}`) },
    );
    expect(misses).toEqual(['loading state detected: loading text "Loading changes…" on /drawer']);
    // The probe ran after the choreography, not before navigate.
    expect(page.__loadingCalls).toHaveLength(1);
  });

  it("does not report a loading state on a mounted page", async () => {
    const page = fakePage("");
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { route: "/" },
      { waitMs: 0, fullPage: false },
      { onLoadingState: (message) => misses.push(message) },
    );
    expect(misses).toEqual([]);
  });

  it("captures without probing when no loading handler is supplied", async () => {
    const page = fakePage('loading text "Loading changes…"');
    const png = await captureShotPage(
      page,
      "http://x/",
      { route: "/" },
      { waitMs: 0, fullPage: false },
    );
    expect(png).toBeInstanceOf(Buffer);
    expect(page.__loadingCalls).toEqual([]);
  });

  it("captures without probing when the driver cannot evaluate", async () => {
    const page = fakePage("", { evaluate: false });
    const misses: string[] = [];
    const png = await captureShotPage(
      page,
      "http://x/",
      { route: "/" },
      { waitMs: 0, fullPage: false },
      { onLoadingState: (message) => misses.push(message) },
    );
    expect(png).toBeInstanceOf(Buffer);
    expect(misses).toEqual([]);
  });

  it("reports a declared selector that is not on the page with its name", async () => {
    const page = fakePage("");
    page.locator = () =>
      ({
        count: async () => 0,
        screenshot: async () => Buffer.from("crop"),
      }) as unknown as ReturnType<ShotDriverPage["locator"]>;
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { selector: '[data-task-id="9999"]', route: "/drawer" },
      { waitMs: 0, fullPage: false },
      { onSelectorMiss: (selector) => misses.push(selector) },
    );
    expect(misses).toEqual(['[data-task-id="9999"]']);
  });

  // The probe runs the REAL query script against a tiny DOM, so the detection
  // rule itself is exercised — not just the handler wiring.
  it("detects 'Loading changes…' text in a real DOM via the query script", async () => {
    class FakeElement {
      parentElement: FakeElement | null = null;
      constructor(readonly textContent: string) {}
      getBoundingClientRect() {
        return { width: 10, height: 10 };
      }
    }
    const body = new FakeElement("");
    const loadingText = new FakeElement("Loading changes…");
    loadingText.parentElement = body;
    const wired = new FakeElement("Saved changes");
    wired.parentElement = body;
    const doc = {
      body,
      createTreeWalker: () => {
        const nodes = [loadingText, wired];
        let i = 0;
        return { nextNode: () => (i < nodes.length ? nodes[i++]! : null) };
      },
      querySelectorAll: () => [],
    };
    const page = fakePage("", { evaluate: false });
    (page as unknown as { evaluate: unknown }).evaluate = async (script: string) =>
      new Function("document", "NodeFilter", "window", "Element", `return ${script}`)(
        doc,
        { SHOW_TEXT: 4 },
        { getComputedStyle: () => ({}) },
        FakeElement,
      );
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { route: "/repo/commits/abc" },
      { waitMs: 0, fullPage: false },
      { onLoadingState: (message) => misses.push(message) },
    );
    expect(misses[0]).toContain('loading text "Loading changes…"');
  });

  // A populated page that merely carries a loading-ish class or a hidden
  // spinner must NOT be flagged — the handler is narrow on purpose (review
  // round 1: broad class globs would flip a good capture to `check`).
  it("does not flag a populated page whose only loading-ish signal is a class", async () => {
    class FakeElement {
      parentElement: FakeElement | null = null;
      constructor(readonly textContent: string) {}
      getBoundingClientRect() {
        return { width: 10, height: 10 };
      }
    }
    const body = new FakeElement("");
    const rendered = new FakeElement("Saved changes");
    rendered.parentElement = body;
    const doc = {
      body,
      // A `.loading-skeleton` element is present but this selector is NOT part
      // of the (narrow) query — only aria-busy / data-loading are.
      createTreeWalker: () => {
        const nodes = [rendered];
        let i = 0;
        return { nextNode: () => (i < nodes.length ? nodes[i++]! : null) };
      },
      querySelectorAll: () => [],
    };
    const page = fakePage("", { evaluate: false });
    (page as unknown as { evaluate: unknown }).evaluate = async (script: string) =>
      new Function("document", "NodeFilter", "window", "Element", `return ${script}`)(
        doc,
        { SHOW_TEXT: 4 },
        { getComputedStyle: () => ({}) },
        FakeElement,
      );
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { route: "/" },
      { waitMs: 0, fullPage: false },
      { onLoadingState: (message) => misses.push(message) },
    );
    expect(misses).toEqual([]);
  });
});

describe("fixture validation from branch source (#0786)", () => {
  it("extracts fixture ids from shot-fixtures.ts source", () => {
    const source = `
      export const SHOT_PREVIEW_FIXTURE_IDS = [
        "closeOut:active",
        "closeOut:stalled",
        "custom:test",
      ] as const;
    `;
    const fixtures = extractFixturesFromSource(source);
    expect(fixtures).toContain("closeOut:active");
    expect(fixtures).toContain("closeOut:stalled");
    expect(fixtures).toContain("custom:test");
  });

  it("extracts fixtures from single-line array", () => {
    const source = `export const SHOT_PREVIEW_FIXTURE_IDS = ["closeOut:active", "custom:test"] as const;`;
    const fixtures = extractFixturesFromSource(source);
    expect(fixtures).toContain("closeOut:active");
    expect(fixtures).toContain("custom:test");
  });

  it("extracts fixtures ignoring comments", () => {
    const source = `
      export const SHOT_PREVIEW_FIXTURE_IDS = [
        "closeOut:active", // some comment
        // "commented:out",
        "custom:test",
      ] as const;
    `;
    const fixtures = extractFixturesFromSource(source);
    expect(fixtures).toContain("closeOut:active");
    expect(fixtures).toContain("custom:test");
    expect(fixtures).not.toContain("commented:out");
  });

  it("creates a validator from fixture ids", () => {
    const fixtures = ["closeOut:active", "custom:new"];
    const validator = createFixtureValidator(fixtures);
    expect(validator("closeOut:active")).toBe(true);
    expect(validator("custom:new")).toBe(true);
    expect(validator("unknown")).toBe(false);
  });

  it("accepts a declared shot with a custom fixture from the branch", () => {
    const validator = createFixtureValidator(["closeOut:active", "custom:branch-only"]);
    const { shot, error } = parseShotEntry(
      { route: "/board", state: "custom:branch-only" },
      "entry",
      { fixtureValidator: validator },
    );
    expect(error).toBeUndefined();
    expect(shot?.state).toBe("custom:branch-only");
  });

  it("accepts fixtures from both main and branch lists", () => {
    const branchValidator = createFixtureValidator(["closeOut:active", "custom:branch-only"]);
    // closeOut:stalled is in main's list but not in the branch fixture list
    // It should still be accepted because we check both
    const { shot, error } = parseShotEntry(
      { route: "/board", state: "closeOut:stalled" },
      "entry",
      { fixtureValidator: branchValidator },
    );
    expect(error).toBeUndefined();
    expect(shot?.state).toBe("closeOut:stalled");
  });

  it("rejects a fixture unknown to both main and branch", () => {
    const branchValidator = createFixtureValidator(["closeOut:active"]);
    const { shot, error } = parseShotEntry({ route: "/board", state: "unknown:fixture" }, "entry", {
      fixtureValidator: branchValidator,
    });
    expect(shot).toBeUndefined();
    expect(error).toContain('unknown "state" fixture "unknown:fixture"');
  });

  it("accepts fixtures in parseShotPlan with custom validator", () => {
    const validator = createFixtureValidator(["custom:test"]);
    const body = `## Shots\n\n\`\`\`json\n{"route": "/", "state": "custom:test"}\n\`\`\``;
    const { shots, errors } = parseShotPlan(body, { fixtureValidator: validator });
    expect(errors).toEqual([]);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.state).toBe("custom:test");
  });

  it("readBranchFixtureValidator reads this repo's shot-fixtures.ts end-to-end (#0786)", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const fixturesPath = join(repoRoot, "src/core/shot-fixtures.ts");
    const validator = readBranchFixtureValidator(
      (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
      repoRoot,
    );
    expect(validator).toBeDefined();
    expect(validator!("closeOut:stalled")).toBe(true);
    const body =
      '## Shots\n\n```json\n[{"route":"/","state":"closeOut:stalled","target":"default"}]\n```';
    const { shots, errors } = parseShotPlan(body, { fixtureValidator: validator! });
    expect(errors).toEqual([]);
    expect(shots[0]?.state).toBe("closeOut:stalled");
    const built = buildCapturePlan(["default"], shots, {});
    expect(built.entries).toHaveLength(1);
    expect(built.entries[0]?.state).toBe("closeOut:stalled");
  });
});
