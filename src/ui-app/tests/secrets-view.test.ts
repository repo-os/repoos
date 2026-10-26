import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import Select from "../src/components/ui/select/root.vue";
import SecretsView from "../src/views/SecretsView.vue";
import { navFromConfig } from "../src/nav";
import { useAuthStore } from "../src/stores/auth";
import { invalidatePageData } from "../src/composables/page-data-cache";

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
function mountPage(role: "admin" | "member" = "admin") {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().role = role;
  return mount(SecretsView, { attachTo: document.body, global: { plugins: [pinia] } });
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
  it("renders the registered fake shot fixture without loading project secrets", async () => {
    window.history.replaceState({}, "", "/secrets?shotState=secrets%3Apopulated");
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("DATABASE_URL");
    expect(wrapper.text()).toContain("Defined in an earlier source");
    expect(wrapper.text()).toContain("VITE_PUBLIC_ORIGIN");
    expect(wrapper.html()).not.toContain("FAKE_SENTINEL_0932_SCREENSHOT_ONLY");
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
      const first = mountPage();
      await flushPromises();
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
    expect(wrapper.text()).toContain("Missing");
    expect(wrapper.text()).toContain("Inherited");
    expect(wrapper.get(".secrets-file").text()).toContain(".env.dev-nick");
    expect(wrapper.findAll(".secrets-row dt").some((node) => node.text() === "Source")).toBe(false);
    expect(wrapper.get(".secrets-row").text()).toContain("Replace");
    const inherited = wrapper
      .findAll(".secrets-row")
      .find((row) => row.text().includes("STRIPE_SECRET_KEY"));
    expect(inherited?.text()).not.toContain("Add override");
    expect(inherited?.findAll("button")).toHaveLength(0);
    expect(inherited?.text()).toContain("Defined in an earlier source");
    expect(inherited?.text()).not.toContain("Remove");
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
    expect(wrapper.findAll(".secrets-row-actions button")).toHaveLength(0);
    expect(api.mock.calls.some(([, opts]) => opts?.method === "PUT")).toBe(false);
    wrapper.unmount();
  });
  it("uses masked inputs and clears the entered value after explicit save", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get(".secrets-row button").trigger("click");
    const input = wrapper.get(".secrets-inline-form input");
    expect(input.attributes("type")).toBe("password");
    await input.setValue("fake-test-value-123");
    await wrapper.get(".secrets-inline-form button").trigger("click");
    await flushPromises();
    expect(wrapper.html()).not.toContain("fake-test-value-123");
    expect(wrapper.text()).toContain("DATABASE_URL saved");
    wrapper.unmount();
  });
  it("confirms removal with the affected consumers", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const row = wrapper
      .findAll(".secrets-row")
      .find((item) => item.text().includes("DATABASE_URL"));
    const shotClickTarget = wrapper.find(".secrets-row:first-child .secrets-remove");
    expect(shotClickTarget.exists()).toBe(true);
    await row!.findAll("button").at(-1)!.trigger("click");
    expect(document.body.textContent).toContain("Affected consumers: Dev · web");
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
      .find((item) => item.text().includes("DATABASE_URL"));
    await row!.findAll("button").at(0)!.trigger("click");
    await wrapper.get(".secrets-inline-form input").setValue("fake-concurrent-value");
    await wrapper.get(".secrets-inline-form button").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("changed since it was loaded");
    expect(wrapper.get('[role="alert"] button').text()).toContain("Reload");
    wrapper.unmount();
  });
});
