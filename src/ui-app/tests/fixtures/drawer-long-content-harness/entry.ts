/**
 * Browser harness for the task drawer's long-content QA (#1221).
 *
 * Mounts the PRODUCTION `TaskDrawer` with the production pinia stores,
 * stylesheet and mount path used by the app. Only the transport is fake:
 * `window.fetch` answers fixture payloads for the endpoints the drawer loads,
 * so every byte the drawer renders flows through the same
 * fetch → store → component path as in production, and the tab strip, subtabs,
 * shot rows and shot viewer are the component's real DOM with its real click
 * handlers. Not shipped — built only by
 * `task-drawer-long-content-browser.test.ts`.
 */
import "../../../src/style.css";
import { createApp } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../../../src/components/TaskDrawer.vue";
import { useUiStore } from "../../../src/stores/ui";
import {
  fixtureDiff,
  fixtureLogs,
  fixtureOutput,
  fixtureReviewReport,
  fixtureShots,
  fixtureTask,
} from "./fixtures";

declare const __REPOOS_COPY_INSPECTOR__: boolean;

/** Fake EventSource: the drawer must not open a real stream in the harness. */
class HarnessEventSource {
  constructor(_url: string) {}
  addEventListener(): void {}
  close(): void {}
}
window.EventSource = HarnessEventSource as unknown as typeof EventSource;

/** Answer every endpoint the drawer loads with long fixture content. */
const fixtureResponse = (path: string): unknown => {
  const taskScoped = path.includes("/api/tasks/0001");
  if (taskScoped && path.includes("/shots")) return { ok: true, shots: fixtureShots };
  if (taskScoped && path.includes("/ui-verification")) return { ok: true, evidence: null };
  if (taskScoped && path.includes("/diff-stats"))
    return { ok: true, stats: { filesChanged: 6, additions: 240, deletions: 0 } };
  if (taskScoped && path.includes("/diff")) return { ok: true, diff: fixtureDiff };
  if (taskScoped && path.includes("/review"))
    return { ok: true, running: false, enabled: true, review: fixtureReviewReport, lines: [] };
  if (taskScoped && path.includes("/landable"))
    return {
      ok: true,
      taskId: "0001",
      branch: "feat/drawer-long-content-fixture",
      headSha: "a".repeat(40),
      lockSha: "a".repeat(40),
      landable: true,
      checks: [],
      summary: { pass: 0, warn: 0, fail: 0 },
    };
  if (taskScoped && path.includes("/checks")) return { ok: true, checks: [] };
  if (taskScoped && path.includes("/logs")) return { ok: true, logs: fixtureLogs };
  if (taskScoped && path.includes("/output")) return { ok: true, lines: fixtureOutput, stats: {} };
  if (taskScoped && path.includes("/stats")) return { ok: true, stats: null };
  if (path.includes("/handoff-status")) return { state: "idle" };
  if (path.includes("/api/agents/running")) return { tasks: [] };
  if (path.includes("/api/index"))
    return {
      tasks: [fixtureTask],
      counts: { draft: 0, inbox: 0, ready: 0, active: 1, review: 0, done: 0 },
      taskCount: 1,
    };
  return { ok: true };
};

window.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const path =
    typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return new Response(JSON.stringify(fixtureResponse(path)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

async function mount(): Promise<void> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  createApp(TaskDrawer).use(pinia).use(router).mount("#app");
  // Open the task AFTER mount, the same order production uses: the drawer's
  // own watcher sees `ui.active` change and initializes the edit draft (the
  // Task tab's spec card is one of the long-content surfaces under test).
  const ui = useUiStore();
  ui.open(fixtureTask);
  // Signal readiness to the driving test.
  document.documentElement.dataset.harnessReady = "true";
}

void mount();
