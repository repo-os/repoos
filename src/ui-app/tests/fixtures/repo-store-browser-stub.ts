import { defineStore } from "pinia";
import { ref } from "vue";

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

export const useRepoStore = defineStore("responsive-test-repo", () => {
  const testRun = ref({ running: false, finishedAt: null });
  const taskChecks = ref({});
  const integration = ref({ empty: true, active: null, queue: [], at: "" });
  async function refreshIntegration() {}
  return { testRun, taskChecks, integration, refreshIntegration };
});
