/**
 * Component coverage for #1126: Generate with AI asks what should happen when
 * the draft is ready, remembers the answer, and reflects the server-owned
 * pending publish — including after a reload and when it fails.
 *
 * The actual publishing guards live server-side (see release-auto-publish
 * tests); these tests pin the UI contract: the shared dialog, the exact
 * version/tag in the request, Cancel, and the failure banner.
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
    commitsBehindMain: 3,
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

function idleNotesRun() {
  return {
    state: "idle",
    startedAt: null,
    updatedAt: null,
    error: null,
    key: null,
    notes: null,
    sinceTag: null,
    commitCount: 0,
    truncated: false,
  };
}

interface Answers {
  autoPublish?: unknown;
  defaultWhenReady?: "publish" | "notify";
  autoPublishAfterDelete?: unknown;
  notes?: unknown;
  readyRun?: unknown;
}

function answer(path: string, opts: RequestInit | undefined, config: Answers): Promise<unknown> {
  if (path === "/api/release") return Promise.resolve(releaseStatus());
  if (path === "/api/release/distribution")
    return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
  if (path === "/api/release/email") return Promise.resolve({});
  if (path === "/api/release/run")
    return Promise.resolve({
      state: "idle",
      phase: null,
      message: "",
      startedAt: null,
      updatedAt: null,
    });
  if (path === "/api/release/notes/unpushed") return Promise.resolve(null);
  if (path === "/api/release/notes/run") return Promise.resolve(idleNotesRun());
  if (path === "/api/release/notes/auto-publish") {
    if ((opts?.method ?? "GET") === "DELETE")
      return Promise.resolve({ autoPublish: config.autoPublishAfterDelete ?? null });
    return Promise.resolve({
      autoPublish: config.autoPublish ?? null,
      defaultWhenReady: config.defaultWhenReady ?? "notify",
    });
  }
  if (path === "/api/release/notes") {
    return Promise.resolve(
      config.notes ?? {
        run: {
          state: "running",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          error: null,
          key: "k",
          notes: null,
          sinceTag: "v0.5.58",
          commitCount: 3,
          truncated: false,
        },
        autoPublish: { state: "waiting" },
      },
    );
  }
  if (path === "/api/config") return Promise.resolve({});
  return Promise.reject(new Error(`unexpected api call: ${path}`));
}

function mockApi(config: Answers = {}): void {
  api.mockImplementation((path: string, opts?: RequestInit) => answer(path, opts, config));
}

function button(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    (b.textContent ?? "").replace(/\s+/g, " ").trim().includes(label),
  );
}

async function mountView(config: Answers = {}): Promise<void> {
  mockApi(config);
  wrapper = mount(ReleasesView, { attachTo: document.body, global: { plugins: [createPinia()] } });
  await flushPromises();
}

async function openPanel(): Promise<HTMLElement> {
  const open =
    button(document.body, "Cut next release") ??
    button(document.body, "View progress") ??
    button(document.body, "Cut a release");
  expect(open, "panel open button").toBeTruthy();
  open!.click();
  await flushPromises();
  const panel = document.body.querySelector<HTMLElement>(".release-drawer");
  expect(panel, "release panel in the DOM").toBeTruthy();
  return panel!;
}

async function openChooser(panel: HTMLElement): Promise<HTMLElement> {
  button(panel, "Generate with AI")!.click();
  await flushPromises();
  const dialog = document.body.querySelector<HTMLElement>(".rel-whenready");
  expect(dialog, "when-ready chooser").toBeTruthy();
  return dialog!;
}

/** The notes POST body from the most recent deliberate draft request. */
function notesPost(): Record<string, unknown> | null {
  const call = [...api.mock.calls].reverse().find(([path, opts]) => {
    if (path !== "/api/release/notes" || opts?.method !== "POST") return false;
    const body = JSON.parse(String((opts as RequestInit).body)) as Record<string, unknown>;
    return body.cachedOnly !== true;
  });
  if (!call) return null;
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
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
  vi.useRealTimers();
});

describe("Generate with AI: when the draft is ready (#1126)", () => {
  it("shows both answers and the exact tag; closing chooses nothing", async () => {
    await mountView();
    const panel = await openPanel();
    const dialog = await openChooser(panel);

    expect(dialog.textContent).toContain("Publish automatically");
    expect(dialog.textContent).toContain("Notify me");
    expect(dialog.textContent).toContain("v0.5.59");

    button(dialog, "Cancel")!.click();
    await flushPromises();

    expect(document.body.querySelector(".rel-whenready")).toBeNull();
    expect(notesPost(), "closing must not start a draft").toBeNull();
  });

  it("Publish automatically sends the confirmed version/tag and can be cancelled", async () => {
    vi.useFakeTimers();
    await mountView();
    const panel = await openPanel();
    const dialog = await openChooser(panel);

    dialog.querySelector<HTMLInputElement>("input[value='publish']")!.click();
    await flushPromises();
    button(dialog, "Generate notes")!.click();
    await flushPromises();

    expect(notesPost()).toMatchObject({
      whenReady: "publish",
      version: "0.5.59",
      confirmTag: "v0.5.59",
    });
    // The default write is DEFERRED while the promise is pending: writing
    // repoos.toml now would dirty the tree and the clean-tree pre-check would
    // fail the cut just promised (#1126 review).
    expect(
      api.mock.calls.some(([path]) => path === "/api/config"),
      "no config write while the promise is pending",
    ).toBe(false);

    // The server snapshot drives the page banner, not local optimism.
    mockApi({
      autoPublish: {
        requestedAt: "2026-11-17T00:00:00Z",
        state: "waiting",
        mode: "publish",
        version: "0.5.59",
        tag: "v0.5.59",
        notes: null,
        knownIssues: null,
        head: null,
        draftKey: null,
        error: null,
        updatedAt: "2026-11-17T00:00:00Z",
      },
      autoPublishAfterDelete: {
        requestedAt: "2026-11-17T00:00:00Z",
        state: "cancelled",
        mode: "publish",
        version: "0.5.59",
        tag: "v0.5.59",
        notes: null,
        knownIssues: null,
        head: null,
        draftKey: null,
        error: null,
        updatedAt: "2026-11-17T00:00:01Z",
      },
    });
    // The 1s tick applies the waiting snapshot.
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    const banner = document.body.querySelector("[data-test-id='release-auto-publish']");
    expect(banner?.textContent).toContain("Will publish v0.5.59 when the notes are ready");
    button(banner as ParentNode, "Cancel")!.click();
    await flushPromises();

    const del = api.mock.calls.find(
      ([path, opts]) => path === "/api/release/notes/auto-publish" && opts?.method === "DELETE",
    );
    expect(del).toBeTruthy();
    expect(document.body.querySelector("[data-test-id='release-auto-publish']")).toBeNull();
  });

  it("Notify me asks for a notification and does not offer a pending publish", async () => {
    await mountView({
      notes: {
        notes: "## Highlights\n- Notify me draft",
        sinceTag: "v0.5.58",
        commitCount: 3,
        truncated: false,
      },
      autoPublish: null,
    });
    const panel = await openPanel();
    const dialog = await openChooser(panel);

    // Default answer comes from the saved setting.
    expect(dialog.querySelector<HTMLInputElement>("input[value='notify']")!.checked).toBe(true);
    button(dialog, "Generate notes")!.click();
    await flushPromises();

    expect(notesPost()).toMatchObject({ whenReady: "notify", version: "0.5.59" });
    expect(panel.querySelector<HTMLTextAreaElement>("#rel-notes")!.value).toContain(
      "Notify me draft",
    );
    expect(document.body.querySelector("[data-test-id='release-auto-publish']")).toBeNull();
  });

  it("Generate notes and publish confirms the tag before starting option 1", async () => {
    await mountView();
    const panel = await openPanel();

    button(panel, "Generate notes and publish")!.click();
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>(".cc-modal");
    expect(dialog?.textContent).toContain("Generate notes and publish v0.5.59?");
    button(dialog as ParentNode, "Generate notes and publish")!.click();
    await flushPromises();

    expect(notesPost()).toMatchObject({
      whenReady: "publish",
      version: "0.5.59",
      confirmTag: "v0.5.59",
    });
  });

  it("a waiting NOTIFY record never claims an automatic publish is pending", async () => {
    await mountView({
      autoPublish: {
        requestedAt: "2026-11-17T00:00:00Z",
        state: "waiting",
        mode: "notify",
        version: "0.5.59",
        tag: "v0.5.59",
        notes: null,
        knownIssues: null,
        head: null,
        draftKey: null,
        error: null,
        updatedAt: "2026-11-17T00:00:00Z",
      },
    });
    await flushPromises();

    const banner = document.body.querySelector("[data-test-id='release-auto-publish']");
    expect(banner?.textContent).toContain("you'll be notified when they're ready");
    expect(banner?.textContent).toContain("nothing is published until you press Publish");
    expect(banner?.textContent).not.toMatch(/will publish|published only after|automatic publish/i);
  });

  it("shows a server-owned failure with its reason and a Dismiss action", async () => {
    await mountView({
      autoPublish: {
        requestedAt: "2026-11-17T00:00:00Z",
        state: "failed",
        mode: "publish",
        version: "0.5.59",
        tag: "v0.5.59",
        notes: null,
        knownIssues: null,
        head: null,
        draftKey: null,
        error: "The working tree was dirty when the notes became ready, so nothing was published.",
        updatedAt: "2026-11-17T00:00:01Z",
      },
    });
    await flushPromises();

    const banner = document.body.querySelector("[data-test-id='release-auto-publish']");
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.textContent).toContain("v0.5.59 was not published automatically");
    expect(banner?.textContent).toContain("working tree was dirty");
    expect(button(banner as ParentNode, "Dismiss")).toBeTruthy();
  });

  it("writes the deferred default once the promise settles, never before", async () => {
    vi.useFakeTimers();
    await mountView();
    const panel = await openPanel();
    const dialog = await openChooser(panel);

    dialog.querySelector<HTMLInputElement>("input[value='publish']")!.click();
    await flushPromises();
    button(dialog, "Generate notes")!.click();
    await flushPromises();

    // The POST answer carries the fresh waiting promise; the write is held.
    expect(notesPost()).toMatchObject({ whenReady: "publish" });
    expect(
      api.mock.calls.some(([path]) => path === "/api/config"),
      "nothing written while the promise runs",
    ).toBe(false);

    // The promise settles: the deferred write lands now.
    mockApi({ autoPublish: null });
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    const saved = api.mock.calls.find(
      ([path, opts]) => path === "/api/config" && opts?.method === "PATCH",
    );
    expect(saved, "deferred write lands on settle").toBeTruthy();
    expect(JSON.parse(String((saved?.[1] as RequestInit).body))).toMatchObject({
      "release.notesWhenReady": "publish",
    });
  });

  it("choosing the already-saved default does not touch repoos.toml", async () => {
    await mountView({ defaultWhenReady: "notify" });
    const panel = await openPanel();
    const dialog = await openChooser(panel);

    // Notify is the saved default; confirming it must not PATCH the config.
    button(dialog, "Generate notes")!.click();
    await flushPromises();

    expect(notesPost()).toMatchObject({ whenReady: "notify" });
    expect(api.mock.calls.some(([path]) => path === "/api/config")).toBe(false);
  });
});
