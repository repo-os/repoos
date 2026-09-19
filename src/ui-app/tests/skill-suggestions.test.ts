/**
 * #0429 — evidence-gated, conservative auto-suggestions for reusable skills.
 *
 * Unit coverage for the analysis pass: it only runs on `done`, defaults to no
 * suggestion, rejects the explicit non-skill categories, persists a first
 * candidate internally without creating a user-visible task, and creates at
 * most one task once corroborated by a second independent session (or a named
 * stable external workflow).
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import {
  FileSkillCandidateStore,
  SKILL_SUGGESTION_KEY,
  SkillSuggestionManager,
  buildSkillSuggestionMission,
  buildSuggestionTaskBody,
  parseSkillSuggestion,
  skillSlug,
  transcriptToText,
  validateSkillDraft,
  type SkillCandidateRecord,
  type SkillCandidateStore,
  type SkillDraft,
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

function makeTask(id = "0405", status = "done", extra: Record<string, unknown> = {}): Task {
  const content = [
    "---",
    `id: "${id}"`,
    'title: "Origin task"',
    "type: feature",
    `status: ${status}`,
    "---",
    "## Problem",
    "",
    "Do a multi-step thing.",
    "",
  ].join("\n");
  const task = parseTask({
    content,
    absPath: join(tmpdir(), `${id}-origin.md`),
    root: tmpdir(),
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
  task.extra = extra;
  return task;
}

const ROOT = mkdtempSync(join(tmpdir(), "repoos-skill-suggest-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function memStore(): { store: SkillCandidateStore; map: Map<string, SkillCandidateRecord> } {
  const map = new Map<string, SkillCandidateRecord>();
  return {
    map,
    store: {
      get: (key) => map.get(key) ?? null,
      all: () => Array.from(map.values()),
      put: (record) => {
        map.set(record.key, record);
        return true;
      },
    },
  };
}

/** A well-formed, eligible reusable-workflow payload. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eligible: true,
    category: "reusable-workflow",
    skill: {
      key: "audit-a-failing-build",
      name: "Audit a failing build",
      description: "Use when the build is red and the cause is unclear.",
      trigger: "The build is red and the failing step is not obvious in the log.",
      insufficientWhy: "A single test cannot cover the many build failure modes.",
      externalWorkflow: false,
      externalWorkflowName: "",
      body: "# Audit a failing build\n\n## When to use\n- Build red\n\n## Procedure\n1. Run the build.",
    },
    additional: [{ name: "Rotate credentials", description: "Only if a key leaked." }],
    ...overrides,
  };
}

function makeManager(overrides: Partial<SkillSuggestionDeps> = {}): {
  manager: SkillSuggestionManager;
  created: Array<Record<string, unknown>>;
  markOrigin: ReturnType<typeof vi.fn>;
  map: Map<string, SkillCandidateRecord>;
} {
  const created: Array<Record<string, unknown>> = [];
  const markOrigin = vi.fn();
  const mem = memStore();
  const config = makeConfig(ROOT, { skillSuggestions: true });
  const manager = new SkillSuggestionManager({
    config,
    candidateStore: mem.store,
    getTranscript: () => [{ type: "text", text: "Ran the build, fixed the config, re-ran." }],
    createTask: (input) => {
      const id = `05${String(created.length).padStart(2, "0")}`;
      created.push(input as unknown as Record<string, unknown>);
      return { id, ...input } as unknown as Task;
    },
    markOrigin,
    analyze: async () => ({ ok: true, output: JSON.stringify(payload()) }),
    ...overrides,
  });
  return { manager, created, markOrigin, map: mem.map };
}

describe("FileSkillCandidateStore", () => {
  function record(key: string): SkillCandidateRecord {
    return {
      key,
      canonicalKey: key,
      aliases: [],
      name: key,
      description: "",
      body: "body",
      trigger: "trigger",
      insufficientRationale: "why",
      externalWorkflow: false,
      externalWorkflowName: "",
      sourceTaskIds: ["0405"],
      additional: [],
      firstSeenAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
  }

  it("round-trips every record and leaves well-formed JSON on disk", () => {
    const file = join(ROOT, "store-under-test", "skill-candidates.json");
    const store = new FileSkillCandidateStore(file);
    expect(store.put(record("a"))).toBe(true);
    expect(store.put(record("b"))).toBe(true);
    expect(
      store
        .all()
        .map((r) => r.key)
        .sort(),
    ).toEqual(["a", "b"]);
    expect(store.get("a")?.name).toBe("a");
    expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
  });
});

describe("parseSkillSuggestion", () => {
  it("parses an eligible draft plus additional candidates", () => {
    const parsed = parseSkillSuggestion(JSON.stringify(payload()));
    expect(parsed.eligible).toBe(true);
    expect(parsed.category).toBe("reusable-workflow");
    expect(parsed.skill?.key).toBe("audit-a-failing-build");
    expect(parsed.skill?.trigger).toContain("build is red");
    expect(parsed.additional).toEqual([
      { name: "Rotate credentials", description: "Only if a key leaked." },
    ]);
  });

  it("tolerates a fenced JSON answer with surrounding prose", () => {
    const raw = `Here you go:\n\`\`\`json\n${JSON.stringify(payload())}\n\`\`\``;
    expect(parseSkillSuggestion(raw).skill?.name).toBe("Audit a failing build");
  });

  it("defaults to ineligible for malformed output", () => {
    const parsed = parseSkillSuggestion("not json at all");
    expect(parsed.eligible).toBe(false);
    expect(parsed.category).toBe("ambiguous");
    expect(parsed.skill).toBeNull();
  });

  it("rejects a skill with no body", () => {
    const parsed = parseSkillSuggestion('{"eligible": true, "skill": {"name": "X", "body": ""}}');
    expect(parsed.skill).toBeNull();
  });

  it("only allows the reusable/external categories", () => {
    for (const category of [
      "one-off-edit",
      "task-checklist",
      "test-idea",
      "local-convention",
      "review-feedback",
      "unverified",
    ]) {
      expect(parseSkillSuggestion(JSON.stringify(payload({ category }))).category).toBe(category);
    }
  });
});

describe("validateSkillDraft", () => {
  const base: SkillDraft = {
    key: "k",
    name: "N",
    description: "d",
    trigger: "t",
    insufficientRationale: "w",
    externalWorkflow: false,
    externalWorkflowName: "",
    body: "body",
  };

  it("accepts a complete draft", () => {
    expect(validateSkillDraft(base).ok).toBe(true);
  });

  it("requires a stable key, a trigger, and the why-not-test rationale", () => {
    expect(validateSkillDraft({ ...base, key: "" }).ok).toBe(false);
    expect(validateSkillDraft({ ...base, trigger: "" }).ok).toBe(false);
    expect(validateSkillDraft({ ...base, insufficientRationale: "" }).ok).toBe(false);
  });

  it("requires an external workflow to be named", () => {
    expect(validateSkillDraft({ ...base, externalWorkflow: true }).ok).toBe(false);
    expect(
      validateSkillDraft({ ...base, externalWorkflow: true, externalWorkflowName: "gh api" }).ok,
    ).toBe(true);
  });
});

describe("draft rendering", () => {
  it("slugifies names for skills/<slug>/SKILL.md", () => {
    expect(skillSlug("Audit a Failing Build!")).toBe("audit-a-failing-build");
    expect(skillSlug("")).toBe("skill-suggestion");
  });

  it("states the evidence: source tasks, trigger, and why a test is insufficient", () => {
    const record: SkillCandidateRecord = {
      key: "audit-a-failing-build",
      canonicalKey: "audit-a-failing-build",
      aliases: [],
      name: "Audit a failing build",
      description: "Use when the build is red.",
      body: "# Audit a failing build\n\n## Procedure\n1. Run the build.",
      trigger: "The build is red.",
      insufficientRationale: "A single test cannot cover every build failure mode.",
      externalWorkflow: false,
      externalWorkflowName: "",
      sourceTaskIds: ["0410", "0431"],
      additional: [{ name: "Rotate credentials", description: "Only if a key leaked." }],
      firstSeenAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const body = buildSuggestionTaskBody(makeTask(), record);
    expect(body).toContain("## Evidence");
    expect(body).toContain("#0410, #0431");
    expect(body).toContain("The build is red.");
    expect(body).toContain("A single test cannot cover every build failure mode.");
    expect(body).toContain("skills/audit-a-failing-build/SKILL.md");
    expect(body).toContain("Rotate credentials");
  });

  it("names a stable external workflow in the evidence", () => {
    const record: SkillCandidateRecord = {
      key: "gh-api",
      canonicalKey: "gh-api",
      aliases: [],
      name: "Create a PR via gh",
      description: "Use gh to open a PR.",
      body: "body",
      trigger: "A branch is ready to review.",
      insufficientRationale: "The exact gh invocation is easy to get wrong.",
      externalWorkflow: true,
      externalWorkflowName: "GitHub CLI (gh)",
      sourceTaskIds: ["0405"],
      additional: [],
      firstSeenAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(buildSuggestionTaskBody(makeTask(), record)).toContain(
      "Stable external workflow:** GitHub CLI (gh)",
    );
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

describe("SkillSuggestionManager lifecycle", () => {
  it("is disabled by default (off unless explicitly enabled)", () => {
    const { manager } = makeManager({ config: makeConfig(ROOT, { skillSuggestions: undefined }) });
    expect(manager.enabled()).toBe(false);
  });

  it("creates nothing when the setting is off", async () => {
    const { manager, created, map } = makeManager({
      config: makeConfig(ROOT, { skillSuggestions: false }),
    });
    const result = await manager.run(makeTask());
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it("does not run on the review transition", async () => {
    const { manager, created, map, markOrigin } = makeManager();
    const result = await manager.run(makeTask("0405", "review"));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("task has not reached done");
    expect(created).toHaveLength(0);
    expect(map.size).toBe(0);
    expect(markOrigin).not.toHaveBeenCalled();
  });
});

describe("SkillSuggestionManager corroboration", () => {
  it("persists a first candidate without creating a task", async () => {
    const { manager, created, map, markOrigin } = makeManager();
    const result = await manager.run(makeTask("0405", "done"));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("awaiting corroboration");
    expect(result.candidateKey).toBe("audit-a-failing-build");
    expect(created).toHaveLength(0);
    expect(markOrigin).not.toHaveBeenCalled();
    expect(map.get("audit-a-failing-build")?.sourceTaskIds).toEqual(["0405"]);
  });

  it("creates exactly one task once a second independent session corroborates", async () => {
    const { manager, created, map, markOrigin } = makeManager();
    await manager.run(makeTask("0405", "done"));
    const second = await manager.run(makeTask("0431", "done"));

    expect(second.ok).toBe(true);
    expect(second.suggestionId).toBe("0500");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "New Skill Suggestion: Audit a failing build",
      type: "spec",
      status: "inbox",
      assignedTo: "human",
    });
    expect(String(created[0].body)).toContain("#0405, #0431");
    expect(markOrigin).toHaveBeenCalledWith(expect.objectContaining({ id: "0431" }), "0500");
    expect(map.get("audit-a-failing-build")?.suggestedTaskId).toBe("0500");
  });

  it("creates at most one suggestion when two sessions finish concurrently", async () => {
    const { manager, created } = makeManager();
    const results = await Promise.all([
      manager.run(makeTask("0405", "done")),
      manager.run(makeTask("0431", "done")),
    ]);
    expect(created).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    // The first of the two serialized writes is the persisted candidate; only
    // the second sees it and creates the (single) suggestion.
    expect(results.filter((r) => r.reason === "awaiting corroboration")).toHaveLength(1);
  });

  it("does not treat the same session run twice as corroboration", async () => {
    const { manager, created } = makeManager();
    await manager.run(makeTask("0405", "done"));
    const again = await manager.run(makeTask("0405", "done"));
    expect(again.ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("never creates a second task for an already-suggested candidate", async () => {
    const { manager, created } = makeManager();
    await manager.run(makeTask("0405", "done"));
    await manager.run(makeTask("0431", "done"));
    const third = await manager.run(makeTask("0444", "done"));
    expect(third.ok).toBe(false);
    expect(third.reason).toBe("already suggested");
    expect(created).toHaveLength(1);
  });

  it("never creates a task from a single session, even for a named external workflow", async () => {
    const external = payload({
      category: "external-workflow",
      skill: {
        key: "open-pr-with-gh",
        name: "Open a PR with the GitHub CLI",
        description: "Use gh to open a pull request.",
        trigger: "A feature branch is ready for review.",
        insufficientWhy: "The exact gh flags are easy to get wrong and are not covered by a test.",
        externalWorkflow: true,
        externalWorkflowName: "GitHub CLI (gh)",
        body: "# Open a PR with gh\n\n1. `gh pr create`.",
      },
    });
    const { manager, created, map } = makeManager({
      analyze: async () => ({ ok: true, output: JSON.stringify(external) }),
    });
    const result = await manager.run(makeTask("0405", "done"));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("awaiting corroboration");
    expect(created).toHaveLength(0);
    expect([...map.values()][0]?.externalWorkflowName).toBe("GitHub CLI (gh)");
  });

  it("still corroborates a named external workflow from two sessions", async () => {
    const external = payload({
      category: "external-workflow",
      skill: {
        key: "open-pr-with-gh",
        name: "Open a PR with the GitHub CLI",
        description: "Use gh to open a pull request.",
        trigger: "A feature branch is ready for review.",
        insufficientWhy: "The exact gh flags are easy to get wrong and are not covered by a test.",
        externalWorkflow: true,
        externalWorkflowName: "GitHub CLI (gh)",
        body: "# Open a PR with gh\n\n1. `gh pr create`.",
      },
    });
    const { manager, created } = makeManager({
      analyze: async () => ({ ok: true, output: JSON.stringify(external) }),
    });
    await manager.run(makeTask("0405", "done"));
    const second = await manager.run(makeTask("0431", "done"));
    expect(second.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(String(created[0].body)).toContain("GitHub CLI (gh)");
  });

  it("corroborates across sessions even when the model drifts the key/name", async () => {
    let call = 0;
    const { manager, created } = makeManager({
      analyze: async () => {
        call += 1;
        const name = call === 1 ? "Audit failing build" : "Audit a failing build";
        const key = call === 1 ? "audit-failing-build" : "audit-a-failing-build";
        return {
          ok: true,
          output: JSON.stringify(
            payload({
              skill: { ...(payload().skill as Record<string, unknown>), key, name },
            }),
          ),
        };
      },
    });
    const first = await manager.run(makeTask("0405", "done"));
    expect(first.ok).toBe(false);
    const second = await manager.run(makeTask("0431", "done"));
    expect(second.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(String(created[0].body)).toContain("#0405, #0431");
  });

  it("creates nothing when a suggestion already exists for the task", async () => {
    const { manager, created } = makeManager();
    const result = await manager.run(makeTask("0405", "done", { [SKILL_SUGGESTION_KEY]: "0500" }));
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("SkillSuggestionManager evidence gate", () => {
  it.each([
    "one-off-edit",
    "task-checklist",
    "test-idea",
    "local-convention",
    "review-feedback",
    "unverified",
  ])("rejects the %s category without persisting a candidate", async (category) => {
    const { manager, created, map } = makeManager({
      analyze: async () => ({ ok: true, output: JSON.stringify(payload({ category })) }),
    });
    const result = await manager.run(makeTask("0405", "done"));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(category);
    expect(created).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it("rejects when the analysis is not affirmative", async () => {
    const { manager, created, map } = makeManager({
      analyze: async () => ({
        ok: true,
        output: JSON.stringify(payload({ eligible: false, category: "ambiguous", skill: null })),
      }),
    });
    const result = await manager.run(makeTask("0405", "done"));
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it("rejects a draft missing its evidence rationale", async () => {
    const p = payload();
    (p.skill as Record<string, unknown>).insufficientWhy = "";
    const { manager, created, map } = makeManager({
      analyze: async () => ({ ok: true, output: JSON.stringify(p) }),
    });
    const result = await manager.run(makeTask("0405", "done"));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("insufficient");
    expect(created).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it("creates nothing when the task has no transcript", async () => {
    const { manager, created } = makeManager({ getTranscript: () => [] });
    const result = await manager.run(makeTask("0405", "done"));
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });

  it("does not throw when the analysis run fails", async () => {
    const { manager, created } = makeManager({
      analyze: async () => ({ ok: false, error: "boom" }),
    });
    const result = await manager.run(makeTask("0405", "done"));
    expect(result.ok).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("buildSkillSuggestionMission", () => {
  it("includes the task id, spec, transcript, JSON contract, and the quality bar", () => {
    const mission = buildSkillSuggestionMission(makeTask(), "ran the build");
    expect(mission).toContain("Task #0405");
    expect(mission).toContain("Do a multi-step thing.");
    expect(mission).toContain("ran the build");
    expect(mission).toContain('"eligible"');
    expect(mission).toContain("NOT skills");
    expect(mission).toContain("externalWorkflowName");
  });
});
