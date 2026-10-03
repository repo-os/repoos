/**
 * Enrichment-in-progress on input cards (#0631): submitting a new input marks
 * its id as "enriching" in the repo store so the Inputs list/board cards show
 * the same ActivityIndicator as the New input panel acknowledgment, until SSE
 * `input.enriched` arrives (clears it, in place) or the failure backstop
 * timeout clears it — the server emits no event when enrichment fails or
 * returns nothing parseable, so without the backstop the spinner would stick.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useRepoStore } from "../src/stores/repo";
import InputCard from "../src/components/InputCard.vue";
import type { Input } from "../../core/input.js";
import type { RepoEvent } from "../src/types";

const json = async (data: unknown) => ({ ok: true, status: 201, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) await nextTick();
}

function stubPostInput(body: { id: string }): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL, opts?: RequestInit) => {
      const u = String(url);
      if (u === "/api/inputs" && opts?.method === "POST") return Promise.resolve(json(body));
      return Promise.reject(new Error("unexpected fetch: " + u));
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rawInput = (id: string): Input =>
  ({
    id,
    number: "0007",
    title: "Saw a bug on the board",
    status: "new",
    body: "Saw a bug on the board",
    type: "other",
    area: "",
    createdBy: "hello@repoos.org",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    path: "inputs/x.md",
    attachments: [],
    resolution: "",
    resolvedTask: "",
  }) as Input;

describe("enrichment-pending tracking (#0631)", () => {
  it("marks the created input enriching on submit and clears on input.enriched", async () => {
    stubPostInput({ id: "abc-123" });
    setActivePinia(createPinia());
    const repo = useRepoStore();

    await repo.submitInput("Saw a bug on the board", []);
    await flush();

    expect(repo.enrichingInputs.has("abc-123")).toBe(true);
    expect(repo.isEnriching("abc-123")).toBe(true);
    // Other inputs are unaffected.
    expect(repo.enrichingInputs.size).toBe(1);

    repo.applyEvent({
      type: "input.enriched",
      id: "abc-123",
      input: { ...rawInput("abc-123"), title: "Board bug when creating tasks", type: "bug" },
      at: new Date().toISOString(),
    } as unknown as RepoEvent);

    expect(repo.enrichingInputs.has("abc-123")).toBe(false);
  });

  it("clears the pending state via the backstop timeout when enrichment never emits", async () => {
    vi.useFakeTimers();
    stubPostInput({ id: "abc-silent" });
    setActivePinia(createPinia());
    const repo = useRepoStore();

    await repo.submitInput("Saw a bug on the board", []);
    expect(repo.enrichingInputs.has("abc-silent")).toBe(true);

    // No SSE event ever arrives (failure / nothing parseable) — advance past
    // the backstop and the card must not keep a stuck spinner.
    vi.advanceTimersByTime(90_001);
    expect(repo.enrichingInputs.has("abc-silent")).toBe(false);
  });

  it("tracks enrichment even when an attachment upload fails after creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, opts?: RequestInit) => {
        const u = String(url);
        if (u === "/api/inputs" && opts?.method === "POST")
          return Promise.resolve(json({ id: "abc-uploadfail" }));
        if (u.includes("/attachments")) return Promise.reject(new Error("upload failed"));
        return Promise.reject(new Error("unexpected fetch: " + u));
      }),
    );
    setActivePinia(createPinia());
    const repo = useRepoStore();

    await repo.submitInput("Saw a bug on the board", [
      { name: "shot.png", mime: "image/png", dataUrl: "data:image/png;base64,QUJD", size: 3 },
    ]);
    await flush();

    // The upload failed, but the server already started enrichment when the
    // POST returned — the pending indicator must not be dropped with it.
    expect(repo.enrichingInputs.has("abc-uploadfail")).toBe(true);
  });

  it("stays cleared when input.enriched lands during a slow attachment upload", async () => {
    // Holder object so TS control-flow analysis doesn't narrow the resolver
    // to null (it's assigned inside the fetch stub's closure).
    const uploadGate: { release?: () => void } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, opts?: RequestInit) => {
        const u = String(url);
        if (u === "/api/inputs" && opts?.method === "POST")
          return Promise.resolve(json({ id: "abc-slowup" }));
        if (u.includes("/attachments"))
          return new Promise((resolve) => {
            uploadGate.release = () => resolve(json({ ok: true, attachment: {} }));
          });
        return Promise.reject(new Error("unexpected fetch: " + u));
      }),
    );
    setActivePinia(createPinia());
    const repo = useRepoStore();

    const submitting = repo.submitInput("Saw a bug on the board", [
      { name: "shot.png", mime: "image/png", dataUrl: "data:image/png;base64,QUJD", size: 3 },
    ]);
    await flush();
    expect(repo.enrichingInputs.has("abc-slowup")).toBe(true);

    // Enrichment finishes while the upload is still pending — the event must
    // clear the indicator, and finishing the upload must not re-arm it.
    repo.applyEvent({
      type: "input.enriched",
      id: "abc-slowup",
      input: rawInput("abc-slowup"),
      at: new Date().toISOString(),
    } as unknown as RepoEvent);
    expect(repo.enrichingInputs.has("abc-slowup")).toBe(false);

    uploadGate.release?.();
    await submitting;
    await flush();
    expect(repo.enrichingInputs.has("abc-slowup")).toBe(false);
  });

  it("never re-arms the indicator for an id whose enrichment already landed", async () => {
    stubPostInput({ id: "abc-seen" });
    setActivePinia(createPinia());
    const repo = useRepoStore();

    // Completion processed before registration (defensive guard): once
    // `input.enriched` has been seen for an id, a later markEnriching for
    // that id must not show a stale spinner.
    repo.applyEvent({
      type: "input.enriched",
      id: "abc-seen",
      input: rawInput("abc-seen"),
      at: new Date().toISOString(),
    } as unknown as RepoEvent);

    await repo.submitInput("Saw a bug on the board", []);
    await flush();
    expect(repo.enrichingInputs.has("abc-seen")).toBe(false);
  });

  it("shows the activity indicator on the card while pending, and drops it when enriched", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useRepoStore();
    store.enrichingInputs.add("abc-ui");
    const input = rawInput("abc-ui");

    const wrapper = mount(InputCard, {
      props: { input, inputLabel: "#0007", nextStatus: "reviewing" as const },
      global: { plugins: [pinia] },
    });
    await flush();

    expect(wrapper.findComponent({ name: "ActivityIndicator" }).exists()).toBe(true);

    store.enrichingInputs.delete("abc-ui");
    await flush();
    expect(wrapper.findComponent({ name: "ActivityIndicator" }).exists()).toBe(false);
    wrapper.unmount();
  });
});
