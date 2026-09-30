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
import { planAutoCapture } from "../../server/shot-capture";
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

  it("reports a contentful section with no fenced list", () => {
    const { shots, errors } = parseShotPlan("## Shots\n\nJust prose, no JSON.\n");
    expect(shots).toEqual([]);
    expect(errors[0]).toMatch(/no fenced JSON/i);
  });
});

describe("buildCapturePlan", () => {
  it("falls back to one '/' entry per resolved target with no declared list", () => {
    const { entries, errors } = buildCapturePlan(["Docs site", "default"], []);
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { target: "Docs site", route: "/" },
      { target: "default", route: "/" },
    ]);
  });

  it("maps an omitted target to the default target or the sole resolution", () => {
    const one = buildCapturePlan(["default"], [{ route: "/board", label: "Board" }]);
    expect(one.entries[0].target).toBe("default");

    const sole = buildCapturePlan(["Docs site"], [{ route: "/" }]);
    expect(sole.entries[0].target).toBe("Docs site");
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
  });

  it("rejects a declared target the resolution missed, with an actionable error", () => {
    const { entries, errors } = buildCapturePlan(["Docs site"], [{ target: "Landing page" }]);
    expect(entries).toEqual([]);
    expect(errors[0]).toMatch(/do not include "Landing page"/);
  });

  it("errors — instead of capturing nothing or everything — when no target resolved", () => {
    expect(buildCapturePlan([], []).errors[0]).toMatch(/no preview target/i);
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
});
