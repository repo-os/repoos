/**
 * #0805 — the "Set editor in Settings → General" hints are links, not plain
 * text. Each one (task drawer Spec row, Context doc viewer, failed-tests list)
 * points at the General editor setting, is keyboard focusable, and follows the
 * link on Enter.
 */
import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import ContextView from "../src/views/ContextView.vue";
import FailedTestsList from "../src/components/FailedTestsList.vue";
import { useConfigStore } from "../src/stores/config";
import { useDocsStore } from "../src/stores/docs";

const EDITOR_SETTINGS = "/settings?tab=general&section=general";

/** Router with a catch-all route so `router-link` resolves hrefs. */
async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  return router;
}

/** A native anchor activates on Enter; jsdom does not synthesize that click. */
function pressEnter(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

/** Pinia with no editor configured, so every surface shows its "Set editor" hint. */
function piniaWithoutEditor(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  useConfigStore().data = {};
  return pinia;
}

describe("editor hint links (#0805)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("failed-tests hint links to the editor setting and follows Enter", async () => {
    const pinia = piniaWithoutEditor();
    const router = await makeRouter();
    const wrapper = mount(FailedTestsList, {
      attachTo: document.body,
      props: { tests: ["src/a.test.ts > suite > case"] },
      global: { plugins: [pinia, router] },
    });

    const hint = wrapper.get('[data-test-id="failed-test-open-hint"]');
    expect(hint.element.tagName).toBe("A");
    expect(hint.attributes("href")).toBe(EDITOR_SETTINGS);
    expect(hint.text()).toBe("Set editor in Settings → General");

    (hint.element as HTMLAnchorElement).focus();
    expect(document.activeElement).toBe(hint.element);
    pressEnter(hint.element as HTMLAnchorElement);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toContain(EDITOR_SETTINGS);
  });

  it("context doc-viewer hint links to the editor setting and follows Enter", async () => {
    const pinia = piniaWithoutEditor();
    const docs = useDocsStore();
    docs.docs = [{ path: "docs/guide.md", title: "Guide" }] as typeof docs.docs;
    docs.selDoc = "docs/guide.md";
    docs.docContent = "# Guide\n\nSome text.";
    docs.docTitle = "Guide";
    const router = await makeRouter();
    const wrapper = mount(ContextView, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: {
          NewDocPanel: { template: "<div />" },
          NewSkillPanel: { template: "<div />" },
          RepoHistoryPanel: { template: "<div />" },
          SearchOverlay: { template: "<div />" },
        },
      },
    });

    const hint = wrapper.get('[data-test-id="context-open-in-editor-hint"]');
    expect(hint.element.tagName).toBe("A");
    expect(hint.attributes("href")).toBe(EDITOR_SETTINGS);
    expect(hint.text()).toBe("Set editor in Settings → General");

    (hint.element as HTMLAnchorElement).focus();
    expect(document.activeElement).toBe(hint.element);
    pressEnter(hint.element as HTMLAnchorElement);
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toContain(EDITOR_SETTINGS);
  });
});
