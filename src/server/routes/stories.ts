/**
 * Story definition routes (#0486): PM-assisted create under `stories/`.
 */
import type { RouteHandler } from "./types.js";
import type { Agent } from "../../core/types.js";
import { json, readBody } from "./utils.js";
import { join } from "node:path";
import { resolvePmAgent, mergeAgentOverride } from "../agents.js";
import { agentsForConfig } from "../../core/config.js";
import { getCurrentUser } from "./auth.js";
import { commitTaskFile } from "../../core/git.js";
import { normalizeStoryName } from "../../core/stories.js";
import {
  fallbackStoryName,
  listStoryDefinitions,
  writeStoryDefinition,
} from "../../core/story-definition-files.js";
import { fleshOutStory } from "../story-pm.js";

function pmWithOverrides(base: Agent, body: Record<string, unknown>): Agent {
  const cli =
    typeof body?.cliOverride === "string" && body.cliOverride ? body.cliOverride : undefined;
  const model =
    typeof body?.modelOverride === "string" && body.modelOverride ? body.modelOverride : undefined;
  return mergeAgentOverride(base, cli, model);
}

function storiesFeatureEnabled(config: { stories?: { enabled?: boolean } }): boolean {
  return config.stories?.enabled === true;
}

export const getStoryDefinitions: RouteHandler = (ctx, _req, res) => {
  if (!storiesFeatureEnabled(ctx.config)) {
    return json(res, 404, { error: "stories are not enabled" });
  }
  return json(res, 200, listStoryDefinitions(ctx.config));
};

/**
 * Create a story from a freeform description. The placeholder definition is
 * written and committed immediately — so `stories/` never leaves `main` dirty
 * and the pane can acknowledge right away — and the PM agent fleshes it out in
 * the background (`fleshOutStory`), mirroring the freeform New task flow.
 */
export const createFreeformStory: RouteHandler = async (ctx, req, res) => {
  const { config, emitEvent } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { ok: false, reason: "stories are not enabled" });
  }
  const body = (await readBody(req)) as Record<string, unknown>;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return json(res, 400, { ok: false, reason: "description is required" });
  }
  const humanName = normalizeStoryName(typeof body?.name === "string" ? body.name : "");
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;
  const createdBy = getCurrentUser(req, config)?.email;

  const pmBase =
    typeof body?.agentOverride === "string" && body.agentOverride
      ? (agentsForConfig(config).find((a) => a.enabled && a.name === body.agentOverride) ?? null)
      : resolvePmAgent(config);
  const pm = pmBase ? pmWithOverrides(pmBase, body) : null;

  let definition;
  try {
    definition = writeStoryDefinition(config, {
      name: humanName || fallbackStoryName(description),
      body: description,
      createdBy,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("already exists") ? 409 : 400;
    return json(res, status, { ok: false, reason: message });
  }
  commitTaskFile(
    config.root,
    join(config.root, definition.path),
    `docs(stories): add "${definition.name}"`,
  );
  emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });

  if (pm) {
    void fleshOutStory(ctx, { path: definition.path, humanName, description, pm, runId });
  }
  return json(res, 201, { ok: true, pending: pm !== null, definition });
};
