/**
 * #0611 — captured preview shots as rows on the Changes tab's **UI changes**
 * section, merged with the task's `## Shots` spec.
 *
 * Two halves, tested separately because they fail differently: `shotRows()`
 * pairs captured files with declared entries (index order when the counts
 * align, field matching when they don't) and renders a step list readably; the
 * component test proves the drawer really uses that — one row per shot, the
 * shared `ff-pending-*` classes rather than the old thumbnail grid, spec detail
 * on the row, and a thumbnail click that still opens the viewer at the right
 * index.
 *
 * #0753 adds a second component block here: the handoff verdict icon on each
 * row (green check / red cross) with its plain-words popover, and proof the old
 * standalone "Handoff UI verification" block is gone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import { describeStep, describeSteps, shotRows } from "../src/lib/shot-rows";
import type { ShotMeta, Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

/** A body carrying a `## Shots` declaration, as an engineer would write it. */
function bodyWithShots(json: string): string {
  return ["## Problem", "", "Some prose.", "", "## Shots", "", "```json", json, "```", ""].join(
    "\n",
  );
}

/** `provenance` (#0603) is read structurally by `shotRows`, so the fixture may
 * carry it even where `ShotMeta` doesn't declare it yet. */
type ShotFixture = Partial<ShotMeta> & { provenance?: string };

function makeShot(over: ShotFixture = {}): ShotMeta {
  return {
    name: "shot-1.png",
    target: "default",
    route: "/",
    path: "work/.attachments/0001/shots/shot-1.png",
    url: "/api/tasks/0001/shots/shot-1.png",
    size: 1024,
    mime: "image/png",
    capturedAt: "2026-10-01T10:00:00.000Z",
    ...over,
  };
}

const makeTask = (over: Partial<Task> = {}): Task =>
  ({
    id: "0001",
    title: "Test task",
    type: "feature",
    status: "active",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/test",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-test.md",
    absPath: "/tmp/repo/work/0001-test.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: "/tmp/wt",
      dirty: false,
    },
    preview: null,
    automaticReview: { running: false, enabled: true },
    ...over,
  }) as Task;

describe("describeStep / describeSteps", () => {
  it("renders each step kind as a short phrase", () => {
    expect(describeStep({ click: "button.new" })).toBe("click button.new");
    expect(describeStep({ waitFor: ".drawer" })).toBe("wait for .drawer");
    expect(describeStep({ waitMs: 400 })).toBe("wait 400ms");
    expect(describeStep({ fill: "input.q", text: "hello" })).toBe('fill input.q = "hello"');
  });

  it("clips a long filled value and flattens its whitespace", () => {
    const step = { fill: "input.q", text: `  a very long ${"x".repeat(60)}\nvalue ` };
    const line = describeStep(step);
    expect(line).toContain('fill input.q = "a very long');
    expect(line.endsWith('…"')).toBe(true);
    expect(line).not.toContain("\n");
  });

  it("joins an ordered list into one arrow-separated line", () => {
    expect(describeSteps([{ click: "button.new" }, { waitMs: 300 }])).toBe(
      "click button.new → wait 300ms",
    );
    expect(describeSteps([])).toBe("");
  });
});

describe("shotRows", () => {
  it("returns one row per captured shot, in listing order", () => {
    const rows = shotRows(
      [makeShot(), makeShot({ name: "shot-2.png", url: "/api/tasks/0001/shots/shot-2.png" })],
      "",
    );
    expect(rows.map((r) => r.meta.name)).toEqual(["shot-1.png", "shot-2.png"]);
  });

  it("pairs spec entries by index when the counts line up", () => {
    const shots = [makeShot({ label: "Bell popover" }), makeShot({ name: "shot-2.png" })];
    const body = bodyWithShots(
      JSON.stringify([
        { route: "/", label: "Bell popover", selector: ".popover", steps: [{ waitMs: 400 }] },
        { route: "/settings", selector: "main" },
      ]),
    );
    const rows = shotRows(shots, body);
    expect(rows[0].title).toBe("Bell popover");
    expect(rows[0].selector).toBe(".popover");
    expect(rows[0].stepsText).toBe("wait 400ms");
    expect(rows[1].selector).toBe("main");
    expect(rows[1].stepsText).toBeUndefined();
  });

  it("matches on target/route/label when the counts differ (a capture failed)", () => {
    // Two declared entries, one captured file: the surviving shot is the
    // second entry, matched by its route rather than by position.
    const shots = [makeShot({ route: "/settings", label: "Toggles" })];
    const body = bodyWithShots(
      JSON.stringify([
        { route: "/", label: "Bell popover" },
        { route: "/settings", label: "Toggles", selector: "main" },
      ]),
    );
    const rows = shotRows(shots, body);
    expect(rows[0].title).toBe("Toggles");
    expect(rows[0].selector).toBe("main");
  });

  it("leaves an unmatched row on ShotMeta fields alone", () => {
    const rows = shotRows([makeShot({ route: "/nope" })], bodyWithShots('[{"route":"/other"}]'));
    expect(rows[0].selector).toBeUndefined();
    expect(rows[0].stepsText).toBeUndefined();
    expect(rows[0].title).toBe("/nope");
  });

  it("never reuses one declared entry for two shots", () => {
    const shots = [makeShot(), makeShot({ name: "shot-2.png" })];
    const rows = shotRows(shots, bodyWithShots('[{"route":"/","selector":"main"}]'));
    expect(rows.filter((r) => r.selector === "main")).toHaveLength(1);
  });

  it("prefers the declared label, then the captured one, then route/target/name", () => {
    const body = bodyWithShots(JSON.stringify([{ route: "/", label: "Declared label" }]));
    expect(shotRows([makeShot({ label: "Captured label" })], body)[0].title).toBe("Declared label");
    expect(shotRows([makeShot({ label: "Captured label" })], "")[0].title).toBe("Captured label");
    expect(shotRows([makeShot()], "")[0].title).toBe("/");
    expect(shotRows([makeShot({ route: undefined })], "")[0].title).toBe("default");
    expect(
      shotRows([makeShot({ route: undefined, target: undefined as unknown as string })], "")[0]
        .title,
    ).toBe("shot-1.png");
  });

  it("shows target · route as context, minus whatever the title already says", () => {
    const labelled = shotRows([makeShot({ label: "Bell", route: "/settings" })], "");
    expect(labelled[0].context).toBe("default · /settings");
    // No label: the title IS the route, so only the target is left to say.
    const unlabelled = shotRows([makeShot({ route: "/settings" })], "");
    expect(unlabelled[0].title).toBe("/settings");
    expect(unlabelled[0].context).toBe("default");
    // Neither label nor route: the context would repeat the title exactly.
    const bare = shotRows([makeShot({ route: undefined })], "");
    expect(bare[0].title).toBe("default");
    expect(bare[0].context).toBe("");
  });

  it("carries #0603's provenance caption onto the row, but only when it adds something", () => {
    const withCaption = shotRows(
      [makeShot({ label: "Bell", route: "/x", provenance: "auto: matched src/ui-app/**" })],
      "",
    );
    expect(withCaption[0].provenance).toBe("auto: matched src/ui-app/**");
    // Same rule #0603's thumbnail used: a caption identical to the label adds
    // nothing over the title, so it is dropped.
    const redundant = shotRows(
      [makeShot({ label: "declared: Bell", provenance: "declared: Bell" })],
      "",
    );
    expect(redundant[0].provenance).toBeUndefined();
    // No caption at all (a store built before #0603) is simply absent.
    expect(shotRows([makeShot({ label: "Bell" })], "")[0].provenance).toBeUndefined();
  });

  it("survives a missing or unparseable ## Shots section", () => {
    for (const body of [
      undefined,
      "",
      "## Problem\nNo shots here.",
      "## Shots\n```json\n{oops\n```",
    ]) {
      const rows = shotRows([makeShot({ label: "Bell" })], body);
      expect(rows[0].title).toBe("Bell");
      expect(rows[0].selector).toBeUndefined();
    }
  });
});

// ---- the drawer actually renders them as rows ----

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

let shotsPayload: ShotMeta[] = [];
let shotsWarning: string | undefined;
let uiVerificationPayload: unknown = null;

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/shots"))
        return json({ ok: true, shots: shotsPayload, warning: shotsWarning });
      if (url.includes("/ui-verification"))
        return json({ ok: true, evidence: uiVerificationPayload });
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({
          tasks: [makeTask()],
          counts: { ...EMPTY_COUNTS, active: 1 },
          taskCount: 1,
        });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/diff-stats"))
        return json({
          ok: true,
          filesChanged: 1,
          additions: 2,
          deletions: 1,
          perFile: [{ filename: "a.ts", added: 2, removed: 1 }],
        });
      if (url.includes("/diff"))
        return json({
          ok: true,
          diff: {
            patch: [
              "diff --git a/a.ts b/a.ts",
              "index 1111111..2222222 100644",
              "--- a/a.ts",
              "+++ b/a.ts",
              "@@ -1 +1,2 @@",
              "-old",
              "+new",
              "+newer",
              "",
            ].join("\n"),
            truncated: false,
          },
        });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      if (url.includes("/checks")) return json({ ok: true, runs: [] });
      if (url.includes("/logs")) return json({ ok: true, logs: [] });
      return json({ ok: true });
    }),
  );
}

class FakeEventSource {
  addEventListener(): void {}
  close(): void {}
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

async function mountChanges(
  pinia: Pinia,
  task: Task = makeTask(),
): Promise<ReturnType<typeof mount>> {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: {
      plugins: [pinia, router],
      stubs: { teleport: true, Transition: true },
    },
  });
  // Switch tabs the way a human does, so the drawer's on-tab-open watchers
  // (shots, diff) actually fire.
  ui.activeTab = "changes";
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
  shotsPayload = [];
  shotsWarning = undefined;
  uiVerificationPayload = null;
});

describe("Changes → UI changes rows (#0611)", () => {
  it("renders one row per captured shot with its label, context, selector and steps", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [
      makeShot({ label: "Bell popover" }),
      makeShot({ name: "shot-2.png", url: "/u/2.png", label: "Toggles", route: "/settings" }),
    ];
    const task = makeTask({
      body: bodyWithShots(
        JSON.stringify([
          {
            target: "default",
            route: "/",
            label: "Bell popover",
            selector: '[data-test-id="notice-bell-popover"]',
            steps: [{ click: "button.bell" }, { waitMs: 400 }],
          },
          { target: "default", route: "/settings", label: "Toggles", selector: "main" },
        ]),
      ),
    });

    const wrapper = await mountChanges(pinia, task);

    // The shared attachment-row structure, NOT the old shot-grid/shot-thumb.
    expect(wrapper.find(".shot-grid").exists()).toBe(false);
    expect(wrapper.find(".shot-thumb").exists()).toBe(false);
    const rows = wrapper.findAll(".ui-changes .ff-pending-file");
    expect(rows).toHaveLength(2);

    const [first, second] = rows.map((r) => r.text());
    expect(first).toContain("Bell popover");
    expect(first).toContain("default · /");
    expect(first).toContain('[data-test-id="notice-bell-popover"]');
    expect(first).toContain("click button.bell → wait 400ms");
    expect(second).toContain("Toggles");
    expect(second).toContain("default · /settings");

    // Both detail lines carry the full text in a title for long values.
    const details = rows[0].findAll(".shot-row-detail");
    expect(details.map((d) => d.attributes("title"))).toEqual([
      "default · /",
      '[data-test-id="notice-bell-popover"]',
      "click button.bell → wait 400ms",
    ]);
  });

  it("shows a captured shot's provenance caption on the row (#0603)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    const auto = makeShot({
      name: "auto.png",
      url: "/u/auto.png",
      route: undefined,
      provenance: "auto: matched src/ui-app/**",
    });
    shotsPayload = [auto as ShotMeta];
    const wrapper = await mountChanges(pinia);

    const rows = wrapper.findAll(".ui-changes .ff-pending-file");
    expect(rows[0].text()).toContain("auto: matched src/ui-app/**");
  });

  it("falls back to ShotMeta fields, without breaking the layout, when there is no spec", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    // A PNG dropped into shots/ by hand: no manifest entry, so no label and no
    // route either — the store reports target "unknown".
    shotsPayload = [
      makeShot({ name: "hand-dropped.png", url: "/u/h.png", target: "unknown", route: undefined }),
    ];
    const wrapper = await mountChanges(pinia);

    const rows = wrapper.findAll(".ui-changes .ff-pending-file");
    expect(rows).toHaveLength(1);
    expect(rows[0].find(".ff-pending-file-name").text()).toBe("unknown");
    // No label and no route: the context line would only repeat the title, so
    // the row stays a single line rather than saying "unknown" twice.
    expect(rows[0].findAll(".shot-row-detail")).toHaveLength(0);
    expect(rows[0].find("img").attributes("src")).toBe("/u/h.png");
  });

  it("opens the multi-shot viewer at the clicked row's index", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [
      makeShot({ name: "shot-1.png", url: "/u/1.png", label: "First" }),
      makeShot({ name: "shot-2.png", url: "/u/2.png", label: "Second" }),
      makeShot({ name: "shot-3.png", url: "/u/3.png", label: "Third" }),
    ];
    const wrapper = await mountChanges(pinia);

    const rows = wrapper.findAll(".ui-changes .ff-pending-file");
    await rows[1].find("img").trigger("click");
    await flushPromises();
    expect(wrapper.find(".shot-viewer-print").exists()).toBe(true);
    const captions = wrapper.findAll(".shot-viewer-caption").map((c) => c.text());
    expect(captions.length).toBe(3);
    // The viewer opens on the clicked shot, and offers no delete (#0611 scope:
    // captured preview shots are not removable).
    expect(wrapper.find(".shot-remove").exists()).toBe(false);
  });

  it("keeps the expand control working on a captured row", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ name: "shot-1.png", url: "/u/1.png", label: "First" })];
    const wrapper = await mountChanges(pinia);

    const expand = wrapper.find('.ui-changes button[aria-label="See larger: First"]');
    expect(expand.exists()).toBe(true);
    await expand.trigger("click");
    await flushPromises();
    expect(wrapper.find(".shot-viewer-print img").attributes("src")).toBe("/u/1.png");
  });

  it("shows UI changes by default when shots exist, and Code changes when they don't", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsWarning = "The changed files resolve to the Docs site, not this task's area.";
    shotsPayload = [makeShot({ label: "Bell popover" })];
    const wrapper = await mountChanges(pinia);

    // With shots, the UI pane is the default: its warning and rows show, the
    // code diff does not.
    expect(wrapper.find(".shot-warning").text()).toContain("resolve to the Docs site");
    expect(wrapper.find(".ui-changes").exists()).toBe(true);
    expect(wrapper.find('[data-test-id="changes-tab-ui"]').attributes("aria-selected")).toBe(
      "true",
    );
    expect(wrapper.find(".changes-summary[aria-label='Code changes summary']").exists()).toBe(
      false,
    );
    expect(wrapper.find(".diff-file-list").exists()).toBe(false);

    // Switching to Code reveals the diff and hides the UI pane.
    await wrapper.find('[data-test-id="changes-tab-code"]').trigger("click");
    expect(wrapper.find(".ui-changes").exists()).toBe(false);
    expect(wrapper.find(".changes-summary[aria-label='Code changes summary']").exists()).toBe(true);
    expect(wrapper.find(".diff-file-list").exists()).toBe(true);
  });

  it("defaults to Code changes with no shots, keeping the Add-shot affordance under UI", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [];
    shotsWarning = undefined;
    const wrapper = await mountChanges(pinia, makeTask());

    // No shots → the code pane is the default; the diff is visible.
    expect(wrapper.find('[data-test-id="changes-tab-code"]').attributes("aria-selected")).toBe(
      "true",
    );
    expect(wrapper.find(".ui-changes").exists()).toBe(false);
    expect(wrapper.find(".changes-summary[aria-label='Code changes summary']").exists()).toBe(true);
    expect(wrapper.find(".diff-file-list").exists()).toBe(true);

    // The Add-shot affordance (#0627) lives in the UI pane.
    await wrapper.find('[data-test-id="changes-tab-ui"]').trigger("click");
    expect(wrapper.find(".ui-changes").exists()).toBe(true);
    expect(wrapper.text()).toContain("Add shot");
  });

  it("orders UI changes toolbar actions with Add shot on the right (#0778)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot()];
    const wrapper = await mountChanges(pinia, makeTask({ status: "review" }));
    await wrapper.find('[data-test-id="changes-tab-ui"]').trigger("click");
    await flushPromises();
    const actions = wrapper.find(".changes-summary-actions");
    expect(actions.exists()).toBe(true);
    const ids = actions.findAll("button").map((b) => b.attributes("data-test-id"));
    expect(ids).toEqual(["refresh-evidence", "add-shot"]);
  });

  it("shows a UI-changes empty state for an unmanaged, shot-less task", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [];
    const unmanaged = await mountChanges(pinia, makeTask({ status: "ready" }));
    await unmanaged.find('[data-test-id="changes-tab-ui"]').trigger("click");
    expect(unmanaged.find(".ui-changes").exists()).toBe(false);
    expect(unmanaged.text()).toContain("No UI changes yet");
  });
});

// ---- #0753: per-shot verdict icon + popover, no duplicate summary block ----

/** Handoff evidence as the gate writes it (#0753): one entry per capture. */
function handoffEvidence(
  captures: Array<Record<string, unknown>>,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    at: "2026-10-10T10:00:00Z",
    issues: [],
    blankShots: [],
    captures: captures.length,
    sourceIdentity: "abc1234",
    evidenceDir: "work/.attachments/0001/shots",
    captureDetails: captures.map((over) => ({
      target: "default",
      route: "/",
      url: "http://127.0.0.1:0/",
      finalRoute: "/",
      routeMatched: true,
      assertions: [],
      assertionsPassed: 0,
      assertionsChecked: 0,
      ...over,
    })),
    ...over,
  };
}

describe("Changes → handoff shot verdicts (#0753)", () => {
  it("drops the standalone 'Handoff UI verification' block entirely", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ name: "shot-1.png", url: "/u/1.png", label: "Bell popover" })];
    uiVerificationPayload = handoffEvidence([
      { shot: { name: "shot-1.png", path: "", url: "/u/1.png" } },
    ]);

    const wrapper = await mountChanges(pinia);
    expect(wrapper.text()).not.toContain("Handoff UI verification");
    // The provenance line (when, tested tree, PNG path) is no longer shown on a
    // normal handoff; only a stale capture gets a warning.
    expect(wrapper.find(".ui-changes-meta").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("tested tree abc1234");
  });

  it("shows a green check on a matching shot, with a matches popover", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ name: "shot-1.png", url: "/u/1.png", label: "Bell popover" })];
    uiVerificationPayload = handoffEvidence([
      { shot: { name: "shot-1.png", path: "", url: "/u/1.png" } },
    ]);

    const wrapper = await mountChanges(pinia);
    const icon = wrapper.find(".ui-changes .shot-row-verdict");
    expect(icon.exists()).toBe(true);
    expect(icon.attributes("data-verdict")).toBe("matches");
    expect(icon.text()).toBe("✓");
    expect(icon.attributes("aria-label")).toBe(
      "matches: every declared step ran and the capture was taken",
    );
    // Focusable so the shared tooltip opens on keyboard focus too.
    expect(icon.attributes("tabindex")).toBe("0");
  });

  it("shows a red cross on a checking shot, naming the failed step in the popover", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ name: "shot-1.png", url: "/u/1.png", label: "Bell popover" })];
    uiVerificationPayload = handoffEvidence([
      {
        shot: { name: "shot-1.png", path: "", url: "/u/1.png" },
        targetWarnings: ['click [data-test-id="fullscreen"]: Timeout 5000ms exceeded'],
      },
    ]);

    const wrapper = await mountChanges(pinia);
    const icon = wrapper.find(".ui-changes .shot-row-verdict");
    expect(icon.attributes("data-verdict")).toBe("check");
    expect(icon.text()).toBe("✕");
    expect(icon.attributes("aria-label")).toBe(
      'check: couldn\'t find [data-test-id="fullscreen"] to click',
    );
    // The raw message rides along in the popover tip.
    expect(icon.attributes("data-tip")).toContain("Timeout 5000ms exceeded");
  });

  it("carries a shot's own console error in its popover, once", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ name: "shot-1.png", url: "/u/1.png", label: "Bell popover" })];
    const issue = { kind: "console", message: "TypeError: boom", url: "/" };
    uiVerificationPayload = handoffEvidence(
      [{ shot: { name: "shot-1.png", path: "", url: "/u/1.png" }, issues: [issue] }],
      { issues: [issue] },
    );

    const wrapper = await mountChanges(pinia);
    const tip = wrapper.find(".ui-changes .shot-row-verdict").attributes("data-tip");
    expect(tip).toContain("TypeError: boom");
    // The shot owns the issue, so it is not repeated run-level under the list.
    expect(wrapper.find(".ui-changes-footnotes").exists()).toBe(false);
  });

  it("shows a run-level issue once under the list when no shot owns it", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ name: "shot-1.png", url: "/u/1.png", label: "Bell popover" })];
    uiVerificationPayload = handoffEvidence(
      [{ shot: { name: "shot-1.png", path: "", url: "/u/1.png" } }],
      {
        issues: [{ kind: "overflow", message: "content wider than viewport", viewportWidth: 375 }],
      },
    );

    const wrapper = await mountChanges(pinia);
    const footnotes = wrapper.find(".ui-changes-footnotes");
    expect(footnotes.exists()).toBe(true);
    expect(footnotes.text()).toContain("content wider than viewport");
  });

  it("renders the UI changes section when there are run-level issues but no shot rows", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [];
    uiVerificationPayload = handoffEvidence([], {
      issues: [{ kind: "blank", message: "No screenshots captured", url: "" }],
    });

    const wrapper = await mountChanges(pinia);
    // No shots → Code is the default; the run-level issues live under the UI tab.
    await wrapper.find('[data-test-id="changes-tab-ui"]').trigger("click");
    // The section should still render even with no shot rows, because there are
    // run-level issues to show.
    const uiChanges = wrapper.find(".ui-changes");
    expect(uiChanges.exists()).toBe(true);
    // The footnotes should display the run-level issue.
    const footnotes = wrapper.find(".ui-changes-footnotes");
    expect(footnotes.exists()).toBe(true);
    expect(footnotes.text()).toContain("No screenshots captured");
  });
});

// ---- #0773: the Changes tab's UI changes / Code changes subtabs ----

describe("Changes subtabs (#0773)", () => {
  it("keeps an explicit sub-tab choice until the task changes", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    installFetch();
    vi.stubGlobal("EventSource", FakeEventSource);
    shotsPayload = [makeShot({ label: "Bell popover" })];
    const wrapper = await mountChanges(pinia);

    // Shots exist → UI changes is the default.
    expect(wrapper.find('[data-test-id="changes-tab-ui"]').attributes("aria-selected")).toBe(
      "true",
    );

    // An explicit pick sticks.
    await wrapper.find('[data-test-id="changes-tab-code"]').trigger("click");
    expect(wrapper.find('[data-test-id="changes-tab-code"]').attributes("aria-selected")).toBe(
      "true",
    );

    // Opening a task with no shots resets the pick to that task's default: Code.
    const ui = useUiStore();
    shotsPayload = [];
    ui.open(makeTask({ id: "0002", title: "Another", body: "" }));
    ui.activeTab = "changes";
    await flushPromises();
    expect(wrapper.find('[data-test-id="changes-tab-code"]').attributes("aria-selected")).toBe(
      "true",
    );

    // A new task with shots defaults back to UI changes.
    shotsPayload = [makeShot()];
    ui.open(makeTask({ id: "0003", title: "Third", body: "" }));
    ui.activeTab = "changes";
    await flushPromises();
    expect(wrapper.find('[data-test-id="changes-tab-ui"]').attributes("aria-selected")).toBe(
      "true",
    );
  });
});
