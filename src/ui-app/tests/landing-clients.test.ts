import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import EnquiryForm from "../../../landing/src/components/EnquiryForm.vue";
import ForClients from "../../../landing/src/components/ForClients.vue";
import LandingApp from "../../../landing/src/App.vue";

let wrapper: VueWrapper | undefined;
const send = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", send.mockReset());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  vi.spyOn(HTMLFormElement.prototype, "reportValidity").mockReturnValue(true);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});
async function fill() {
  await wrapper!.get("#client-name").setValue("Alex at Example");
  await wrapper!.get("#client-email").setValue("alex@example.com");
  await wrapper!.get("#client-problem").setValue("Build a customer portal.");
}

describe("For Clients landing page", () => {
  it("preserves the approved sections, uses royal we, and opens the same enquiry from each CTA", async () => {
    wrapper = mount(ForClients, {
      props: { homeLink: "/?appearance=dark" },
      attachTo: document.body,
    });
    expect(wrapper.get("h1").text()).toBe("Your software.Built with RepoOS.");
    for (const phrase of [
      "Tools for your team",
      "Products for your customers",
      "Systems that work together",
      "Make the scope clear",
      "Hire the person.",
      "Before we talk.",
      "What would you like to build?",
    ])
      expect(wrapper.text()).toContain(phrase);
    expect(wrapper.text()).not.toMatch(/\b(I|I'll|I'm|me|my)\b/);
    expect(wrapper.text()).not.toMatch(/Divot|LightingAI|JaiNotes|Neung|PayoutAudit/);
    expect(wrapper.get("#client-email").attributes()).toMatchObject({
      type: "email",
      required: "",
    });
    for (const button of wrapper
      .findAll("button")
      .filter((b) => /Tell us about|Let's talk/.test(b.text()))) {
      await button.trigger("click");
      expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(true);
      await wrapper.get('[aria-label="Close enquiry"]').trigger("click");
    }
  });
  it("shares navigation and theme links on the deep-link entry", async () => {
    window.history.replaceState({}, "", "/for-clients?theme=gruvbox&appearance=light");
    wrapper = mount(LandingApp);
    await flushPromises();
    expect(wrapper.find(".clients-page").exists()).toBe(true);
    const links = wrapper.findAll(".nav-link");
    expect(links.map((l) => l.text())).toEqual([
      "The problem",
      "How it works",
      "The team",
      "Design",
      "Docs",
      "For Clients",
    ]);
    expect(links.at(-1)!.attributes("aria-current")).toBe("page");
    expect(links[0]!.attributes("href")).toBe("/?theme=gruvbox&appearance=light#why");
    expect(links[4]!.attributes("href")).toContain(
      "docs.repoos.org/?theme=gruvbox&appearance=light",
    );
    await wrapper.get('[aria-controls="mobile-menu"]').trigger("click");
    expect(wrapper.get('#mobile-menu a[aria-current="page"]').text()).toBe("For Clients");
  });
  it("does not replace the platform home page", () => {
    wrapper = mount(LandingApp);
    expect(wrapper.find(".clients-page").exists()).toBe(false);
    expect(wrapper.get("h1").text()).toContain("operating system");
    expect(wrapper.find('.nav-link[href*="/for-clients"]').exists()).toBe(true);
  });
});
describe("enquiry form", () => {
  it("blocks invalid/blank fields and duplicate sends, then shows success only after acknowledgement", async () => {
    let finish!: (response: Response) => void;
    send.mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    wrapper = mount(EnquiryForm);
    vi.mocked(HTMLFormElement.prototype.reportValidity).mockReturnValueOnce(false);
    await wrapper.get("form").trigger("submit");
    expect(send).not.toHaveBeenCalled();
    await fill();
    await wrapper.get("form").trigger("submit");
    await wrapper.get("form").trigger("submit");
    expect(send).toHaveBeenCalledTimes(1);
    expect(wrapper.get("fieldset").attributes()).toHaveProperty("disabled");
    expect(wrapper.text()).toContain("Sending…");
    expect(wrapper.text()).not.toContain("your enquiry has been sent");
    const options = send.mock.calls[0]![1];
    expect(send.mock.calls[0]![0]).toBe("/api/enquiry");
    expect(JSON.parse(options.body)).toMatchObject({
      name: "Alex at Example",
      email: "alex@example.com",
      problem: "Build a customer portal.",
      website: "",
    });
    finish(Response.json({ ok: true }));
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain("your enquiry has been sent");
    expect(wrapper.find("form").exists()).toBe(false);
  });
  it("keeps the draft and idempotency ID across ambiguous failures and retries", async () => {
    send.mockRejectedValueOnce(new Error("network"));
    wrapper = mount(EnquiryForm);
    await fill();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("couldn't confirm");
    expect((wrapper.get("#client-email").element as HTMLInputElement).value).toBe(
      "alex@example.com",
    );
    send.mockResolvedValueOnce(Response.json({ ok: false }, { status: 502 }));
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("couldn't send");
    expect(JSON.parse(send.mock.calls[0]![1].body).submissionId).toBe(
      JSON.parse(send.mock.calls[1]![1].body).submissionId,
    );
    await wrapper.get("#client-problem").setValue("Edited brief.");
    send.mockResolvedValueOnce(Response.json({ ok: true }));
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(send.mock.calls[2]![1].body).submissionId).not.toBe(
      JSON.parse(send.mock.calls[1]![1].body).submissionId,
    );
  });
  it("explains rate limits without clearing the enquiry", async () => {
    send.mockResolvedValue(Response.json({ ok: false }, { status: 429 }));
    wrapper = mount(EnquiryForm);
    await fill();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("wait a minute");
    expect((wrapper.get("#client-problem").element as HTMLTextAreaElement).value).toBe(
      "Build a customer portal.",
    );
  });
});
