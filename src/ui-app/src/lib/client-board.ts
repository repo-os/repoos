import type { Task } from "../types";

export const clientColumns = [
  { id: "planned", label: "Planned" },
  { id: "building", label: "Building" },
  { id: "reviewed", label: "Reviewed" },
] as const;

type ClientColumn = (typeof clientColumns)[number]["id"];
type ClientTask = Pick<Task, "id" | "title" | "status" | "isArchived">;

const presentation: Partial<Record<Task["status"], { column: ClientColumn; line: string }>> = {
  inbox: { column: "planned", line: "Being planned" },
  ready: { column: "planned", line: "Ready to start" },
  active: { column: "building", line: "In progress" },
  review: { column: "reviewed", line: "Ready for review" },
};

export function clientBoardTasks(tasks: ClientTask[]) {
  const columns: Record<ClientColumn, Array<ClientTask & { line: string }>> = {
    planned: [],
    building: [],
    reviewed: [],
  };
  for (const task of tasks) {
    const state = presentation[task.status];
    if (state && !task.isArchived) columns[state.column].push({ ...task, line: state.line });
  }
  return columns;
}
