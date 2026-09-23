/**
 * Background PM flesh-out for a New story: the placeholder is replaced with
 * the generated story (from the CLI's final text event, not raw JSONL), the
 * file is renamed to match, and the existing tasks the PM picked are tagged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import {
  isStoryPmWorking,
  listStoryDefinitions,
  writeStoryDefinition,
} from "../../core/story-definition-files";

vi.mock("../../server/agents.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/agents.js")>()),
  runPrompt: vi.fn(),
  recordOneShotSession: vi.fn(),
}));

import { runPrompt } from "../../server/agents.js";
import { fleshOutStory } from "../../server/story-pm";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  vi.mocked(runPrompt).mockReset();
});

function setup(): { cfg: RepoOSConfig; index: never; tasks: Map<string, Task> } {
  const root = mkdtempSync(join(tmpdir(), "repoos-story-pm-"));
  dirs.push(root);
  const cfg: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    stories: { enabled: true },
  };
  mkdirSync(join(root, "work"), { recursive: true });
  const tasks = new Map<string, Task>();
  const load = (abs: string): void => {
    const t = parseTask({
      content: readFileSync(abs, "utf8"),
      absPath: abs,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    tasks.set(t.id, t);
  };
  for (const [id, story] of [
    ["0001", ""],
    ["0002", ""],
    ["0003", "Other slice"],
  ]) {
    const abs = join(root, "work", `${id}-fixture.md`);
    writeFileSync(
      abs,
      `---\nid: "${id}"\ntitle: Task ${id}\ntype: feature\nstatus: done\n${story ? `story: ${story}\n` : ""}---\nBody\n`,
    );
    load(abs);
  }
  const index = {
    getTasks: () => [...tasks.values()],
    getTask: (id: string) => tasks.get(id) ?? null,
    applyFileChange: (abs: string) => load(abs),
  };
  return { cfg, index: index as never, tasks };
}

const pm = { name: "pm", cli: "claude code", model: "x", enabled: true } as unknown as Agent;

describe("fleshOutStory", () => {
  it("rewrites the placeholder from the final text event and tags picked tasks", async () => {
    const { cfg, index, tasks } = setup();
    const placeholder = writeStoryDefinition(cfg, {
      name: "I want to create a story for native mobile…",
      body: "I want to create a story for native mobile, add related tasks.",
      createdBy: "hello@repoos.org",
    });
    const story = '---\nname: Native mobile app\ntasks: ["0001", "0003", "9999"]\n---\n\nScope.';
    // Claude stream-json: narration, then the final assistant text, then result.
    const jsonl = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Let me look." }] },
      }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: story }] } }),
      JSON.stringify({ type: "result", subtype: "success", result: story }),
    ].join("\n");
    let sawWorking = false;
    vi.mocked(runPrompt).mockImplementation(async () => {
      sawWorking = isStoryPmWorking(placeholder.path);
      return { ok: true, output: jsonl };
    });
    const events: { type: string }[] = [];

    await fleshOutStory(
      {
        config: cfg,
        index,
        logger: { task() {}, system() {} } as never,
        emitEvent: (e) => events.push(e),
      },
      { path: placeholder.path, humanName: "", description: "desc", pm, runId: null },
    );

    expect(sawWorking).toBe(true);
    const defs = listStoryDefinitions(cfg);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("Native mobile app");
    expect(defs[0].path).toBe("stories/native-mobile-app.md");
    expect(defs[0].createdBy).toBe("hello@repoos.org");
    expect(existsSync(join(cfg.root, placeholder.path))).toBe(false);
    expect(isStoryPmWorking(defs[0].path)).toBe(false);
    // 0001 was untagged → tagged; 0003 already had a story; 9999 doesn't exist.
    expect(tasks.get("0001")?.story).toBe("Native mobile app");
    expect(tasks.get("0002")?.story ?? "").toBe("");
    expect(tasks.get("0003")?.story).toBe("Other slice");
    const finished = events.find((e) => e.type === "story.pmFinished") as unknown as {
      ok: boolean;
      taggedTaskIds: string[];
    };
    expect(finished.ok).toBe(true);
    expect(finished.taggedTaskIds).toEqual(["0001"]);
  });

  it("keeps the placeholder and reports the reason when the PM fails", async () => {
    const { cfg, index } = setup();
    const placeholder = writeStoryDefinition(cfg, {
      name: "Onboarding tour",
      body: "Build it.",
      createdBy: "a",
    });
    vi.mocked(runPrompt).mockResolvedValue({ ok: false, error: "usage limit" });
    const events: { type: string; reason?: string }[] = [];

    await fleshOutStory(
      {
        config: cfg,
        index,
        logger: { task() {}, system() {} } as never,
        emitEvent: (e) => events.push(e as never),
      },
      {
        path: placeholder.path,
        humanName: "Onboarding tour",
        description: "Build it.",
        pm,
        runId: null,
      },
    );

    expect(listStoryDefinitions(cfg)[0].name).toBe("Onboarding tour");
    expect(isStoryPmWorking(placeholder.path)).toBe(false);
    expect(events.find((e) => e.type === "story.pmFinished")?.reason).toBe("usage limit");
  });
});
