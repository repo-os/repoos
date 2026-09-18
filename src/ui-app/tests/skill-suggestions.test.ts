/**
 * #0405 — auto-suggest reusable skills from completed sessions.
 *
 * Unit coverage for the analysis pass: it must create at most ONE
 * `New Skill Suggestion: …` task (type spec, assigned to human, status inbox),
 * list additional candidates inside that one body, stay a no-op when disabled
 * or when there is no transcript, and be idempotent per originating task.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import {
  SKILL_SUGGESTION_KEY,
  SkillSuggestionManager,
  buildSkillSuggestionMission,
  buildSuggestionTaskBody,
  parseSkillSuggestion,
  skillSlug,
  transcriptToText,
  type SkillSuggestionDeps,
} from "../../server/skill-suggestions";

function makeConfig(root: string, overrides: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    inputsDir: "inputs",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    agents: [
      { name: "engineer", cli: "opencode", model: "default", enabled: true, instructions: "" },
    ],
    ...overrides,
  } as RepoOSConfig;
}

function makeTask(extra: Record<string, unknown> = {}): Task {
  const content = [
    "---",
    'id: "0405"',
    'title: "Origin task"',
    "type: feature",
    "status: review",
    "---",
    "## Problem",
    "",
    "Do a multi-step thing.",
    "",
  ].join("\n");
  const task = parseTask({
    content,
    absPath: join(tmpdir(), "0405-origin.md"),
    root: tmpdir(),
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
  task.extra = extra;
  return task;
}

const ROOT = mkdtempSync(join(tmpdir(), "repoos-skill-suggest-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const SKILL_PAYLOAD = {
  skill: {
    name: "Audit a failing build",
    description: "Use when the build is red and the cause is unclear.",
    body: "# Audit a failing build\n\n## When to use\n- Build red\n\n## Procedure\n1. Run the build.",
  },
  additional: [{ name: "Rotate credentials", description: "Only if a key leaked." }],
};

function makeManager(overrides: Partial<SkillSuggestionDeps> = {}): {
  manager: SkillSuggestionManager;
  created: Array<Record<string, unknown>>;
  markOrigin: ReturnType<typeof vi.fn>;
} {
  const created: Array<Record<string, unknown>> = [];
  const markOrigin = vi.fn();
  const config = makeConfig(ROOT);
  const manager = new SkillSuggestionManager({
    config,
    getTranscript: () => [{ type: "text", text: "Ran the build, fixed the config, re-ran." }],
    createTask: (input) => {
      created.push(input as unknown as Record<string, unknown>);
      return { id: "0500", ...input } as unknown as Task;
    },
    markOrigin,
    analyze: async () => ({ ok: true, output: JSON.stringify(SKILL_PAYLOAD) }),
    ...overrides,
  });
  return { manager, created, markOrigin };
}

describe("parseSkillSuggestion", () => {
  it("parses a skill plus additional candidates", () => {
    const parsed = parseSkillSuggestion(JSON.stringify(SKILL_PAYLOAD));
    expect(parsed.skill?.name).toBe("Audit a failing build");
    expect(parsed.skill?.body).toContain("## Procedure");
    expect(parsed.additional).toEqual([
      { name: "Rotate credentials", description: "Only if a key leaked." },
    ]);
  });

  it("tolerates a fenced JSON answer with surrounding prose", () => {
    const raw = `Here you go:\n\`\`\`json\n${JSON.stringify({ skill: SKILL_PAYLOAD.skill, additional: [] })}\n\`\`\``;
    expect(parseSkillSuggestion(raw).skill?.name).toBe("Audit a failing build");
  });

  it("returns no skill for malformed output", () => {
    expect(parseSkillSuggestion("not json at all").skill).toBeNull();
    expect(parseSkillSuggestion('{"skill": null}').skill).toBeNull();
  });

  it("rejects a skill with no body", () => {
    const parsed = parseSkillSuggestion('{"skill": {"name": "X", "body": ""}}');
    expect(parsed.skill).toBeNull();
  });
});

describe("draft rendering", () => {
  it("slugifies names for skills/<slug>/SKILL.md", () => {
    expect(skillSlug("Audit a Failing Build!")).toBe("audit-a-failing-build");
    expect(skillSlug("")).toBe("skill-suggestion");
  });

  it("renders the draft and lists additional candidates in one body", () => {
    const body = buildSuggestionTaskBody(makeTask(), SKILL_PAYLOAD.skill, [
      { name: "Rotate credentials", description: "Only if a key leaked." },
    ]);
    expect(body).toContain("skills/audit-a-failing-build/SKILL.md");
    expect(body).toContain("name: audit-a-failing-build");
    expect(body).toContain("# Audit a failing build");
    expect(body).toContain("## Other candidate procedures");
    expect(body).toContain("Rotate credentials");
  });

  it("flattens a transcript into legible text", () => {
    const text = transcriptToText([
      { type: "text", text: "hello" },
      { type: "tool", tool: "bash", input: "ls", output: "file.txt" },
      { type: "sys", d: "notice" },
      { s: "out", d: "plain line" },
      { s: "err", d: "bad thing" },
    ]);
    expect(text).toContain("hello");
    expect(text).toContain("$ bash ls");
    expect(text).toContain("file.txt");
    expect(text).toContain("! bad thing");
  });
});

describe("SkillSuggestionManager.run", () => {
  it("creates exactly one spec task assigned to a human", async () => {
    const { manager, created, markOrigin } = makeManager();
    const result = await manager.run(makeTask());

    expect(result.ok).toBe(true);
    expect(result.suggestionId).toBe("0500");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "New Skill Suggestion: Audit a failing build",
      type: "spec",
      status: "inbox",
      assignedTo: "human",
    });
    // Additional candidates live in the single task's body — never a second task.
    expect(String(created[0].body)).toContain("Rotate credentials");
    expect(markOrigin).toHaveBeenCalledWith(expect.objectContaining({ id: "0405" }), "0500");
  });

  it("creates nothing when the setting is off", async () => {
    const { manager, created } = makeManager({
      config: makeConfig(ROOT, { skillSuggestions: false }),
    });
    const result = await manager.run(makeTask());
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("is enabled by default when the key is unset", () => {
    const { manager } = makeManager({ config: makeConfig(ROOT, { skillSuggestions: undefined }) });
    expect(manager.enabled()).toBe(true);
  });

  it("creates nothing when the task has no transcript", async () => {
    const { manager, created } = makeManager({ getTranscript: () => [] });
    const result = await manager.run(makeTask());
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("creates nothing when a suggestion already exists for the task", async () => {
    const { manager, created } = makeManager();
    const result = await manager.run(makeTask({ [SKILL_SUGGESTION_KEY]: "0500" }));
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("creates nothing when the analysis finds no reusable procedure", async () => {
    const { manager, created } = makeManager({
      analyze: async () => ({ ok: true, output: '{"skill": null, "additional": []}' }),
    });
    const result = await manager.run(makeTask());
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("does not throw when the analysis run fails", async () => {
    const { manager, created } = makeManager({
      analyze: async () => ({ ok: false, error: "boom" }),
    });
    const result = await manager.run(makeTask());
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("buildSkillSuggestionMission", () => {
  it("includes the task id, spec, transcript, and JSON contract", () => {
    const mission = buildSkillSuggestionMission(makeTask(), "ran the build");
    expect(mission).toContain("Task #0405");
    expect(mission).toContain("Do a multi-step thing.");
    expect(mission).toContain("ran the build");
    expect(mission).toContain('"additional"');
  });
});
