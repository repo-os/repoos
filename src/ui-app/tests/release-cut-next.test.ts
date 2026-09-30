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

  it("shows no reuse hint for a freshly generated draft", async () => {
    await mountView();
    const modal = await openModal();

    button(modal, "Generate with AI")!.click();
    await flushPromises();

    expect(modal.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain("Highlights");
    expect(modal.querySelector(".rel-notes-hint")).toBeNull();
  });
});
