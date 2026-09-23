/**
 * Background PM flesh-out for a freeform story (#0486 follow-up).
 *
 * The New story route writes (and commits) a placeholder definition straight
 * away and returns, so the human is never stuck on the pane. This module then
 * runs the PM agent, swaps the placeholder for the generated name + body, and
 * tags any existing tasks the PM judged part of the story — mirroring the
 * freeform-task flow, where the draft exists first and is promoted later.
 *
 * Which stories are mid-flesh-out is held in memory only: a server reload
 * drops the run (the placeholder stays, exactly what a failed run leaves), and
 * the "PM is working" indicator clears with it rather than sticking forever.
 */
import { join } from "node:path";
import type { Agent, RepoOSConfig } from "../core/types.js";
import type { RepoEvent, LiveIndex } from "./live-index.js";
import type { Logger } from "../core/logger.js";
import { commitFiles } from "../core/git.js";
import { normalizeStoryName } from "../core/stories.js";
import {
  setStoryPmWorking,
  parseGeneratedStoryDefinition,
  rewriteStoryDefinition,
  storyFreeformPrompt,
} from "../core/story-definition-files.js";
import {
  extractOneShotReportText,
  parseOneShotLine,
  recordOneShotSession,
  runPrompt,
} from "./agents.js";
import { patchTaskFile } from "./write.js";

export interface StoryPmDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  logger: Logger;
  emitEvent: (e: RepoEvent) => void;
}

export interface StoryPmRun {
  /** The placeholder definition's repo-relative path. */
  path: string;
  /** The name the human typed ("" when they left it to the PM). */
  humanName: string;
  description: string;
  pm: Agent;
  /** Tags this run's streamed `agent.output` events for the New story pane. */
  runId: string | null;
}

export async function fleshOutStory(deps: StoryPmDeps, run: StoryPmRun): Promise<void> {
  const { config, index, logger, emitEvent } = deps;
  const { pm } = run;
  let path = run.path;
  setStoryPmWorking(path, true);
  emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });

  let name = "";
  const tagged: string[] = [];
  let reason: string | null = null;
  try {
    const candidates = index
      .getTasks()
      .filter((t) => !normalizeStoryName(t.story) && t.status !== "draft")
      .map((t) => ({ id: t.id, title: t.title, status: t.status }));
    const result = await runPrompt(
      pm,
      storyFreeformPrompt(run.humanName, run.description, candidates),
      {
        cwd: config.root,
        onLine: run.runId
          ? (line) => {
              // Parse structured JSONL like the task flow does, so the pane
              // shows the agent's narration rather than raw event JSON.
              const entry = parseOneShotLine(pm.cli, line);
              if (!entry) return;
              emitEvent({
                type: "agent.output",
                id: run.runId!,
                entry,
                stream: "out",
                at: new Date().toISOString(),
              });
            }
          : undefined,
      },
    );
    recordOneShotSession(config.root, pm, result, { sessionType: "pm", taskId: null });

    // Structured CLIs (cursor, claude, codex, …) stream JSONL; the story is the
    // final text event, not the raw stdout.
    const output = result.ok ? extractOneShotReportText(pm.cli, result.output ?? "") : "";
    if (!result.ok || !output) {
      reason = result.error ?? "the PM agent returned no usable output";
    } else {
      const parsed = parseGeneratedStoryDefinition(output, run.humanName, run.description);
      if (!parsed.hadFrontmatter) {
        reason = "the PM agent did not return a valid story definition";
      } else {
        const { definition, previousPath } = rewriteStoryDefinition(config, path, parsed);
        setStoryPmWorking(path, false);
        path = definition.path;
        name = definition.name;
        commitFiles(
          config.root,
          [definition.path, previousPath].filter(Boolean).map((p) => join(config.root, p!)),
          `docs(stories): flesh out "${definition.name}"`,
        );

        const eligible = new Set(candidates.map((c) => c.id));
        for (const id of parsed.taskIds) {
          const task = eligible.has(id) ? index.getTask(id) : null;
          // Re-check at write time: never retag a task someone tagged meanwhile.
          if (!task || normalizeStoryName(task.story)) continue;
          try {
            const updated = patchTaskFile(config, task.absPath, { story: definition.name });
            await index.applyFileChange(updated.absPath);
            tagged.push(id);
          } catch (err) {
            logger.task(id, "warn", "Could not tag task with story", {
              story: definition.name,
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  } finally {
    setStoryPmWorking(path, false);
    if (reason) {
      logger.system("warn", "PM story flesh-out failed; keeping the story as written", {
        path,
        reason,
      });
    }
    emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });
    emitEvent({
      type: "story.pmFinished",
      path,
      name,
      ok: reason === null,
      reason: reason ?? undefined,
      taggedTaskIds: tagged,
      at: new Date().toISOString(),
    });
  }
}
