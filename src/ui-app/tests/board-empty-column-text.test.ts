import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import BoardColumn from "../src/components/BoardColumn.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";

const defaults: Record<string, string> = {
  draft: "No drafts yet",
  inbox: "Nothing waiting in the inbox",
  ready: "Nothing ready to start",
  active: "Nothing in progress",
  review: "No tasks waiting for review",
  done: "Nothing finished yet",
};

function mountEmptyColumn(status: string, theme: string, override?: string) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  config.uiTheme = theme;
  config.data = { board: { emptyColumnText: override } };
  const repo = useRepoStore();
  repo.loading = false;
  return mount(BoardColumn, {
    props: { col: { id: status, label: status, color: "#000" }, tasks: [] },
    global: {
      plugins: [pinia],
      stubs: { TaskCard: true, RestartTaskDialog: true, ReviewConfirmDialog: true, Teleport: true },
    },
  });
}

afterEach(() => localStorage.clear());

describe("Work Queue empty column text", () => {
  it.each(Object.entries(defaults))("uses the %s default in every theme", (status, expected) => {
    for (const theme of ["classic", "gen z"]) {
      const wrapper = mountEmptyColumn(status, theme);
      expect(wrapper.get(".col-empty").text()).toBe(expected);
      wrapper.unmount();
    }
  });

  it.each(["-", "Shared empty message"])("applies %j to every empty column", (override) => {
    const wrapper = mountEmptyColumn("draft", "gen z", override);
    expect(wrapper.get(".col-empty").text()).toBe(override);
    wrapper.unmount();
  });

  it("treats a whitespace-only setting as unset", () => {
    const wrapper = mountEmptyColumn("draft", "gen z", "   ");
    expect(wrapper.get(".col-empty").text()).toBe(defaults.draft);
    wrapper.unmount();
  });
});
