/**
 * Component coverage for the Cut a release panel's two #0590 affordances:
 *
 * - **Cut Next** — an alternative to typing a semver, sitting in the same band
 *   as the version input and its `→ v…` tag preview. It fills the field with
 *   Suggested next so Publish, the tag preview and every validation rule then
 *   behave exactly as if the operator had typed it.
 * - **Cache reuse** — when the server returns stored notes for an unchanged
 *   commit, the panel fills instantly and says why instead of spending a
 *   minute-plus on the agent again.
 *
 * Plus the #0621 side-panel persistence rules: closing the panel never resets
 * the session state (form fields, run log, live run progress), and the form
 * is only cleared once a cut succeeds.
 */
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import * as apiMod from "../src/api";
import ReleasesView from "../src/views/ReleasesView.vue";

const api = vi.spyOn(apiMod, "api");

let wrapper: VueWrapper | null = null;

function releaseStatus(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    supported: true,
    name: "Cut release",
    provider: "git-tag",
    branch: "main",
    version: "0.5.58",
    tag: "v0.5.58",
    latestTag: "v0.5.58",
    latestTagAt: "2026-09-28T00:00:00Z",
    latestTagSha: "abc1234",
    latestStableTag: "v0.5.58",
    head: "abc1234",
    clean: true,
    onReleaseBranch: true,
    tagExists: true,
    released: true,
    ready: false,
    blockers: [],
    releaseUrl: null,
    workflowUrl: null,
    ...overrides,
  };
}

/** The draft endpoint's payload — fresh by default, `cached: true` to reuse. */
function notesResponse(overrides: Record<string, unknown> = {}) {
  return {
    notes: "## Highlights\n- Shiny",
    sinceTag: "v0.5.58",
    commitCount: 3,
    truncated: false,
    cached: false,
    cachedAt: null,
    ...overrides,
  };
}

/** Answers every endpoint the view touches on mount or button press. */
function answer(path: string, status: Record<string, unknown>, notes: unknown): Promise<unknown> {
  if (path === "/api/release") return Promise.resolve(status);
  if (path === "/api/release/distribution")
    return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
  if (path === "/api/release/run")
    return Promise.resolve({
      state: "idle",
      phase: null,
      message: "",
      startedAt: null,
      updatedAt: null,
    });
  if (path === "/api/release/notes") return Promise.resolve(notes);
  if (path === "/api/release/notes/run")
    return Promise.resolve({
      state: "idle",
      startedAt: null,
      updatedAt: null,
      error: null,
      key: null,
      notes: null,
      sinceTag: null,
      commitCount: 0,
      truncated: false,
    });
  return Promise.reject(new Error(`unexpected api call: ${path}`));
}

function mockApi(
  status: Record<string, unknown> = releaseStatus(),
  notes: unknown = notesResponse(),
): void {
  api.mockImplementation((path: string) => answer(path, status, notes));
}

function button(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    (b.textContent ?? "").replace(/\s+/g, " ").trim().includes(label),
  );
}

async function mountView(): Promise<void> {
  mockApi();
  wrapper = mount(ReleasesView, { attachTo: document.body, global: { plugins: [createPinia()] } });
  await flushPromises();
}

/** Open the Cut a release panel and hand back its (teleported) content. */
async function openPanel(): Promise<HTMLElement> {
  const open =
    button(document.body, "Cut next release") ??
    button(document.body, "View progress") ??
    button(document.body, "Cut a release");
  expect(open, "panel open button").toBeTruthy();
  expect(open!.disabled, "open button enabled").toBe(false);
  open!.click();
  await flushPromises();
  const panel = document.body.querySelector<HTMLElement>(".release-drawer");
  expect(panel, "release panel in the DOM").toBeTruthy();
  return panel!;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  localStorage.clear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  api.mockReset();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Cut Next shortcut (#0590)", () => {
  it("fills Suggested next and enables Publish without typing", async () => {
    await mountView();
    const panel = await openPanel();
    const input = panel.querySelector<HTMLInputElement>("#rel-version")!;
    expect(input.value).toBe("");

    const publish = button(panel, "Publish")!;
    expect(publish.disabled, "nothing typed yet").toBe(true);

    button(panel, "Cut Next")!.click();
    await flushPromises();

    expect(input.value).toBe("0.5.59");
    expect(panel.querySelector(".rel-version-tag")!.textContent).toContain("v0.5.59");
    expect(publish.textContent).toContain("Publish v0.5.59");
    expect(publish.disabled).toBe(false);
  });

  it("keeps manual entry for custom and prerelease versions", async () => {
    await mountView();
    const panel = await openPanel();
    const input = panel.querySelector<HTMLInputElement>("#rel-version")!;

    // Raw DOM node (the panel is teleported), so drive v-model by hand:
    // assign then dispatch the input event Vue listens for.
    input.value = "1.2.0-rc.1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    expect(panel.querySelector(".rel-version-tag")!.textContent).toContain("· prerelease");
    const publish = button(panel, "Publish")!;
    expect(publish.textContent).toContain("Publish v1.2.0-rc.1");
    expect(publish.disabled).toBe(false);
    // Cut Next is an addition, not a replacement: it never blocks typing.
    expect(button(panel, "Cut Next")!.disabled).toBe(false);
  });

  it("has nothing to cut when no version is suggested", async () => {
    mockApi(
      releaseStatus({
        version: null,
        tag: null,
        latestTag: null,
        latestTagSha: null,
        latestStableTag: null,
        tagExists: false,
        released: false,
      }),
    );
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();

    expect(panel.textContent).toContain("Cut a release");
    expect(button(panel, "Cut Next")!.disabled).toBe(true);
    expect(button(panel, "Publish")!.disabled).toBe(true);
  });

  it("keeps the typed version when the panel is closed and reopened (#0621)", async () => {
    await mountView();
    let panel = await openPanel();
    button(panel, "Cut Next")!.click();
    await flushPromises();
    expect(panel.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("0.5.59");

    button(panel, "Cancel")!.click();
    await flushPromises();
    expect(document.querySelector(".release-drawer")).toBeNull();

    panel = await openPanel();
    const input = panel.querySelector<HTMLInputElement>("#rel-version")!;
    // Closing is not a reset: the half-filled form survives the round trip.
    expect(input.value, "reopening keeps the typed version").toBe("0.5.59");
    expect(button(panel, "Publish")!.disabled).toBe(false);
    // And the value stays editable exactly as if it had just been typed.
    button(panel, "Cut Next")!.click();
    await flushPromises();
    expect(input.value).toBe("0.5.59");
  });

  it("keeps typed notes across close and reopen (#0621)", async () => {
    await mountView();
    let panel = await openPanel();
    const textarea = panel.querySelector<HTMLTextAreaElement>("#rel-notes")!;
    textarea.value = "Operator notes in progress";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    button(panel, "Cancel")!.click();
    await flushPromises();

    panel = await openPanel();
    expect(
      panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value,
      "notes survive the close/reopen",
    ).toBe("Operator notes in progress");
  });

  it("shows live cut progress again after closing the panel mid-run (#0621)", async () => {
    let runState: Record<string, unknown> = {
      state: "running",
      phase: "checking",
      message: "Running checks…",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
      if (path === "/api/release/run") return Promise.resolve(runState);
      if (path === "/api/release/notes") return Promise.resolve(notesResponse());
      if (path === "/api/release/notes/run")
        return Promise.resolve({
          state: "idle",
          startedAt: null,
          updatedAt: null,
          error: null,
          key: null,
          notes: null,
          sinceTag: null,
          commitCount: 0,
          truncated: false,
        });
      return Promise.reject(new Error(`unexpected api call: ${path}`));
    });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    // Mid-run the page button doubles as the way back in.
    let panel = await openPanel();
    expect(panel.querySelector(".release-progress")?.textContent).toContain("Running checks");

    // Closing mid-run keeps the state; reopening shows the same live run.
    button(panel, "Close")!.click();
    await flushPromises();
    expect(document.querySelector(".release-drawer")).toBeNull();

    runState = { ...runState, phase: "tagging", message: "Pushing the tag…" };
    panel = await openPanel();
    expect(panel.querySelector(".release-progress")?.textContent).toContain("Pushing the tag");
  });

  it("clears the form only after a successful cut, not on close (#0621)", async () => {
    let runState: Record<string, unknown> = {
      state: "idle",
      phase: null,
      message: "",
      startedAt: null,
      updatedAt: null,
    };
    api.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/api/release" && opts?.method === "POST") {
        // The server answers the cut with the run in flight, as it really does.
        runState = {
          state: "running",
          phase: "committing",
          message: "Committing the release…",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return Promise.resolve({ run: runState });
      }
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
      if (path === "/api/release/run") return Promise.resolve(runState);
      if (path === "/api/release/notes") return Promise.resolve(notesResponse());
      if (path === "/api/release/notes/run")
        return Promise.resolve({
          state: "idle",
          startedAt: null,
          updatedAt: null,
          error: null,
          key: null,
          notes: null,
          sinceTag: null,
          commitCount: 0,
          truncated: false,
        });
      return Promise.reject(new Error(`unexpected api call: ${path}`));
    });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    let panel = await openPanel();
    button(panel, "Cut Next")!.click();
    await flushPromises();
    const textarea = panel.querySelector<HTMLTextAreaElement>("#rel-notes")!;
    textarea.value = "Ship it";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    button(panel, "Publish v0.5.59")!.click();
    await flushPromises();
    // The run started; the panel is still open with live progress (fields
    // hidden while running), not reset.
    expect(panel.querySelector(".release-progress")?.textContent).toContain("Committing");
    expect(panel.querySelector("#rel-version")).toBeNull();

    // A later poll observes the finished run: the panel closes, and the form
    // resets so the next cut starts fresh.
    runState = {
      state: "succeeded",
      phase: null,
      message: "Published v0.5.59",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await new Promise((r) => setTimeout(r, 1100));
    await flushPromises();
    expect(document.querySelector(".release-drawer")).toBeNull();

    panel = await openPanel();
    // Fresh form for the next cut — this is the one sanctioned reset.
    expect(panel.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("");
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
  });
});

describe("AI release notes cache reuse (#0590)", () => {
  it("fills from the cached draft and says it was reused", async () => {
    mockApi(
      releaseStatus(),
      notesResponse({
        cached: true,
        cachedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      }),
    );
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();

    button(panel, "Generate with AI")!.click();
    await flushPromises();

    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    const hint = panel.querySelector(".rel-notes-hint");
    expect(hint?.textContent ?? "").toContain("Reused saved notes");
    expect(hint?.textContent ?? "").toContain("no new AI run");
    expect(panel.querySelector(".rel-notes-error")).toBeNull();
  });

  it("fills a saved draft the moment the panel opens, without clicking Generate", async () => {
    mockApi(releaseStatus(), notesResponse({ cached: true, cachedAt: new Date().toISOString() }));
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();
    await flushPromises();

    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    expect(panel.querySelector(".rel-notes-hint")?.textContent ?? "").toContain("no new AI run");
    const lookup = api.mock.calls.find(([path]) => path === "/api/release/notes");
    expect(JSON.parse(String((lookup?.[1] as { body?: string })?.body))).toMatchObject({
      cachedOnly: true,
    });
  });

  it("keeps the typed version across a page reload (remount)", async () => {
    mockApi(releaseStatus(), notesResponse({}));
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    let panel = await openPanel();
    const input = panel.querySelector<HTMLInputElement>("#rel-version")!;
    input.value = "0.9.1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    wrapper.unmount();
    document.body.innerHTML = "";

    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    panel = await openPanel();
    expect(panel.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("0.9.1");
  });
});

/**
 * The server-tracked draft run (#0605): Generate starts the run and the view
 * polls `GET /api/release/notes/run` until the draft lands — so "Drafting…"
 * survives closing the modal, picks up on reopen, and fills the field the
 * moment the run (the mock in these tests) settles. The pickups are driven
 * by the view's 1s poll tick, so these suites use fake timers.
 */
describe("AI release notes tracked run (#0605)", () => {
  let draftingState: Record<string, unknown>;

  function idleRun(): Record<string, unknown> {
    return {
      state: "idle",
      startedAt: null,
      updatedAt: null,
      error: null,
      key: null,
      notes: null,
      sinceTag: "v0.5.58",
      commitCount: 0,
      truncated: false,
    };
  }

  function apiWithNotesRun(post: unknown): void {
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
      if (path === "/api/release/run")
        return Promise.resolve({
          state: "idle",
          phase: null,
          message: "",
          startedAt: null,
          updatedAt: null,
        });
      if (path === "/api/release/notes") return Promise.resolve(post);
      if (path === "/api/release/notes/run") return Promise.resolve(draftingState);
      return Promise.reject(new Error(`unexpected api call: ${path}`));
    });
  }

  beforeEach(() => {
    draftingState = idleRun();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function runningRun(): Record<string, unknown> {
    return { ...idleRun(), state: "running", key: "k-run", startedAt: new Date().toISOString() };
  }

  function succeededRun(notes = "## Highlights\n- Shiny"): Record<string, unknown> {
    return {
      ...idleRun(),
      state: "succeeded",
      key: "k-run",
      notes,
      commitCount: 3,
      updatedAt: new Date().toISOString(),
    };
  }

  it("shows Drafting… while the run executes and fills the field when it lands", async () => {
    apiWithNotesRun({
      run: runningRun(),
    });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();

    button(panel, "Generate with AI")!.click();
    await flushPromises();

    // The tracked run is in flight: Drafting state on and the poll alive.
    expect(button(panel, "Drafting…")!.disabled).toBe(true);
    expect(button(panel, "Publish")!.disabled).toBe(true);
    expect(panel.querySelector(".rel-notes-drafting")).toBeTruthy();
    // #0630: the drafting row carries the shared ActivityIndicator dots, the
    // same working treatment the task drawer uses for coding/reviewing.
    expect(panel.querySelector(".rel-notes-drafting .ai[role='status']")).toBeTruthy();
    expect(panel.querySelector(".rel-notes-drafting .ai")?.getAttribute("aria-label")).toContain(
      "Drafting release notes",
    );

    draftingState = succeededRun();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    expect(panel.querySelector(".rel-notes-drafting")).toBeNull();
    expect(button(panel, "Generate with AI")).toBeTruthy();
    expect(panel.querySelector(".rel-notes-error")).toBeNull();
  });

  it("reopening mid-run shows Drafting… and picks up the result when it lands", async () => {
    draftingState = runningRun();
    apiWithNotesRun({ run: draftingState });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    let panel = await openPanel();

    // Click Generate, close, and reopen while the run is still going. (The
    // GET already reported a run in flight on mount, so the button reads
    // "Drafting…" from the start — that's the reopen pickup doing its job.)
    button(panel, "Drafting…")!.click();
    await flushPromises();
    button(document.body, "Cancel")!.click();
    await flushPromises();
    expect(document.querySelector(".release-drawer")).toBeNull();

    panel = await openPanel();
    expect(button(panel, "Drafting…")).toBeTruthy();
    expect(panel.querySelector(".rel-notes-drafting")).toBeTruthy();
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");

    draftingState = succeededRun();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
  });

  it("drops a slow open-sync response that arrives after a newer poll (#0630 review)", async () => {
    // The panel-open sync and the poll share one sequence: a held-back open
    // sync resolving AFTER a poll already applied "running" must be dropped,
    // or it would overwrite the live state with its stale terminal snapshot
    // and tickStopIfNeeded would stop the poll loop mid-draft.
    draftingState = runningRun();
    let calls = 0;
    let resolveSync: (value: unknown) => void = () => {};
    const heldSync = new Promise((resolve) => {
      resolveSync = resolve;
    });
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
      if (path === "/api/release/run")
        return Promise.resolve({
          state: "idle",
          phase: null,
          message: "",
          startedAt: null,
          updatedAt: null,
        });
      if (path === "/api/release/notes")
        return Promise.resolve({
          notes: "",
          sinceTag: "v0.5.58",
          commitCount: 3,
          truncated: false,
        });
      if (path === "/api/release/notes/run") {
        calls += 1;
        // Call 1 is the mount poll; call 2 is the panel-open sync (held);
        // later calls are poll ticks.
        return calls === 2 ? heldSync : Promise.resolve(draftingState);
      }
      return Promise.reject(new Error(`unexpected api call: ${path}`));
    });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();
    expect(panel.querySelector(".rel-notes-drafting")).toBeTruthy();

    // A poll tick fires first (the newer request) and applies "running";
    // only then does the held-back open sync resolve with a stale snapshot.
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(panel.querySelector(".rel-notes-drafting")).toBeTruthy();

    resolveSync(succeededRun("Stale terminal snapshot"));
    await flushPromises();
    // The stale snapshot was dropped: still drafting, still nothing placed.
    expect(panel.querySelector(".rel-notes-drafting")).toBeTruthy();
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
    expect(panel.querySelector(".rel-notes-error")).toBeNull();

    // And the poll loop survived: the next tick observes the draft landing.
    draftingState = succeededRun();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Shiny");
    expect(panel.querySelector(".rel-notes-drafting")).toBeNull();
  });

  it("never backfills from a finished run this session did not watch", async () => {
    // A pre-existing succeeded run from before this page load, with a key the
    // session never observed: reopening must leave the field empty.
    draftingState = succeededRun("Stale pre-existing draft");
    apiWithNotesRun({ run: runningRun() });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();

    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
    expect(button(panel, "Generate with AI")).toBeTruthy();
    expect(button(panel, "Drafting…")).toBeUndefined();
    expect(panel.querySelector(".rel-notes-drafting")).toBeNull();
  });

  it("keeps the version and the draft state across close and reopen mid-run (#0630)", async () => {
    draftingState = runningRun();
    apiWithNotesRun({ run: runningRun() });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    let panel = await openPanel();

    // Pick the version, then start the draft and step away.
    button(panel, "Cut Next")!.click();
    await flushPromises();
    expect(panel.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("0.5.59");
    button(panel, "Drafting…")!.click();
    await flushPromises();
    button(document.body, "Cancel")!.click();
    await flushPromises();
    expect(document.querySelector(".release-drawer")).toBeNull();

    panel = await openPanel();
    expect(panel.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("0.5.59");
    expect(button(panel, "Drafting…")).toBeTruthy();
    expect(panel.querySelector(".rel-notes-drafting .ai")).toBeTruthy();

    // The draft lands while the panel is closed: the field fills and the
    // version the operator picked is still there for Publish.
    draftingState = succeededRun();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    expect(panel.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("0.5.59");
    expect(button(panel, "Publish v0.5.59")!.disabled).toBe(false);
  });

  it("surfaces a draft that FAILED while the panel was closed (#0630)", async () => {
    // The run failed before this page load (or while the panel was shut): a
    // fresh session never watched it, but reopening must still say so.
    draftingState = {
      ...idleRun(),
      state: "failed",
      key: "k-run",
      error: "The agent gave up.",
      updatedAt: new Date().toISOString(),
    };
    apiWithNotesRun({ notes: "", sinceTag: "v0.5.58", commitCount: 3, truncated: false });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    let panel = await openPanel();

    const err = panel.querySelector(".rel-notes-error");
    expect(err?.textContent ?? "").toContain("The agent gave up.");
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");

    // And it stays surfaced across another close/reopen round trip.
    button(document.body, "Cancel")!.click();
    await flushPromises();
    panel = await openPanel();
    expect(panel.querySelector(".rel-notes-error")?.textContent ?? "").toContain("gave up");
  });

  it("says a finished draft is ready to reuse when reopening after it completed (#0630)", async () => {
    // A succeeded run this session never watched must not drop text into the
    // field (#0605's rule) — but the reopen must not look like nothing
    // happened either: an explicit hint names the ready draft.
    draftingState = succeededRun("Draft finished while away");
    apiWithNotesRun({ notes: "", sinceTag: "v0.5.58", commitCount: 3, truncated: false });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();

    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
    const hint = panel.querySelector(".rel-notes-hint");
    expect(hint?.textContent ?? "").toContain("finished while you were away");
    expect(hint?.textContent ?? "").toContain("Generate with AI will reuse it");
    expect(panel.querySelector(".rel-notes-error")).toBeNull();
    expect(button(panel, "Generate with AI")).toBeTruthy();
  });

  it("surfaces the run's failure on the field instead of a silent nothing", async () => {
    apiWithNotesRun({ run: runningRun() });
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = await openPanel();

    button(panel, "Generate with AI")!.click();
    await flushPromises();

    draftingState = { ...idleRun(), state: "failed", error: "The agent returned nothing usable." };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    const err = panel.querySelector(".rel-notes-error");
    expect(err?.textContent ?? "").toContain("nothing usable");
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
    expect(button(panel, "Generate with AI")).toBeTruthy();
  });
});

describe("?drawer=cut deep link", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("opens the panel on a dirty tree but keeps Publish disabled", async () => {
    window.history.replaceState({}, "", "/releases?drawer=cut");
    mockApi(releaseStatus({ clean: false }));
    wrapper = mount(ReleasesView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();
    const panel = document.body.querySelector<HTMLElement>(".release-drawer");
    expect(panel, "panel opened by the query param").toBeTruthy();
    expect(button(panel!, "Publish")!.disabled).toBe(true);
    expect(panel!.textContent).toContain("Publishing is disabled");
  });
});
