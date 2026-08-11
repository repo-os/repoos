import { describe, expect, it } from "vitest";
import { searchAll, RESULT_CAP } from "../src/search";
import type { Task, ConfigField, DocMeta } from "../src/types";

function makeTask(over: Partial<Task>): Task {
  return {
    id: "0001",
    title: "Some task",
    type: "feature",
    status: "ready",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    needsInput: false,
    created_at: null,
    updated_at: null,
    path: "work/0001-task.md",
    absPath: "/repo/work/0001-task.md",
    body: "Body text",
    extra: {},
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
    ...over,
  };
}

const tasks: Task[] = [
  makeTask({ id: "0007", title: "Search bar in the top bar", body: "Add a global search bar." }),
  makeTask({ id: "0008", title: "Theme picker", body: "Pick light or dark theme." }),
];

const docs: DocMeta[] = [
  { path: "AGENTS.md", title: "Agent instructions" },
  { path: "docs/architecture.md", title: "Architecture" },
];

const fields: ConfigField[] = [
  {
    key: "theme",
    label: "Theme",
    type: "select",
    tier: "live",
    restartRequired: false,
    default: "system",
    options: [{ value: "dark", label: "Dark" }],
    description: "UI theme",
  },
  {
    key: "cacheDir",
    label: "Cache directory",
    type: "string",
    tier: "restart",
    restartRequired: true,
    default: "",
    description: "Cache location",
  },
];

describe("searchAll", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(searchAll("", { tasks, docs, fields })).toEqual([]);
    expect(searchAll("   ", { tasks, docs, fields })).toEqual([]);
  });

  it("matches tasks by id, title, and body, case-insensitively", () => {
    const byTitle = searchAll("search bar", { tasks, docs, fields });
    expect(byTitle.filter((r) => r.kind === "task").map((r) => r.title)).toEqual(["Search bar in the top bar"]);

    const byId = searchAll("0008", { tasks, docs, fields });
    expect(byId.filter((r) => r.kind === "task").map((r) => r.title)).toEqual(["Theme picker"]);

    const byBody = searchAll("GLOBAL SEARCH", { tasks, docs, fields });
    expect(byBody.filter((r) => r.kind === "task").map((r) => r.title)).toEqual(["Search bar in the top bar"]);
  });

  it("matches docs by title and path", () => {
    const hits = searchAll("architecture", { tasks, docs, fields });
    expect(hits.filter((r) => r.kind === "doc").map((r) => r.title)).toEqual(["Architecture"]);
    expect(searchAll("docs/arch", { tasks, docs, fields }).filter((r) => r.kind === "doc").length).toBeGreaterThan(0);
  });

  it("matches settings by label and key", () => {
    const byLabel = searchAll("cache directory", { tasks, docs, fields });
    expect(byLabel.filter((r) => r.kind === "setting").map((r) => r.key)).toEqual(["cacheDir"]);
    const byKey = searchAll("theme", { tasks, docs, fields });
    expect(byKey.filter((r) => r.kind === "setting").map((r) => r.key)).toContain("theme");
  });

  it("groups results tasks → docs → settings", () => {
    const src = {
      tasks: [makeTask({ title: "theme", body: "" })],
      docs: [{ path: "theme.md", title: "theme doc" }],
      fields,
    };
    const kinds = searchAll("theme", src).map((r) => r.kind);
    expect(kinds).toEqual(["task", "doc", "setting"]);
  });

  it("caps per kind", () => {
    const many = Array.from({ length: RESULT_CAP + 5 }, (_, i) => makeTask({ id: `00${i}`, title: "theme task", body: "" }));
    const hits = searchAll("theme task", { tasks: many, docs: [], fields: [] });
    expect(hits.filter((r) => r.kind === "task")).toHaveLength(RESULT_CAP);
  });

  it("builds helpful subtitles for click-through display", () => {
    const hits = searchAll("0007", { tasks, docs, fields });
    const task = hits.find((r) => r.kind === "task");
    expect(task && task.kind === "task" && task.subtitle).toContain("#0007");
  });
});
