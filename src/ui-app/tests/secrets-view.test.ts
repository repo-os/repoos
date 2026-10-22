import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import * as apiMod from "../src/api";
import Select from "../src/components/ui/select/root.vue";
import SecretsView from "../src/views/SecretsView.vue";

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
function mountPage() {
  return mount(SecretsView, { attachTo: document.body });
}
function answer(path: string): unknown {
  if (path === "/api/project-environments") return envs;
  const id = decodeURIComponent(path.split("/")[3] ?? "");
  return snapshots[id] ?? snapshots["dev-nick"];
}
beforeEach(() => {
  api.mockImplementation(async (path: string, opts?: RequestInit) => {
    if (opts?.method === "PUT") return { ok: true } as never;
    return answer(path) as never;
  });
});
afterEach(() => {
  api.mockReset();
});

describe("SecretsView (#0929)", () => {
  it("shows a clear empty-project state and environment creation affordance", async () => {
    api.mockImplementation(async (path: string) =>
      path === "/api/project-environments" ? ({ environments: [] } as never) : ({} as never),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Give this project an environment");
    expect(wrapper.text()).toContain("Create environment");
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
    expect(wrapper.text()).toContain("Inherited · read only");
    expect(wrapper.get(".secrets-row").text()).toContain("Replace");
    const inherited = wrapper
      .findAll(".secrets-row")
      .find((row) => row.text().includes("STRIPE_SECRET_KEY"));
    expect(inherited?.text()).toContain("Defined in an earlier source");
    expect(inherited?.text()).not.toContain("Remove");
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
