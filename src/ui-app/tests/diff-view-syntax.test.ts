/**
 * Full-file diff view syntax highlighting (#0449), at the component level.
 *
 * The lib is unit-tested in syntax-highlight.test.ts; this file drives the real
 * `DiffView` with a stubbed API for representative stacks — a web (TypeScript)
 * file, Go/Rust, and an Android/Kotlin source — and asserts the tokenized
 * panes actually render, plus the safe plain-text fallback for unknown types.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import * as apiMod from "../src/api";
import DiffView from "../src/views/DiffView.vue";

const api = vi.spyOn(apiMod, "api");
let canvasSpy: ReturnType<typeof vi.spyOn>;

interface Fixture {
  filename: string;
  before: string[];
  after: string[];
}

let fixture: Fixture;
let fileUnavailable = false;

/** A minimal one-hunk patch: common context, then removed/added tails. */
function makePatch({ filename, before, after }: Fixture): string {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  const body = [
    ...before.slice(0, prefix).map((line) => ` ${line}`),
    ...before.slice(prefix).map((line) => `-${line}`),
    ...after.slice(prefix).map((line) => `+${line}`),
  ];
  return [
    `diff --git a/${filename} b/${filename}`,
    `--- a/${filename}`,
    `+++ b/${filename}`,
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...body,
    "",
  ].join("\n");
}

function installApi(): void {
  api.mockImplementation(async (path: string) => {
    if (path.endsWith("/diff")) {
      return { ok: true, diff: { patch: makePatch(fixture), truncated: false } };
    }
    if (path.includes("/file?")) {
      if (fileUnavailable) return { content: "", exists: false, noWorktree: true };
      const url = new URL(path, "http://local");
      const version = url.searchParams.get("version");
      const content = (version === "before" ? fixture.before : fixture.after).join("\n");
      return { content: content ? `${content}\n` : "" };
    }
    throw new Error(`unexpected api call: ${path}`);
  });
}

async function waitFor(pred: () => boolean, timeout = 10_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (pred()) return;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function mountView(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/tasks/:taskId/diff", name: "diff", component: DiffView }],
  });
  await router.push({
    name: "diff",
    params: { taskId: "0449" },
    query: { file: fixture.filename },
  });
  await router.isReady();
  const wrapper = mount(DiffView, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fileUnavailable = false;
  // jsdom has no 2D canvas; the minimap guards a null context.
  canvasSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  canvasSpy.mockRestore();
  api.mockReset();
});

async function expectHighlighted(f: Fixture, expectedText: string): Promise<VueWrapper> {
  fixture = f;
  installApi();
  const wrapper = await mountView();
  await waitFor(() => wrapper.find(".diff-tok").exists());
  expect(wrapper.findAll(".diff-tok").length).toBeGreaterThan(0);
  expect(wrapper.text()).toContain(expectedText);
  return wrapper;
}

describe("DiffView full-file syntax highlighting (#0449)", () => {
  it("highlights a web (TypeScript) file in both panes", async () => {
    const wrapper = await expectHighlighted(
      { filename: "src/app.ts", before: ["const a = 1;"], after: ["const a = 1;", "const b = 2;"] },
      "const b = 2;",
    );
    wrapper.unmount();
  });

  it("highlights a Go file", async () => {
    const wrapper = await expectHighlighted(
      {
        filename: "cmd/main.go",
        before: ["package main"],
        after: ["package main", "func main() {}"],
      },
      "func main() {}",
    );
    wrapper.unmount();
  });

  it("highlights a Rust file", async () => {
    const wrapper = await expectHighlighted(
      {
        filename: "src/lib.rs",
        before: ["pub fn a() {}"],
        after: ["pub fn a() {}", "pub fn b() -> u32 { 1 }"],
      },
      "pub fn b()",
    );
    wrapper.unmount();
  });

  it("highlights an Android/Kotlin file", async () => {
    const wrapper = await expectHighlighted(
      {
        filename: "app/src/main/java/com/example/MainActivity.kt",
        before: ["fun main() {}"],
        after: ["fun main() {", "  println(1)", "}"],
      },
      "println(1)",
    );
    wrapper.unmount();
  });

  it("renders an unknown file type as safe plain text", async () => {
    fixture = { filename: "notes.txt", before: ["hello"], after: ["hello", "world"] };
    installApi();
    const wrapper = await mountView();
    await waitFor(() => wrapper.text().includes("world"));
    expect(wrapper.find(".diff-tok").exists()).toBe(false);
    expect(wrapper.text()).toContain("hello");
    wrapper.unmount();
  });

  it("keeps the readable patch view when a completed task worktree was collected", async () => {
    fixture = {
      filename: "src/app.ts",
      before: ["const before = 1;"],
      after: ["const after = 2;"],
    };
    fileUnavailable = true;
    installApi();
    const wrapper = await mountView();
    await waitFor(() => wrapper.text().includes("const before = 1;"));
    expect(wrapper.text()).toContain("const after = 2;");
    expect(wrapper.text()).toContain("Showing changed hunks");
    expect(wrapper.find(".diff-tok").exists()).toBe(false);
    wrapper.unmount();
  });
});
