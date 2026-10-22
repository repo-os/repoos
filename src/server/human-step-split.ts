/**
 * Split mixed `[human]` / `[ai]` acceptance criteria into a held human task
 * (#0909).
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  buildHumanTaskBody,
  hasAiTaggedCriteria,
  hasHumanTaggedCriteria,
  removeHumanTaggedCriteria,
} from "../core/human-step-tags.js";
import { createRepoOS } from "../core/repoos.js";
import { patchTaskFile } from "./write.js";
import { flagTaskSpecFlagsIfNeededAsync } from "./task-underspecified-flag.js";

export class HumanStepSplitError extends Error {}

export interface HumanStepSplitResult {
  source: Task;
  humanTask: Task;
}

/**
 * Create a held human task with the `[human]` criteria, strip them from the
 * source task, and re-run spec flags so the AI task can start.
 */
export function splitHumanStepTask(
  config: RepoOSConfig,
  source: Task,
  actor: string,
): Promise<HumanStepSplitResult> {
  if (!hasHumanTaggedCriteria(source.body) || !hasAiTaggedCriteria(source.body)) {
    throw new HumanStepSplitError(
      "Split needs both [human] and [ai] acceptance criteria — tag each line or use repoos update to add them",
    );
  }
  const { body: nextBody, moved } = removeHumanTaggedCriteria(source.body);
  if (moved.length === 0) {
    throw new HumanStepSplitError("No [human] criteria found to move");
  }
  const repoos = createRepoOS(config.root);
  const humanTask = repoos.createTask({
    title: `Human verification for #${source.id}`,
    body: buildHumanTaskBody({
      sourceId: source.id,
      sourceTitle: source.title,
      moved,
    }),
    status: "ready",
    assignedTo: "human",
    hold: true,
    dependsOn: [source.id],
    createdBy: actor,
  });
  repoos.commitNewFile(
    humanTask.absPath,
    `docs(${humanTask.id}): split human steps from #${source.id}`,
  );
  const patched = patchTaskFile(config, source.absPath, { body: nextBody }, { actor });
  return flagTaskSpecFlagsIfNeededAsync(config, patched).then((flagged) => ({
    source: flagged ?? patched,
    humanTask,
  }));
}
