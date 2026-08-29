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
    needsMerge: false,
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
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
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
  {
    key: "whisper.provider",
    label: "Voice transcription provider",
    type: "select",
    tier: "live",
    group: "voice",
    restartRequired: false,
    default: "none",
    options: [{ value: "groq", label: "Groq" }],
    description: "Voice-to-text provider",
  },
];

describe("searchAll", () => {
  it("returns nothing for an empty or whitespace query", () => {
    expect(searchAll("", { tasks, docs, fields })).toEqual([]);
    expect(searchAll("   ", { tasks, docs, fields })).toEqual([]);
  });

  it("matches tasks by id, title, and body, case-insensitively", () => {
    const byTitle = searchAll("search bar", { tasks, docs, fields });
    expect(byTitle.filter((r) => r.kind === "task").map((r) => r.title)).toEqual([
      "Search bar in the top bar",
    ]);

    const byId = searchAll("0008", { tasks, docs, fields });
    expect(byId.filter((r) => r.kind === "task").map((r) => r.title)).toEqual(["Theme picker"]);

    const byBody = searchAll("GLOBAL SEARCH", { tasks, docs, fields });
    expect(byBody.filter((r) => r.kind === "task").map((r) => r.title)).toEqual([
      "Search bar in the top bar",
    ]);
  });

  it("matches docs by title and path", () => {
    const hits = searchAll("architecture", { tasks, docs, fields });
    expect(hits.filter((r) => r.kind === "doc").map((r) => r.title)).toEqual(["Architecture"]);
    expect(
      searchAll("docs/arch", { tasks, docs, fields }).filter((r) => r.kind === "doc").length,
    ).toBeGreaterThan(0);
  });

  it("searches doc contents and provides snippets", () => {
    const docsWithContent = [
      {
        path: "AGENTS.md",
        title: "Agent instructions",
        content: "This document contains important agent rules and instructions for deployment.",
      },
      {
        path: "docs/architecture.md",
        title: "Architecture",
        content: "The system uses a modular architecture with components.",
      },
    ];
    const hits = searchAll("deployment", { tasks: [], docs: docsWithContent, fields: [] });
    const doc = hits.find((r) => r.kind === "doc");
    expect(doc && doc.kind === "doc" && doc.title).toEqual("Agent instructions");
    expect(doc && doc.kind === "doc" && doc.snippet).toBeTruthy();
  });

  it("uses fuzzy matching for typo tolerance", () => {
    const src = { tasks, docs, fields };
    const exact = searchAll("theme", src).filter((r) => r.kind === "setting");
    const typo = searchAll("thme", src).filter((r) => r.kind === "setting");
    expect(exact.length).toBeGreaterThan(0);
    expect(typo.length).toBeGreaterThan(0);
  });

  it("matches settings by label and key", () => {
    const byLabel = searchAll("cache directory", { tasks, docs, fields });
    expect(byLabel.filter((r) => r.kind === "setting").map((r) => r.key)).toEqual(["cacheDir"]);
    const byKey = searchAll("theme", { tasks, docs, fields });
    expect(byKey.filter((r) => r.kind === "setting").map((r) => r.key)).toContain("theme");
  });

  it("surfaces voice-transcription settings so they are reachable via ⌘K", () => {
    const byLabel = searchAll("voice transcription", { tasks, docs, fields });
    expect(byLabel.filter((r) => r.kind === "setting").map((r) => r.key)).toContain(
      "whisper.provider",
    );
    const byKey = searchAll("whisper.provider", { tasks, docs, fields });
    expect(byKey.some((r) => r.kind === "setting" && r.key === "whisper.provider")).toBe(true);
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
    const many = Array.from({ length: RESULT_CAP + 5 }, (_, i) =>
      makeTask({ id: `00${i}`, title: "theme task", body: "" }),
    );
    const hits = searchAll("theme task", { tasks: many, docs: [], fields: [] });
    expect(hits.filter((r) => r.kind === "task")).toHaveLength(RESULT_CAP);
  });

  it("builds helpful subtitles for click-through display", () => {
    const hits = searchAll("0007", { tasks, docs, fields });
    const task = hits.find((r) => r.kind === "task");
    expect(task && task.kind === "task" && task.subtitle).toContain("#0007");
  });

  it("ranks a title match above an older task's incidental body mention, even beyond the cap", () => {
    // RESULT_CAP filler tasks all mention "auth" once in the body, in id order
    // before the real title match — with no ranking, the cap fills up on the
    // filler and the actual match never surfaces.
    const filler = Array.from({ length: RESULT_CAP }, (_, i) =>
      makeTask({ id: `0${100 + i}`, title: `Unrelated task ${i}`, body: "touches auth somewhere" }),
    );
    const titleMatch = makeTask({ id: "0250", title: "Fix auth token race", body: "" });
    const hits = searchAll("auth", { tasks: [...filler, titleMatch], docs: [], fields: [] });
    const taskTitles = hits.filter((r) => r.kind === "task").map((r) => r.title);
    expect(taskTitles[0]).toBe("Fix auth token race");
  });

  it("ranks a rare term above a common one across matching tasks", () => {
    const common = makeTask({ id: "0300", title: "Update task list", body: "" });
    const rare = makeTask({ id: "0301", title: "Fix port stealing race", body: "" });
    const hits = searchAll("port stealing", { tasks: [common, rare], docs: [], fields: [] });
    const taskTitles = hits.filter((r) => r.kind === "task").map((r) => r.title);
    expect(taskTitles[0]).toBe("Fix port stealing race");
  });
});

function htmlToText(html: string): string {
  return html
    .replace(/<mark>/g, "")
    .replace(/<\/mark>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function docSnippet(query: string, content: string): string | undefined {
  const hits = searchAll(query, {
    tasks: [],
    docs: [{ path: "test.md", title: "Test", content }],
    fields: [],
  });
  const doc = hits.find((r) => r.kind === "doc" && r.path === "test.md");
  if (!doc || doc.kind !== "doc" || typeof doc.snippet === "string" || !doc.snippet)
    return undefined;
  return doc.snippet.html;
}

describe("snippet match highlighting", () => {
  it("does not render text past the snippet boundary when a fuzzy word is truncated mid-way", () => {
    const content = "start " + "q".repeat(70) + " end";
    // "q"*68+"rx" is within edit distance of the long word but is not a substring,
    // so this must take the fuzzy path and land mid-word.
    const query = "q".repeat(68) + "rx";
    const html = docSnippet(query, content);
    expect(html).toBeDefined();
    if (html === undefined) return;
    expect(html).toContain("<mark>");
    expect(htmlToText(html)).toBe(content.substring(0, 60));
    expect(htmlToText(html)).toHaveLength(60);
    expect(htmlToText(html)).not.toContain("q".repeat(70));
  });

  it("renders a plain (unhighlighted) snippet when the fuzzy word is truncated out entirely", () => {
    const content = "a".repeat(100) + " " + "b".repeat(100) + " " + "fuzzywordx";
    const query = "fuzzywordz";
    const html = docSnippet(query, content);
    expect(html).toBeDefined();
    if (html === undefined) return;
    expect(html).not.toContain("<mark>");
    expect(htmlToText(html)).toBe(content.substring(0, 60));
    expect(htmlToText(html)).toHaveLength(60);
  });

  it("escapes HTML in exact-match snippets while highlighting the match", () => {
    const content = "see <b>bold</b> and <script>bad()</script> here";
    const html = docSnippet("bold", content);
    expect(html).toBeDefined();
    if (html === undefined) return;
    expect(html).toContain("<mark>bold</mark>");
    expect(html).toContain("&lt;b&gt;");
    expect(htmlToText(html)).toContain("<b>bold</b>");
  });
});
