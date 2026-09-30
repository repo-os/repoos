/**
 * Component coverage for the Cut a release modal's two #0590 affordances:
 *
 * - **Cut Next** — an alternative to typing a semver, sitting in the same band
 *   as the version input and its `→ v…` tag preview. It fills the field with
 *   Suggested next so Publish, the tag preview and every validation rule then
 *   behave exactly as if the operator had typed it.
 * - **Cache reuse** — when the server returns stored notes for an unchanged
 *   commit, the modal fills instantly and says why instead of spending a
 *   minute-plus on the agent again.
 */
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
  wrapper = mount(ReleasesView, { attachTo: document.body });
  await flushPromises();
}

/** Open the Cut a release modal and hand back its (teleported) content. */
async function openModal(): Promise<HTMLElement> {
  const open = button(document.body, "Cut next release") ?? button(document.body, "Cut a release");
  expect(open, "modal open button").toBeTruthy();
  expect(open!.disabled, "open button enabled").toBe(false);
  open!.click();
  await flushPromises();
  const modal = document.body.querySelector<HTMLElement>(".release-modal");
  expect(modal, "release modal in the DOM").toBeTruthy();
  return modal!;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
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
    const modal = await openModal();
    const input = modal.querySelector<HTMLInputElement>("#rel-version")!;
    expect(input.value).toBe("");

    const publish = button(modal, "Publish")!;
    expect(publish.disabled, "nothing typed yet").toBe(true);

    button(modal, "Cut Next")!.click();
    await flushPromises();

    expect(input.value).toBe("0.5.59");
    expect(modal.querySelector(".rel-version-tag")!.textContent).toContain("v0.5.59");
    expect(publish.textContent).toContain("Publish v0.5.59");
    expect(publish.disabled).toBe(false);
  });

  it("keeps manual entry for custom and prerelease versions", async () => {
    await mountView();
    const modal = await openModal();
    const input = modal.querySelector<HTMLInputElement>("#rel-version")!;

    // Raw DOM node (the modal is teleported), so drive v-model by hand:
    // assign then dispatch the input event Vue listens for.
    input.value = "1.2.0-rc.1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    expect(modal.querySelector(".rel-version-tag")!.textContent).toContain("· prerelease");
    const publish = button(modal, "Publish")!;
    expect(publish.textContent).toContain("Publish v1.2.0-rc.1");
    expect(publish.disabled).toBe(false);
    // Cut Next is an addition, not a replacement: it never blocks typing.
    expect(button(modal, "Cut Next")!.disabled).toBe(false);
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
    wrapper = mount(ReleasesView, { attachTo: document.body });
    await flushPromises();
    const modal = await openModal();

    expect(modal.textContent).toContain("Cut a release");
    expect(button(modal, "Cut Next")!.disabled).toBe(true);
    expect(button(modal, "Publish")!.disabled).toBe(true);
  });

  it("works again after the modal is closed and reopened", async () => {
    await mountView();
    let modal = await openModal();
    button(modal, "Cut Next")!.click();
    await flushPromises();
    expect(modal.querySelector<HTMLInputElement>("#rel-version")!.value).toBe("0.5.59");

    button(modal, "Cancel")!.click();
    await flushPromises();

    modal = await openModal();
    const input = modal.querySelector<HTMLInputElement>("#rel-version")!;
    expect(input.value, "reopening clears the typed version").toBe("");
    button(modal, "Cut Next")!.click();
    await flushPromises();
    expect(input.value).toBe("0.5.59");
    expect(button(modal, "Publish")!.disabled).toBe(false);
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
    wrapper = mount(ReleasesView, { attachTo: document.body });
    await flushPromises();
    const modal = await openModal();

    button(modal, "Generate with AI")!.click();
    await flushPromises();

    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    const hint = modal.querySelector(".rel-notes-hint");
    expect(hint?.textContent ?? "").toContain("Reused saved notes");
    expect(hint?.textContent ?? "").toContain("no new AI run");
    expect(modal.querySelector(".rel-notes-error")).toBeNull();
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
    wrapper = mount(ReleasesView, { attachTo: document.body });
    await flushPromises();
    const modal = await openModal();

    button(modal, "Generate with AI")!.click();
    await flushPromises();

    // The tracked run is in flight: Drafting state on and the poll alive.
    expect(button(modal, "Drafting…")!.disabled).toBe(true);
    expect(button(modal, "Publish")!.disabled).toBe(true);
    expect(modal.querySelector(".rel-notes-drafting")).toBeTruthy();

    draftingState = succeededRun();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    expect(modal.querySelector(".rel-notes-drafting")).toBeNull();
    expect(button(modal, "Generate with AI")).toBeTruthy();
    expect(modal.querySelector(".rel-notes-error")).toBeNull();
  });

  it("reopening mid-run shows Drafting… and picks up the result when it lands", async () => {
    draftingState = runningRun();
    apiWithNotesRun({ run: draftingState });
    wrapper = mount(ReleasesView, { attachTo: document.body });
    await flushPromises();
    let modal = await openModal();

    // Click Generate, close, and reopen while the run is still going. (The
    // GET already reported a run in flight on mount, so the button reads
    // "Drafting…" from the start — that's the reopen pickup doing its job.)
    button(modal, "Drafting…")!.click();
    await flushPromises();
    button(document.body, "Cancel")!.click();
    await flushPromises();
    expect(document.querySelector(".release-modal")).toBeNull();

    modal = await openModal();
    expect(button(modal, "Drafting…")).toBeTruthy();
    expect(modal.querySelector(".rel-notes-drafting")).toBeTruthy();
    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");

    draftingState = succeededRun();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
  });

  it("never backfills from a finished run this session did not watch", async () => {
    // A pre-existing succeeded run from before this page load, with a key the
    // session never observed: reopening must leave the field empty.
    draftingState = succeededRun("Stale pre-existing draft");
    apiWithNotesRun({ run: runningRun() });
    wrapper = mount(ReleasesView, { attachTo: document.body });
    await flushPromises();
    const modal = await openModal();

    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
    expect(button(modal, "Generate with AI")).toBeTruthy();
    expect(button(modal, "Drafting…")).toBeUndefined();
    expect(modal.querySelector(".rel-notes-drafting")).toBeNull();
  });

  it("surfaces the run's failure on the field instead of a silent nothing", async () => {
    apiWithNotesRun({ run: runningRun() });
    wrapper = mount(ReleasesView, { attachTo: document.body });
    await flushPromises();
    const modal = await openModal();

    button(modal, "Generate with AI")!.click();
    await flushPromises();

    draftingState = { ...idleRun(), state: "failed", error: "The agent returned nothing usable." };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    const err = modal.querySelector(".rel-notes-error");
    expect(err?.textContent ?? "").toContain("nothing usable");
    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toBe("");
    expect(button(modal, "Generate with AI")).toBeTruthy();
  });
});
