import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ApiError } from "../src/api";
import * as apiMod from "../src/api";
import Select from "../src/components/ui/select/root.vue";
import SecretsView from "../src/views/SecretsView.vue";
import { navFromConfig } from "../src/nav";
import { useAuthStore } from "../src/stores/auth";
import { useRepoStore } from "../src/stores/repo";
import { invalidatePageData } from "../src/composables/page-data-cache";
import { SKELETON_MIN_VISIBLE_MS, SKELETON_SHOW_DELAY_MS } from "../src/lib/loading-skeleton";

const api = vi.spyOn(apiMod, "api");
const envs = {
  environments: [
    { id: "dev-nick", sources: [{ id: "local", path: ".env.dev-nick" }] },
    { id: "integration", sources: [{ id: "local", path: ".env.integration" }] },
  ],
};
const snapshots: Record<string, unknown> = {
  "dev-nick": {
    environment: "dev-nick",
    version: "v1",
    keys: [
      {
        name: "DATABASE_URL",
        status: "set",
        source: ".env.dev-nick",
        visibility: "server-only",
        version: "v1",
        consumers: ["Dev · web"],
        restartNeeded: false,
      },
      {
        name: "STRIPE_SECRET_KEY",
        status: "set",
        inherited: true,
        source: ".env.shared, .env.dev-nick",
        visibility: "server-only",
        version: "v1",
        consumers: ["Checks"],
        restartNeeded: false,
      },
      {
        name: "MISSING_TOKEN",
        status: "missing",
        source: ".env.dev-nick",
        visibility: "server-only",
        version: "v1",
        consumers: [],
        restartNeeded: false,
      },
    ],
  },
  integration: { environment: "integration", version: "v2", keys: [] },
};
function mountPage(role: "admin" | "member" | null = "admin") {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().role = role;
  return mount(SecretsView, { attachTo: document.body, global: { plugins: [pinia] } });
}
/** A KeyboardEvent for dispatchEvent in jsdom. */
function keydown(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, bubbles: true });
}
function answer(path: string): unknown {
  if (path === "/api/project-environments") return envs;
  const id = decodeURIComponent(path.split("/")[3] ?? "");
  return snapshots[id] ?? snapshots["dev-nick"];
}
beforeEach(() => {
  invalidatePageData("project-environments");
  invalidatePageData("secrets:dev-nick");
  invalidatePageData("secrets:integration");
  api.mockImplementation(async (path: string, opts?: RequestInit) => {
    if (opts?.method === "PUT") return { ok: true } as never;
    return answer(path) as never;
  });
});
afterEach(() => {
  api.mockReset();
  window.history.replaceState({}, "", "/");
});

describe("SecretsView (#0929)", () => {
  it("gives unsigned sessions sign-in guidance without showing secret values", async () => {
    api.mockImplementation(async (path) => {
      if (path === "/api/project-environments")
        throw new ApiError("Authentication required", 401, { error: "Authentication required" });
      return {} as never;
    });
    const wrapper = mountPage(null);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Sign in to view project environments and keys.Reload",
    );
    expect(wrapper.text()).not.toContain("Authentication required");
    expect(wrapper.text()).not.toContain("DATABASE_URL");
    expect(wrapper.text()).not.toContain("FAKE_SECRET_VALUE");
    expect(wrapper.find(".secrets-empty").exists()).toBe(false);
    expect(wrapper.find('[data-testid="new-environment"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("clears warm environment and key metadata after a 401", async () => {
    const first = mountPage();
    await flushPromises();
    expect(first.text()).toContain("DATABASE_URL");
    first.unmount();

    api.mockRejectedValue(
      new ApiError("Authentication required", 401, { error: "Authentication required" }),
    );
    const revisit = mountPage(null);
    await flushPromises();

    expect(revisit.get('[role="alert"]').text()).toContain(
      "Sign in to view project environments and keys.",
    );
    expect(revisit.find(".secrets-ledger").exists()).toBe(false);
    expect(revisit.find(".secrets-empty").exists()).toBe(false);
    expect(revisit.find('[data-testid="new-environment"]').exists()).toBe(false);
    expect(revisit.text()).not.toContain("DATABASE_URL");
    expect(revisit.text()).not.toContain("Authentication required");
    revisit.unmount();
  });

  it("renders the registered fake shot fixture without loading project secrets", async () => {
    window.history.replaceState({}, "", "/secrets?shotState=secrets%3Apopulated");
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("DATABASE_URL");
    expect(wrapper.get(".secrets-badge.is-inherited").text()).toBe("inherited");
    expect(wrapper.text()).toContain("VITE_PUBLIC_ORIGIN");
    expect(wrapper.html()).not.toContain("FAKE_SENTINEL_0932_SCREENSHOT_ONLY");
    expect(api).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders the registered unauthorized shot without loading environment data", async () => {
    window.history.replaceState({}, "", "/secrets?shotState=secrets%3Aunauthorized");
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Sign in to view project environments and keys.",
    );
    expect(wrapper.find(".secrets-empty").exists()).toBe(false);
    expect(wrapper.find('[data-testid="new-environment"]').exists()).toBe(false);
    expect(api).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders a cached empty environment list while revalidating", async () => {
    api.mockResolvedValue({ environments: [] } as never);
    const first = mountPage();
    await flushPromises();
    first.unmount();
    api.mockImplementation(() => new Promise(() => {}));
    const revisit = mountPage();
    await flushPromises();
    expect(revisit.find(".page-skeleton").exists()).toBe(false);
    expect(revisit.find(".secrets-empty").exists()).toBe(true);
    revisit.unmount();
  });

  it.each(["empty environments", "empty keys", "pending keys"])(
    "keeps refresh errors visible with %s",
    async (state) => {
      const environments = state === "empty environments" ? [] : [envs.environments[1]];
      api.mockImplementation(async (path) => {
        if (path === "/api/project-environments") return { environments } as never;
        if (state === "pending keys") return new Promise(() => {});
        return snapshots.integration as never;
      });
      const first = mountPage();
      await flushPromises();
      first.unmount();
      api.mockImplementation(async (path) => {
        if (path === "/api/project-environments" && state === "empty keys")
          return { environments } as never;
        throw new Error("refresh offline");
      });
      const revisit = mountPage();
      await flushPromises();
      expect(revisit.find(".secrets-error").text()).toContain(
        "Could not update environment metadata",
      );
      if (state !== "pending keys") expect(revisit.find(".page-skeleton").exists()).toBe(false);
      if (state === "empty environments")
        expect(revisit.find(".secrets-empty").exists()).toBe(true);
      if (state === "empty keys") expect(revisit.find(".secrets-ledger").exists()).toBe(true);
      revisit.unmount();
    },
  );

  it("shows cached keys immediately while both resources revalidate", async () => {
    const first = mountPage();
    await flushPromises();
    expect(first.text()).toContain("DATABASE_URL");
    first.unmount();

    api.mockImplementation(() => new Promise(() => {}));
    const revisit = mountPage();
    await flushPromises();
    expect(revisit.findAll(".page-skeleton")).toHaveLength(0);
    expect(revisit.text()).toContain("DATABASE_URL");
    revisit.unmount();
  });

  it.each(["success", "failure"])(
    "keeps environment keys isolated when the previous request ends in %s",
    async (outcome) => {
      vi.useFakeTimers();
      const first = mountPage();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
      first.unmount();
      // Only the old environment has a cached snapshot.
      invalidatePageData("secrets:integration");
      let finishDev!: (value: unknown) => void;
      let failDev!: (error: Error) => void;
      let finishIntegration!: (value: unknown) => void;
      const lateDev = new Promise((resolve, reject) => {
        finishDev = resolve;
        failDev = reject;
      });
      const integration = new Promise((resolve) => (finishIntegration = resolve));
      api.mockImplementation(async (path: string) => {
        if (path === "/api/project-environments")
          return {
            environments: envs.environments.filter((env) => env.id === "integration"),
          } as never;
        return (path.includes("/dev-nick/") ? lateDev : integration) as never;
      });
      const revisit = mountPage();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
      expect(revisit.get(".secrets-picker").text()).toContain("integration");
      expect(revisit.text()).not.toContain("DATABASE_URL");
      expect(revisit.find(".page-skeleton").exists()).toBe(true);
      if (outcome === "success") finishDev(snapshots["dev-nick"]);
      else failDev(new Error("old environment offline"));
      await flushPromises();
      expect(revisit.text()).not.toContain("DATABASE_URL");
      expect(revisit.find("[role=alert]").exists()).toBe(false);
      expect(revisit.find(".page-skeleton").exists()).toBe(true);
      finishIntegration(snapshots.integration);
      await flushPromises();
      await vi.advanceTimersByTimeAsync(SKELETON_MIN_VISIBLE_MS);
      expect(revisit.find(".secrets-ledger").exists()).toBe(true);
      expect(revisit.find(".page-skeleton").exists()).toBe(false);
      revisit.unmount();
    },
  );

  it("opens the removal dialog from its registered fake shot fixture", async () => {
    window.history.replaceState({}, "", "/secrets?shotState=secrets%3AremoveDialog");
    const wrapper = mountPage();
    await flushPromises();
    expect(document.body.textContent).toContain("Affected consumers: Dev · web, Checks");
    expect(document.querySelector(".delete-confirm-modal")).not.toBeNull();
    wrapper.unmount();
  });

  it("keeps Secrets reachable before an environment has been created", () => {
    const ids = navFromConfig({ dev: { targets: [{ name: "web" }] } }).map((item) => item.id);
    expect(ids.slice(ids.indexOf("dev") + 1, ids.indexOf("agents"))).toEqual(["secrets"]);
  });
  it("puts New environment on the accent create button and still opens the panel", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const create = wrapper.get('[data-testid="new-environment"]');
    expect(create.classes()).toContain("new-btn");
    expect(create.attributes("class")).toContain("--btn-new-bg");
    expect(create.html()).toContain("M12 5v14");
    expect(create.text()).toContain("New environment");
    await create.trigger("click");
    expect(document.body.textContent).toContain("Create environment");
    wrapper.unmount();
  });

  it("shows a clear empty-project state and environment creation affordance", async () => {
    api.mockImplementation(async (path: string) =>
      path === "/api/project-environments" ? ({ environments: [] } as never) : ({} as never),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Give this project an environment");
    expect(wrapper.text()).toContain("Create environment");
    expect(wrapper.get(".secrets-picker").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("reports successful creation and selects the new environment immediately", async () => {
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/project-environments" && opts?.method === "POST")
        return {
          environment: { id: "fresh", sources: [{ id: "local", path: ".env.fresh" }] },
        } as never;
      if (path === "/api/project-environments") return { environments: [] } as never;
      if (path.includes("/fresh/secrets"))
        return { environment: "fresh", version: "v1", keys: [] } as never;
      return {} as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get(".secrets-empty button").trigger("click");
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('input[placeholder="dev-local"]')!;
    input.value = "fresh";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await document
      .querySelector<HTMLButtonElement>(".secrets-create-actions button[type=submit]")!
      .click();
    await flushPromises();
    expect(wrapper.text()).toContain("Environment “fresh” created.");
    expect(wrapper.get(".secrets-picker").text()).toContain("fresh");
    expect(api.mock.calls.some(([path]) => path.includes("/fresh/secrets"))).toBe(true);
    wrapper.unmount();
  });
  it("shows the server creation error in the dialog", async () => {
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/project-environments" && opts?.method === "POST")
        throw new apiMod.ApiError("That environment already exists", 409, {
          error: "That environment already exists",
        });
      return { environments: [] } as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get(".secrets-empty button").trigger("click");
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('input[placeholder="dev-local"]')!;
    input.value = "dev-nick";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>(".secrets-create-actions button[type=submit]")!
      .click();
    await flushPromises();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("already exists");
    wrapper.unmount();
  });
  it("uses sign-in guidance when environment creation returns 401", async () => {
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/project-environments" && opts?.method === "POST")
        throw new ApiError("Authentication required", 401, { error: "Authentication required" });
      return answer(path) as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('[data-testid="new-environment"]').trigger("click");
    const input = document.querySelector<HTMLInputElement>('input[placeholder="dev-local"]')!;
    input.value = "fresh";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>(".secrets-create-actions button[type=submit]")!
      .click();
    await flushPromises();

    expect(document.body.textContent).toContain("Sign in to view project environments and keys.");
    expect(document.body.textContent).not.toContain("Authentication required");
    expect(wrapper.find('[data-testid="new-environment"]').exists()).toBe(false);
    expect(wrapper.find(".secrets-empty").exists()).toBe(false);

    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="new-environment"]').exists()).toBe(true);
    await wrapper.get('[data-testid="new-environment"]').trigger("click");
    await flushPromises();
    expect(wrapper.find(".secrets-create-panel").exists()).toBe(true);
    expect(wrapper.find('.secrets-create-panel [role="alert"]').exists()).toBe(false);
    expect(wrapper.find(".secrets-create-panel").text()).not.toContain(
      "Sign in to view project environments and keys.",
    );
    wrapper.unmount();
  });
  it("clears a typed key name and value when adding a key returns 401", async () => {
    const sentinel = "FAKE_TYPED_SECRET_1164";
    api.mockImplementation(async (path, opts) => {
      if (opts?.method === "PUT")
        throw new ApiError("Authentication required", 401, { error: "Authentication required" });
      return answer(path) as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get(".secrets-ledger-top button").trigger("click");
    const fields = wrapper.findAll(".secrets-add-row input");
    await fields[0]!.setValue("SERVICE_TOKEN");
    await fields[1]!.setValue(sentinel);
    await wrapper.get(".secrets-add-row button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Sign in to view project environments and keys.",
    );
    expect(wrapper.find(".secrets-add-row").exists()).toBe(false);
    expect(wrapper.find(".secrets-ledger").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("SERVICE_TOKEN");
    expect(document.body.textContent).not.toContain(sentinel);
    expect(wrapper.text()).not.toContain("Authentication required");
    wrapper.unmount();
  });
  it("clears edit drafts and stale status when replacing a key returns 401", async () => {
    let writes = 0;
    const sentinel = "FAKE_TYPED_REPLACEMENT_1164";
    api.mockImplementation(async (path, opts) => {
      if (opts?.method === "PUT") {
        writes++;
        if (writes > 1)
          throw new ApiError("Authentication required", 401, { error: "Authentication required" });
        return { ok: true } as never;
      }
      return answer(path) as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    const openEdit = async () => {
      const row = wrapper
        .findAll(".secrets-row")
        .find((item) => item.text().includes("DATABASE_URL"))!;
      await row.get(".secrets-menu-trigger").trigger("click");
      await flushPromises();
      await document.querySelector<HTMLElement>(".secrets-menu button")!.click();
      await flushPromises();
    };
    await openEdit();
    await wrapper.get(".secrets-inline-form input").setValue("first fake replacement");
    await wrapper.get(".secrets-inline-form button").trigger("click");
    await flushPromises();
    expect(wrapper.get(".secrets-message").text()).toContain("DATABASE_URL saved");

    await openEdit();
    await wrapper.get(".secrets-inline-form input").setValue(sentinel);
    await wrapper.get(".secrets-inline-form button").trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Sign in to view project environments and keys.",
    );
    expect(wrapper.find(".secrets-inline-form").exists()).toBe(false);
    expect(wrapper.find(".secrets-message").exists()).toBe(false);
    expect(wrapper.find(".secrets-ledger").exists()).toBe(false);
    expect(document.body.textContent).not.toContain(sentinel);
    wrapper.unmount();
  });
  it("closes the remove confirmation when removing a key returns 401", async () => {
    api.mockImplementation(async (path, opts) => {
      if (opts?.method === "PUT")
        throw new ApiError("Authentication required", 401, { error: "Authentication required" });
      return answer(path) as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    const row = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("DATABASE_URL"))!;
    await row.get(".secrets-menu-trigger").trigger("click");
    await flushPromises();
    const remove = [...document.querySelectorAll<HTMLElement>(".secrets-menu button")].find(
      (button) => button.textContent?.includes("Remove key"),
    )!;
    await remove.click();
    await flushPromises();
    expect(document.body.textContent).toContain("Affected consumers: Dev · web");
    const confirm = document.querySelectorAll<HTMLButtonElement>(
      ".delete-confirm-modal .cc-modal-actions button",
    )[1]!;
    await confirm.click();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Sign in to view project environments and keys.",
    );
    expect(document.querySelector(".delete-confirm-modal")).toBeNull();
    expect(document.body.textContent).not.toContain("Affected consumers: Dev · web");
    expect(document.body.textContent).not.toContain("Remove key");
    expect(wrapper.find(".secrets-ledger").exists()).toBe(false);
    wrapper.unmount();
  });
  it("changes the viewed environment without rebinding anything", async () => {
    const wrapper = mountPage();
    await flushPromises();
    wrapper.findComponent(Select).vm.$emit("update:modelValue", "integration");
    await flushPromises();
    expect(wrapper.get(".secrets-picker").text()).toContain("integration");
    expect(wrapper.text()).toContain("No expected keys yet");
    expect(api.mock.calls.some(([, opts]) => opts?.method === "PUT")).toBe(false);
    wrapper.unmount();
  });
  it("labels missing and inherited keys, keeping inherited rows read-only", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.get(".secrets-file").text()).toContain(".env.dev-nick");
    // One compact line per key: dot, name, badges, masked placeholder, menu.
    const row = wrapper.get(".secrets-row");
    expect(row.find(".secrets-dot").exists()).toBe(true);
    expect(row.get(".secrets-key-name").text()).toBe("DATABASE_URL");
    // Truncated names use the styled tooltip (data-tip), never a native title.
    const name = row.get(".secrets-key-name");
    expect(name.attributes("data-tip")).toContain("Source: .env.dev-nick");
    expect(name.attributes("title")).toBeUndefined();
    // The visually-hidden copy is rendered text naming the key, not an
    // uninvoked helper.
    const srOnly = row.get(".sr-only");
    expect(srOnly.text()).toContain("DATABASE_URL.");
    expect(srOnly.text()).toContain("Source: .env.dev-nick");
    expect(srOnly.text()).not.toContain("=>");
    expect(row.get(".secrets-masked").text()).toBe("•••••••");
    // Missing keys show an explicit not-set placeholder instead of dots.
    const missing = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("MISSING_TOKEN"))!;
    expect(missing.get(".secrets-masked").text()).toBe("Not set");
    const inherited = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("STRIPE_SECRET_KEY"));
    expect(inherited?.get(".secrets-badge.is-inherited").text()).toBe("inherited");
    expect(inherited?.findAll("button")).toHaveLength(0);
    expect(inherited?.text()).toContain("read-only");
    wrapper.unmount();
  });
  it("keeps inherited values read-only while searching safe metadata", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get('[aria-label="Search keys"]').setValue("Checks");
    expect(wrapper.findAll(".secrets-row")).toHaveLength(1);
    expect(wrapper.get(".secrets-row").text()).toContain("STRIPE_SECRET_KEY");
    await wrapper.get('[aria-label="Search keys"]').setValue("");
    const inherited = wrapper
      .findAll(".secrets-row")
      .find((row) => row.text().includes("STRIPE_SECRET_KEY"));
    expect(inherited!.findAll("button")).toHaveLength(0);
    expect(api.mock.calls.some(([, opts]) => opts?.method === "PUT")).toBe(false);
    wrapper.unmount();
  });
  it("lets members view metadata without mutation controls", async () => {
    const wrapper = mountPage("member");
    await flushPromises();
    expect(wrapper.text()).toContain("DATABASE_URL");
    expect(wrapper.text()).not.toContain("Add key");
    expect(wrapper.text()).not.toContain("Create environment");
    expect(wrapper.findAll(".secrets-menu-trigger")).toHaveLength(0);
    expect(wrapper.find(".secrets-open-editor").exists()).toBe(false);
    expect(api.mock.calls.some(([, opts]) => opts?.method === "PUT")).toBe(false);
    wrapper.unmount();
  });
  it("edits a value through the row's options menu and clears the entry after save", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const row = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("DATABASE_URL"))!;
    await row.get(".secrets-menu-trigger").trigger("click");
    const editItem = [...document.querySelectorAll<HTMLElement>(".secrets-menu button")].find(
      (button) => button.textContent?.includes("Replace value"),
    );
    editItem!.click();
    await flushPromises();
    const input = wrapper.get(".secrets-inline-form input");
    expect(input.attributes("type")).toBe("password");
    await input.setValue("fake-test-value-123");
    await wrapper.get(".secrets-inline-form button").trigger("click");
    await flushPromises();
    expect(wrapper.html()).not.toContain("fake-test-value-123");
    expect(wrapper.text()).toContain("DATABASE_URL saved");
    expect(wrapper.find(".secrets-inline-form").exists()).toBe(false);
    wrapper.unmount();
  });

  it("keeps every value write-only: no copy or reveal control exists on rows or menus", async () => {
    const wrapper = mountPage();
    await flushPromises();
    // Open every row's menu so a hidden copy/reveal action would be visible.
    for (const trigger of wrapper.findAll(".secrets-menu-trigger")) {
      await trigger.trigger("click");
      await flushPromises();
      const menuText = document.querySelector(".secrets-menu")!.textContent!.toLowerCase();
      expect(menuText).not.toContain("copy");
      expect(menuText).not.toContain("reveal");
      await trigger.trigger("click");
      await flushPromises();
    }
    expect(wrapper.get(".secrets-masked").text()).toBe("•••••••");
    // The only value inputs are masked password fields (search stays a search).
    for (const input of wrapper.findAll("input"))
      expect(["password", "search"]).toContain(input.attributes("type"));
    wrapper.unmount();
  });

  it("keeps the key count in sync while filtering", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const count = () => wrapper.get(".secrets-ledger-heading p").text();
    expect(count()).toContain("3 keys");
    await wrapper.get('[aria-label="Search keys"]').setValue("DATABASE");
    expect(wrapper.findAll(".secrets-row")).toHaveLength(1);
    expect(count()).toContain("1 of 3 keys");
    await wrapper.get('[aria-label="Search keys"]').setValue("nothing-matches");
    expect(wrapper.findAll(".secrets-row")).toHaveLength(0);
    expect(count()).toContain("0 of 3 keys");
    expect(wrapper.text()).toContain("No keys match this search.");
    wrapper.unmount();
  });

  it("focuses the opened menu, walks it with arrows, and returns focus on Escape", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const row = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("DATABASE_URL"))!;
    const trigger = row.get(".secrets-menu-trigger");
    await trigger.trigger("click");
    await flushPromises();
    const menu = document.querySelector(".secrets-menu")!;
    expect(document.activeElement).toBe(menu.querySelector("button"));
    const items = [...menu.querySelectorAll<HTMLElement>("button")];
    expect(items.length).toBeGreaterThan(1);
    await items[0].dispatchEvent(keydown("ArrowDown"));
    expect(document.activeElement).toBe(items[1]);
    await items[1].dispatchEvent(keydown("ArrowUp"));
    expect(document.activeElement).toBe(items[0]);
    await menu.dispatchEvent(keydown("Escape"));
    await flushPromises();
    expect(document.querySelector(".secrets-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("confirms removal with the affected consumers", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const row = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("DATABASE_URL"))!;
    await row.get(".secrets-menu-trigger").trigger("click");
    const removeItem = [...document.querySelectorAll<HTMLElement>(".secrets-menu button")].find(
      (button) => button.textContent?.includes("Remove key"),
    );
    removeItem!.click();
    await flushPromises();
    expect(document.body.textContent).toContain("Affected consumers: Dev · web");
    wrapper.unmount();
  });

  it("offers opening the environment file in the editor and sends only identifiers", async () => {
    window.history.replaceState({}, "", "/secrets?shotState=secrets%3Apopulated");
    api.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (path.includes("/open-in-editor")) {
        expect(opts?.method).toBe("POST");
        return { ok: true } as never;
      }
      return answer(path) as never;
    });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get(".secrets-open-editor").trigger("click");
    await flushPromises();
    const call = api.mock.calls.find(([path]) => String(path).includes("/open-in-editor"));
    expect(call![0]).toBe("/api/project-environments/dev-nick/open-in-editor");
    const sent = JSON.parse(String((call![1] as { body: string }).body));
    expect(sent).toEqual({ source: "local" });
    // Never a path, a file name, or any value-shaped payload.
    expect(JSON.stringify(sent)).not.toContain(".env");
    expect(JSON.stringify(sent)).not.toContain("value");
    wrapper.unmount();
  });
  it("uses sign-in guidance when opening the environment file returns 401", async () => {
    window.history.replaceState({}, "", "/secrets?shotState=secrets%3Apopulated");
    api.mockImplementation(async (path: string) => {
      if (path.includes("/open-in-editor"))
        throw new ApiError("Authentication required", 401, { error: "Authentication required" });
      return {} as never;
    });
    const wrapper = mountPage();
    const repo = useRepoStore();
    await flushPromises();
    await wrapper.get(".secrets-open-editor").trigger("click");
    await flushPromises();

    expect(repo.toasts[0]?.message).toBe("Sign in to view project environments and keys.");
    expect(wrapper.text()).not.toContain("Authentication required");
    wrapper.unmount();
  });
  it("shows concurrent edit feedback accessibly and offers refresh", async () => {
    const wrapper = mountPage();
    await flushPromises();
    api.mockImplementation(async (_path: string, opts?: RequestInit) => {
      if (opts?.method === "PUT")
        throw new apiMod.ApiError("Environment source changed; reload metadata", 409, {});
      return snapshots["dev-nick"] as never;
    });
    const row = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("DATABASE_URL"))!;
    await row.get(".secrets-menu-trigger").trigger("click");
    const editItem = [...document.querySelectorAll<HTMLElement>(".secrets-menu button")].find(
      (button) => button.textContent?.includes("Replace value"),
    );
    editItem!.click();
    await flushPromises();
    await wrapper.get(".secrets-inline-form input").setValue("fake-concurrent-value");
    await wrapper.get(".secrets-inline-form button").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("changed since it was loaded");
    expect(wrapper.get('[role="alert"] button').text()).toContain("Reload");
    wrapper.unmount();
  });
});
