/**
 * #0594 — the declarative `## Shots` list: parsing out of the task body, the
 * capture plan built from resolved targets, and the server-side auto-capture
 * gates (never a browser — the browser path is exercised by the UI smoke test
 * and by hand).
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config";
import { buildCapturePlan, parseShotPlan } from "../../core/shot-plan";
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
      "shot #1 step #1: a step needs exactly one of click/fill/waitFor/waitMs (none)",
    ]);

    const multi = parseShotPlan(
      bodyWithShots('[{"route":"/","steps":[{"click":"button","waitMs":100}]}]'),
    );
    expect(multi.errors).toEqual([
      "shot #1 step #1: a step needs exactly one of click/fill/waitFor/waitMs (click, waitMs)",
    ]);
  });

  it("reports a contentful section with no fenced list", () => {
    const { shots, errors } = parseShotPlan("## Shots\n\nJust prose, no JSON.\n");
    expect(shots).toEqual([]);
    expect(errors[0]).toMatch(/no fenced JSON/i);
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
    expect(autoSkips[0]).toMatch(/Docs site matched only documentation content/);
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
    expect(routeless.errors[0]).toMatch(/documentation content/);
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
    expect(mixed.autoSkips[0]).toMatch(/Docs site matched only documentation content/);
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
        { route: "/agents", highlight: ".detect-deprecated-slot", label: "Slot" },
      ],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].highlight).toBe(".detect-row, .detect-deprecated-slot");
    expect(collapsed).toEqual(["Slot"]);
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
    expect(docs.skips[0]).toMatch(/Docs site matched only documentation content/);
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
      (selector) => misses.push(selector),
    );
    expect(misses).toEqual([".missing"]);
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
      undefined,
      (selector) => misses.push(selector),
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
