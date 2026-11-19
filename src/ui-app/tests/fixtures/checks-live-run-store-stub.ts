import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { liveRunSeed } from "./checks-live-run-states";

// Named exports the Checks tree imports alongside useRepoStore. ES modules
// fail at link time without them, even when the page never calls them.
export const COLUMNS = [
  { id: "inbox", label: "Inbox", color: "#566081" },
  { id: "ready", label: "Ready", color: "#39e0ff" },
  { id: "active", label: "Active", color: "#9d7bff" },
  { id: "review", label: "Review", color: "#ffb454" },
  { id: "done", label: "Done", color: "#4ef0a8" },
];
export function sortTasks<T>(tasks: T[]): T[] {
  return tasks;
}
export function statusColor(): string {
  return "#566081";
}

// Store stand-in for the live-run fixture (#1247). It seeds `testRun` and the
// close-out snapshot from `?liveState=` so the real Now and Test suite
// components render each state. Nothing here starts a run.
export const useRepoStore = defineStore("checks-live-run-test-repo", () => {
  const seed = liveRunSeed(new URLSearchParams(location.search).get("liveState"));
  const testRun = reactive({ ...seed.testRun });
  const taskChecks = ref({});
  const integration = ref<Record<string, unknown> | null>(seed.integration);
  const health = ref(null);
  async function refreshIntegration() {}
  async function refreshTestRun() {}
  async function startTestRun() {}
  async function startRemoteTestRun() {}
  function onError(err: unknown) {
    throw err;
  }
  function pushToast() {}
  return {
    testRun,
    taskChecks,
    integration,
    health,
    refreshIntegration,
    refreshTestRun,
    startTestRun,
    startRemoteTestRun,
    onError,
    pushToast,
  };
});
