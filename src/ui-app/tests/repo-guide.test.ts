import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";
import { createPinia } from "pinia";
import type { Agent, RepoOSConfig } from "../../core/types";
import { agentsForConfig, DEFAULT_AGENTS } from "../../core/config";
import { repoGuidePrompt, resolveRepoGuide } from "../../server/agents";
import RepoGuideChat from "../src/components/RepoGuideChat.vue";

const config = (agents: Agent[]): RepoOSConfig => ({
  root: "/tmp/example-repo",
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
  agents,
});

describe("Ross (Repository Assistant)", () => {
  it("adds only Ross to older saved agent configurations (migrating legacy name)", () => {
    const saved: Agent[] = [
      { name: "engineer", cli: "codex", model: "gpt-test", enabled: true },
      { name: "my custom role", cli: "opencode", model: "default", enabled: true },
      { name: "RepoOS Guide", cli: "opencode", model: "big pickle", enabled: true },
    ];
    const merged = agentsForConfig(config(saved));

    expect(merged.find((agent) => agent.name === "engineer")?.model).toBe("gpt-test");
    expect(merged.some((agent) => agent.name === "my custom role")).toBe(true);
    // Legacy "RepoOS Guide" should be renamed to "Ross"
    expect(merged.filter((agent) => agent.name === "Ross")).toHaveLength(1);
    expect(merged.some((agent) => agent.name === "RepoOS Guide")).toBe(false);
    expect(merged.some((agent) => agent.name === "reviewer")).toBe(false);
    expect(merged.some((agent) => agent.name === "pm")).toBe(false);
    expect(DEFAULT_AGENTS.some((agent) => agent.name === "Ross")).toBe(true);
  });

  it("honors the Agents-page enabled toggle", () => {
    const guide = DEFAULT_AGENTS.find((agent) => agent.name === "Ross")!;
    expect(resolveRepoGuide(config([{ ...guide, enabled: false }]))).toBeNull();
    expect(resolveRepoGuide(config([{ ...guide, enabled: true }]))?.name).toBe("Ross");
  });

  it("resolves both the new Ross name and the legacy RepoOS Guide name", () => {
    const legacyGuide = { name: "RepoOS Guide", cli: "opencode", model: "big pickle", enabled: true };
    expect(resolveRepoGuide(config([legacyGuide]))?.name).toBe("Ross");
  });

  it("grounds the chat mission in live repository context and keeps it read-only", () => {
    const guide = DEFAULT_AGENTS.find((agent) => agent.name === "Ross")!;
    const prompt = repoGuidePrompt(
      "Which issues are active?",
      "Repository: example\n- #0114 [active] Add persistent chat",
      guide,
    );

    expect(prompt).toContain("Which issues are active?");
    expect(prompt).toContain("#0114 [active]");
    expect(prompt).toContain("Never edit files");
    expect(prompt).toContain("Ross");
  });
});

const chatState = {
  ok: true,
  agent: DEFAULT_AGENTS.find((agent) => agent.name === "RepoOS Guide"),
  enabled: true,
  lines: [],
  running: false,
  stats: {
    accumulatedMs: 0,
    turnStartedAt: null,
    lastOutputAt: null,
    tokens: null,
    costUsd: null,
    stalled: false,
  },
};

let mountedApp: App<Element> | null = null;

async function mountChat(fetchMock: typeof fetch): Promise<HTMLElement> {
  vi.stubGlobal("fetch", fetchMock);
  const host = document.createElement("div");
  document.body.append(host);
  mountedApp = createApp(RepoGuideChat);
  mountedApp.use(createPinia());
  mountedApp.mount(host);
  await nextTick();
  await Promise.resolve();
  await nextTick();
  (host.querySelector(".guide-launcher") as HTMLButtonElement).click();
  await nextTick();
  return host;
}

function enterMessage(host: HTMLElement, text: string): HTMLFormElement {
  const textarea = host.querySelector("textarea") as HTMLTextAreaElement;
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return host.querySelector("form") as HTMLFormElement;
}

afterEach(() => {
  mountedApp?.unmount();
  mountedApp = null;
  document.body.textContent = "";
  vi.unstubAllGlobals();
});

describe("RepoOS Guide message submission", () => {
  it("removes an optimistic human message and restores the draft when sending fails", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ error: "RepoOS Guide is busy" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(chatState), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const host = await mountChat(fetchMock as typeof fetch);
    const form = enterMessage(host, "What is active?");

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(host.textContent).toContain("RepoOS Guide is busy"));
    expect(host.querySelector(".guide-row-human")).toBeNull();
    expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe("What is active?");
  });

  it("allows only one request while a submit is awaiting its response", async () => {
    let finishPost!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => {
      finishPost = resolve;
    });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return pendingPost;
      return Promise.resolve(
        new Response(JSON.stringify(chatState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const host = await mountChat(fetchMock as typeof fetch);
    const form = enterMessage(host, "Summarize the repo");

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    finishPost(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await pendingPost;
    await nextTick();
  });
});
