/**
 * Dev page (#0748).
 *
 * The nav gate (Dev appears only when a project declares `[[dev.targets]]`),
 * the grouped rendering (project → target with name / kind / state / label),
 * the Start / Stop / Restart actions hitting the #0747 dev-target API, a failed
 * target's reason and log tail, the server open-URL link opening in a new tab,
 * the restart confirmation using the shared dialog (never a native confirm),
 * the Last output collapse/expand control (#0777), and the phone-width layout
 * rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPinia, setActivePinia } from "pinia";
import DevView from "../src/views/DevView.vue";
import { useRepoStore } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import { fmtDate, fmtTime } from "../src/lib/time";
import { DEV_NAV, NAV, navFor, navFromConfig } from "../src/nav";
import { flush, json } from "./component-test-helpers";
import type { DevFailureView, DevTargetView, Health } from "../src/types";

function makeHealth(over: Partial<Health> = {}): Health {
  return {
    ok: true,
    root: "/tmp/repo",
    projectName: "repoos",
    branch: null,
    taskCount: 0,
    workDir: "work",
    version: "1.0.0",
    buildAt: null,
    buildHash: null,
    buildAvailableHash: null,
    buildAvailableAt: null,
    isPreviewBuild: false,
    canaryCounter: 0,
    canaryPath: ".repoos/canary.txt",
    ...over,
  };
}

function target(over: Partial<DevTargetView> = {}): DevTargetView {
  return {
    name: "web",
    kind: "server",
    command: "bun run dev",
    label: "Web app",
    status: "stopped",
    log: [],
    url: "http://localhost:5173",
    ...over,
  };
}

/** Install a fetch mock serving `/api/dev/targets` + the action routes. */
function installFetch(options: { targets?: DevTargetView[]; errors?: string[] }): {
  calls: Array<{ url: string; method: string }>;
} {
  const calls: Array<{ url: string; method: string }> = [];
  let current: DevTargetView[] = options.targets ?? [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (url.endsWith("/api/dev/targets")) {
        return json({ ok: true, targets: current, errors: options.errors ?? [] });
      }
      const action = url.match(
        /\/api\/dev\/targets\/([^/]+)\/(start|stop|restart|stop-holder|explain)$/,
      );
      if (action) {
        const name = decodeURIComponent(action[1]);
        const kind = action[2];
        if (kind === "explain") {
          return json({ ok: true, summary: "The port is held by a stale vite process." });
        }
        if (kind === "stop-holder") {
          const found = current.find((t) => t.name === name) ?? target({ name });
          return json({ ok: true, target: found });
        }
        // Reflect the action's outcome in the authoritative list, the way the
        // server would, so the follow-up refresh shows the new state.
        current = current.map((t) =>
          t.name === name ? { ...t, status: kind === "stop" ? "stopped" : "running" } : t,
        );
        const found = current.find((t) => t.name === name) ?? target({ name });
        return json({ ok: true, target: found });
      }
      throw new Error("unexpected fetch: " + url);
    }),
  );
  return { calls };
}

function mountView() {
  return mount(DevView, { global: { stubs: { teleport: true, Transition: true } } });
}

function actionButton(wrapper: ReturnType<typeof mount>, label: string, index = 0) {
  return wrapper.findAll("button").filter((b) => b.text().trim() === label)[index];
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useRepoStore().health = makeHealth();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Dev nav gating (#0748)", () => {
  it("hides Dev when no project declares targets", () => {
    expect(navFor(false, false, false, false).map((n) => n.id)).not.toContain("dev");
    expect(navFor(false, false, false, false)).toEqual(NAV);
    expect(navFromConfig({}).map((n) => n.id)).not.toContain("dev");
    expect(navFromConfig(null).map((n) => n.id)).not.toContain("dev");
    // A `dev` block with only the inspector (no targets) stays hidden.
    expect(navFromConfig({ dev: { inspector: { enabled: true } } }).map((n) => n.id)).not.toContain(
      "dev",
    );
    expect(navFromConfig({ dev: { targets: [] } }).map((n) => n.id)).not.toContain("dev");
  });

  it("shows Dev when a project declares at least one target", () => {
    expect(navFor(false, false, false, true).map((n) => n.id)).toContain("dev");
    expect(navFromConfig({ dev: { targets: [{ name: "web" }] } }).map((n) => n.id)).toContain(
      "dev",
    );
  });

  it("places Dev just before Agents, regardless of the other opt-ins", () => {
    const ids = navFromConfig({
      release: { enabled: true },
      deployments: [{ name: "x" }],
      stories: { enabled: true },
      dev: { targets: [{ name: "web" }] },
    }).map((n) => n.id);
    expect(ids.indexOf("dev")).toBe(ids.indexOf("agents") - 1);
    expect(DEV_NAV.path).toBe("/dev");
  });
});

describe("DevView layout and state (#0748)", () => {
  it("groups targets by project and shows name, kind, state and label", async () => {
    installFetch({
      targets: [
        target({ name: "web", label: "Web app", kind: "server", status: "running" }),
        target({
          name: "apk",
          label: "Debug APK",
          kind: "artifact",
          status: "stopped",
          url: undefined,
          artifactPath: "dist/app.apk",
        }),
      ],
    });
    const wrapper = mountView();
    await flush();

    // One project group, named from the server's health payload.
    expect(wrapper.find(".dev-group-name").text()).toBe("repoos");
    expect(wrapper.findAll(".dev-card")).toHaveLength(2);

    const web = wrapper.findAll(".dev-card")[0];
    expect(web.find(".dev-card-label").text()).toBe("Web app");
    expect(web.find(".dev-card-name").text()).toBe("web");
    expect(web.find(".dev-chip--kind").text()).toBe("Server");
    expect(web.find(".dev-state-pill").text()).toContain("Running");
    expect(web.attributes("data-status")).toBe("running");

    const apk = wrapper.findAll(".dev-card")[1];
    expect(apk.find(".dev-card-label").text()).toBe("Debug APK");
    expect(apk.find(".dev-chip--kind").text()).toBe("Build");
    expect(apk.text()).toContain("dist/app.apk");
  });

  it("renders a process target with no URL link, its state and its log", async () => {
    installFetch({
      targets: [
        target({
          name: "divot",
          label: "Divot bar",
          kind: "process",
          status: "running",
          url: undefined,
          log: ["building…", "launched"],
        }),
      ],
    });
    const wrapper = mountView();
    await flush();

    const card = wrapper.find(".dev-card");
    expect(card.find(".dev-card-label").text()).toBe("Divot bar");
    expect(card.find(".dev-chip--kind").text()).toBe("Process");
    expect(card.find(".dev-state-pill").text()).toContain("Running");
    // A process has no URL — no open link, but the note explains its state.
    expect(card.find("a.dev-open").exists()).toBe(false);
    expect(card.text()).toContain("running while the process is alive");
    expect(card.find(".dev-log-body").text()).toContain("launched");
  });

  it("shows how long a running target has been up, with the exact start time on hover (#0774)", async () => {
    // 17.5h keeps the assertion clear of the hour boundary in `relTime`.
    const startedAt = new Date(Date.now() - 17.5 * 3_600_000).toISOString();
    installFetch({
      targets: [
        target({ name: "web", kind: "process", status: "running", startedAt }),
        target({ name: "api", status: "stopped", startedAt, url: "http://localhost:4000" }),
      ],
    });
    const wrapper = mountView();
    await flush();

    const running = wrapper.findAll(".dev-card")[0];
    const started = running.find('[data-test-id="dev-started"]');
    expect(started.exists()).toBe(true);
    expect(started.text()).toContain("17 hours ago");
    // Hover/focus tooltip carries the exact start timestamp, formatted the way
    // the rest of the UI formats date/time.
    expect(started.attributes("data-tip")).toBe(`${fmtDate(startedAt)} at ${fmtTime(startedAt)}`);
    // Focusable so keyboard users reach the tooltip too.
    expect(started.attributes("tabindex")).toBe("0");

    // A stopped target has no running chip, so no elapsed time either.
    const stopped = wrapper.findAll(".dev-card")[1];
    expect(stopped.find('[data-test-id="dev-started"]').exists()).toBe(false);
    expect(stopped.find(".dev-state-pill").text()).toContain("Stopped");
  });

  it("marks a started target as running for the highlight, and not a stopped one (#0801)", async () => {
    installFetch({
      targets: [
        target({ name: "web", status: "running" }),
        target({ name: "api", status: "stopped", url: "http://localhost:4000" }),
        target({ name: "job", status: "starting", url: "http://localhost:5000" }),
        target({ name: "bad", status: "failed", url: "http://localhost:6000" }),
      ],
    });
    const wrapper = mountView();
    await flush();

    const cards = wrapper.findAll(".dev-card");
    // Same hook the active remote runner uses: `data-running` drives the glow.
    expect(cards[0]!.attributes("data-running")).toBe("true");
    // Stopped, starting and failed targets are not highlighted as running.
    expect(cards[1]!.attributes("data-running")).toBeUndefined();
    expect(cards[2]!.attributes("data-running")).toBeUndefined();
    expect(cards[3]!.attributes("data-running")).toBeUndefined();
  });

  it("reuses the shared remote-runner running glow rather than a new style (#0801)", () => {
    const dev = readFileSync(join(resolve(__dirname, ".."), "src/views/DevView.vue"), "utf8");
    const runners = readFileSync(
      join(resolve(__dirname, ".."), "src/components/RemoteRunnersPanel.vue"),
      "utf8",
    );
    const globals = readFileSync(join(resolve(__dirname, ".."), "src/style.css"), "utf8");
    // The pulse is defined once, globally, and both surfaces reference it by name.
    expect(globals).toMatch(/@keyframes running-glow-pulse/);
    expect(dev).toMatch(/animation:\s*running-glow-pulse/);
    expect(runners).toMatch(/animation:\s*running-glow-pulse/);
  });

  it("shows a failed target's reason and its last output lines", async () => {
    installFetch({
      targets: [
        target({
          status: "failed",
          error: "process exited with code 1",
          log: ["booting…", "port 5173 in use", "exit 1"],
        }),
      ],
    });
    const wrapper = mountView();
    await flush();
    expect(wrapper.find(".dev-failure").text()).toContain("process exited with code 1");
    const log = wrapper.find(".dev-log-body").text();
    expect(log).toContain("port 5173 in use");
  });

  it("surfaces [[dev.targets]] config errors so a typo is visible", async () => {
    installFetch({
      targets: [target()],
      errors: ['[dev.targets] web: kind must be "server" or "artifact"'],
    });
    const wrapper = mountView();
    await flush();
    expect(wrapper.find(".dev-config-errors").text()).toContain('kind must be "server"');
  });

  it("renders an open-URL link for a server target that opens in a new tab", async () => {
    installFetch({
      targets: [target({ kind: "server", url: "http://localhost:5173" })],
    });
    const wrapper = mountView();
    await flush();
    const link = wrapper.find("a.dev-open");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("http://localhost:5173");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toContain("noreferrer");
  });

  it("shows an empty state when nothing is declared", async () => {
    installFetch({ targets: [] });
    const wrapper = mountView();
    await flush();
    expect(wrapper.find(".dev-empty").exists()).toBe(true);
    expect(wrapper.findAll(".dev-card")).toHaveLength(0);
  });
});

describe("DevView failure summary (#0775)", () => {
  const failure: DevFailureView = {
    kind: "port-in-use",
    what: "Web app could not start: its port is already taken.",
    cause: "Port 5173 is already in use by another process.",
    fix: "Stop the process using port 5173, then start the target again.",
    port: 5173,
    holder: {
      pid: 4242,
      command: "node /opt/vite --strictPort",
      repoosOwned: true,
      target: "web",
      stale: true,
    },
    canStopHolder: true,
  };

  it("shows the plain-language summary with the port holder's PID and command", async () => {
    installFetch({
      targets: [target({ status: "failed", error: "process exited with code 1", failure })],
    });
    const wrapper = mountView();
    await flush();
    const summary = wrapper.find(".dev-summary");
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain("its port is already taken");
    expect(summary.text()).toContain("Port 5173 is already in use");
    expect(summary.text()).toContain("node /opt/vite --strictPort");
    expect(summary.text()).toContain("4242");
    // The raw server reason is still shown.
    expect(summary.text()).toContain("process exited with code 1");
  });

  it("stops a RepoOS-owned port holder through the API", async () => {
    const { calls } = installFetch({
      targets: [target({ status: "failed", failure })],
    });
    const wrapper = mountView();
    await flush();
    const stop = wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "Stop the process holding it");
    expect(stop, "stop-holder button").toBeTruthy();
    await stop!.trigger("click");
    await flush();
    expect(
      calls.some((c) => c.url.endsWith("/api/dev/targets/web/stop-holder") && c.method === "POST"),
    ).toBe(true);
  });

  it("shows the holder for the user to stop when RepoOS did not start it", async () => {
    const foreign: DevFailureView = {
      ...failure,
      holder: { pid: 777, command: "python -m http.server 5173", repoosOwned: false, stale: false },
      canStopHolder: false,
    };
    installFetch({ targets: [target({ status: "failed", failure: foreign })] });
    const wrapper = mountView();
    await flush();
    const summary = wrapper.find(".dev-summary");
    expect(summary.text()).toContain("python -m http.server 5173");
    expect(summary.text()).toContain("777");
    // No Stop action for a process RepoOS did not start.
    expect(
      summary.findAll("button").find((b) => b.text().trim() === "Stop the process holding it"),
    ).toBeUndefined();
  });

  it("offers an AI summary only when enabled, and shows it after asking", async () => {
    const { calls } = installFetch({ targets: [target({ status: "failed", failure })] });
    useConfigStore().data = { dev: { failureSummary: { ai: true } } };
    const wrapper = mountView();
    await flush();
    const explain = wrapper.findAll("button").find((b) => b.text().trim() === "Explain with AI");
    expect(explain, "explain button").toBeTruthy();
    await explain!.trigger("click");
    await flush();
    expect(
      calls.some((c) => c.url.endsWith("/api/dev/targets/web/explain") && c.method === "POST"),
    ).toBe(true);
    expect(wrapper.find(".dev-ai-text").text()).toContain("stale vite process");
  });

  it("hides the AI summary button when the setting is off", async () => {
    installFetch({ targets: [target({ status: "failed", failure })] });
    const wrapper = mountView();
    await flush();
    expect(wrapper.find(".dev-ai").exists()).toBe(false);
  });

  it("renders the full captured log in a focusable scroll region", async () => {
    const log = Array.from({ length: 50 }, (_, i) => `line ${i}`);
    installFetch({ targets: [target({ status: "failed", error: "boom", log })] });
    const wrapper = mountView();
    await flush();
    const body = wrapper.find(".dev-log-body");
    expect(body.attributes("tabindex")).toBe("0");
    expect(body.text()).toContain("line 0");
    expect(body.text()).toContain("line 49");
    expect(wrapper.find(".dev-log-count").text()).toContain("50 lines");
  });

  it("renders the dev:failed capture fixture without calling the API (#0775)", async () => {
    useRepoStore().health = makeHealth({ isPreviewBuild: true });
    window.history.replaceState({}, "", "/dev?shotState=dev:failed");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const wrapper = mountView();
      await flush();
      const summary = wrapper.find(".dev-summary");
      expect(summary.text()).toContain("Port 5173 is already in use");
      expect(summary.text()).toContain("node /opt/vite --strictPort");
      expect(wrapper.find(".dev-log-body").text()).toContain("already in use");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });

  it("renders the dev:running capture fixture with one highlighted target (#0801)", async () => {
    useRepoStore().health = makeHealth({ isPreviewBuild: true });
    window.history.replaceState({}, "", "/dev?shotState=dev:running");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const wrapper = mountView();
      await flush();
      const cards = wrapper.findAll(".dev-card");
      expect(cards).toHaveLength(2);
      // The started target carries the shared running hook; the stopped one doesn't.
      expect(cards[0]!.attributes("data-running")).toBe("true");
      expect(cards[1]!.attributes("data-running")).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("DevView Last output collapse (#0777)", () => {
  it("collapses and expands the output body beside the line count, per target", async () => {
    const log = Array.from({ length: 12 }, (_, i) => `line ${i}`);
    installFetch({
      targets: [
        target({ name: "web", status: "failed", error: "boom", log }),
        target({ name: "api", status: "running", log, url: "http://localhost:4000" }),
      ],
    });
    const wrapper = mountView();
    await flush();

    const cards = wrapper.findAll(".dev-card");
    // The log body's inline display — what v-show sets. Assert on this rather
    // than `isVisible()`: jsdom caches computed style per element and never
    // invalidates it for detached (VTU-mounted) nodes, so a pre-toggle
    // `isVisible()` would keep returning the stale value after the toggle.
    const bodyDisplay = (index: 0 | 1): string =>
      (cards[index]!.find(".dev-log-body").element as HTMLElement).style.display;
    const webToggle = cards[0]!.find(".dev-log-toggle");
    const apiToggle = cards[1]!.find(".dev-log-toggle");
    // The control sits beside the count in the section head, expanded at first.
    expect(webToggle.exists()).toBe(true);
    expect(webToggle.attributes("aria-expanded")).toBe("true");
    expect(bodyDisplay(0)).not.toBe("none");

    // Collapse: the body hides, the line count stays, the head marks itself.
    await webToggle.trigger("click");
    await flush();
    expect(bodyDisplay(0)).toBe("none");
    expect(webToggle.attributes("aria-expanded")).toBe("false");
    expect(cards[0]!.find(".dev-log-count").text()).toContain("12 lines");
    expect(cards[0]!.find(".dev-log-head").classes()).toContain("collapsed");

    // Collapse is per target — the other card is untouched.
    expect(apiToggle.attributes("aria-expanded")).toBe("true");
    expect(bodyDisplay(1)).not.toBe("none");

    // Expanding again restores the body.
    await webToggle.trigger("click");
    await flush();
    expect(bodyDisplay(0)).not.toBe("none");
    expect(webToggle.attributes("aria-expanded")).toBe("true");
  });
});

describe("DevView actions (#0748)", () => {
  it("starts a stopped target through the dev-target API and refreshes", async () => {
    const { calls } = installFetch({ targets: [target({ status: "stopped" })] });
    const wrapper = mountView();
    await flush();

    await actionButton(wrapper, "Start").trigger("click");
    await flush();

    expect(
      calls.some((c) => c.url.endsWith("/api/dev/targets/web/start") && c.method === "POST"),
    ).toBe(true);
    expect(wrapper.find(".dev-state-pill").text()).toContain("Running");
  });

  it("stops a running target", async () => {
    const { calls } = installFetch({ targets: [target({ status: "running" })] });
    const wrapper = mountView();
    await flush();

    await actionButton(wrapper, "Stop").trigger("click");
    await flush();

    expect(
      calls.some((c) => c.url.endsWith("/api/dev/targets/web/stop") && c.method === "POST"),
    ).toBe(true);
  });

  it("confirms restart of a running target with the shared dialog, then restarts", async () => {
    const { calls } = installFetch({ targets: [target({ status: "running" })] });
    const wrapper = mountView();
    await flush();

    await actionButton(wrapper, "Restart").trigger("click");
    await flush();

    // The shared ConfirmDialog, not a native confirm — and no request yet.
    expect(wrapper.text()).toContain("Restart target?");
    expect(wrapper.text()).toContain("Web app");
    expect(calls.some((c) => c.url.endsWith("/restart"))).toBe(false);

    // Confirming runs the restart.
    const confirm = wrapper
      .findAll("button")
      .find((b) => b.text().trim() === "Restart" && b.element.closest(".cc-modal-actions"));
    expect(confirm, "confirm button in the dialog actions").toBeTruthy();
    await confirm!.trigger("click");
    await flush();
    expect(
      calls.some((c) => c.url.endsWith("/api/dev/targets/web/restart") && c.method === "POST"),
    ).toBe(true);
  });

  it("restarts a stopped target without a confirmation", async () => {
    const { calls } = installFetch({ targets: [target({ status: "stopped" })] });
    const wrapper = mountView();
    await flush();

    await actionButton(wrapper, "Restart").trigger("click");
    await flush();

    expect(wrapper.text()).not.toContain("Restart target?");
    expect(calls.some((c) => c.url.endsWith("/restart") && c.method === "POST")).toBe(true);
  });

  it("disables Start while a target is running and Stop while it is stopped", async () => {
    installFetch({
      targets: [
        target({ name: "web", status: "running" }),
        target({ name: "api", status: "stopped", url: "http://localhost:4000" }),
      ],
    });
    const wrapper = mountView();
    await flush();
    const cards = wrapper.findAll(".dev-card");
    const startButtons = cards.map((c) => c.findAll("button").find((b) => b.text() === "Start")!);
    const stopButtons = cards.map((c) => c.findAll("button").find((b) => b.text() === "Stop")!);
    expect(startButtons[0].attributes("disabled")).toBeDefined();
    expect(stopButtons[0].attributes("disabled")).toBeUndefined();
    expect(startButtons[1].attributes("disabled")).toBeUndefined();
    expect(stopButtons[1].attributes("disabled")).toBeDefined();
  });
});

describe("DevView phone-width layout (#0748)", () => {
  it("stacks the card head and wraps long output at the page breakpoint, with no horizontal scroll", () => {
    const source = readFileSync(join(resolve(__dirname, ".."), "src/views/DevView.vue"), "utf8");
    expect(source).toMatch(/@media \(max-width: 640px\)/);
    expect(source).toMatch(/\.dev-card-head\s*\{[^}]*flex-direction:\s*column/);
    // Long commands and log lines wrap rather than widening the page.
    expect(source).toMatch(/\.dev-log-body\s*\{[^}]*overflow-x:\s*hidden/);
    expect(source).toMatch(/\.dev-command\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("never reaches for a native confirm/alert/prompt", () => {
    const source = readFileSync(join(resolve(__dirname, ".."), "src/views/DevView.vue"), "utf8");
    expect(source).not.toMatch(/\b(window|globalThis)\.(confirm|alert|prompt)\s*\(/);
    expect(source).not.toMatch(/[^.\w](confirm|alert|prompt)\s*\(/);
  });
});
