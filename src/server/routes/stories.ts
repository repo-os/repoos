/**
 * Story definition routes (#0486): PM-assisted create under `stories/`.
 */
import type { RouteHandler } from "./types.js";
import type { Agent } from "../../core/types.js";
import { json, readBody } from "./utils.js";
import { resolvePmAgent, runPrompt, recordOneShotSession, mergeAgentOverride } from "../agents.js";
import { agentsForConfig } from "../../core/config.js";
import { getCurrentUser } from "./auth.js";
import {
  createFreeformStoryDefinition,
  listStoryDefinitions,
  parseGeneratedStoryDefinition,
  storyFreeformPrompt,
} from "../../core/story-definition-files.js";

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
  const name = typeof body?.name === "string" ? body.name : "";
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;
  const createdBy = getCurrentUser(req, config)?.email;

  const pmBase =
    typeof body?.agentOverride === "string" && body.agentOverride
      ? (agentsForConfig(config).find((a) => a.enabled && a.name === body.agentOverride) ?? null)
      : resolvePmAgent(config);
  const pm = pmBase ? pmWithOverrides(pmBase, body) : null;

  try {
    const result = await createFreeformStoryDefinition(config, {
      name,
      description,
      createdBy,
      generator: pm
        ? async ({ name: humanName, description: desc }) => {
            const promptResult = await runPrompt(pm, storyFreeformPrompt(humanName, desc), {
              cwd: config.root,
              onLine: runId
                ? (line) => {
                    emitEvent({
                      type: "agent.output",
                      id: runId,
                      entry: { s: "out", d: line },
                      stream: "out",
                      at: new Date().toISOString(),
                    });
                  }
                : undefined,
            });
            recordOneShotSession(config.root, pm, promptResult, {
              sessionType: "pm",
              taskId: null,
            });
            if (!promptResult.ok || !promptResult.output) {
              throw new Error(promptResult.error ?? "the PM agent returned no usable output");
            }
            return parseGeneratedStoryDefinition(promptResult.output, humanName, desc);
          }
        : undefined,
    });

    emitEvent({
      type: "story.definitionsChanged",
      at: new Date().toISOString(),
    });

    return json(res, 201, {
      ok: true,
      fallback: result.fallback,
      pmError: result.pmError,
      definition: result.definition,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("already exists") ? 409 : 400;
    return json(res, status, { ok: false, reason: message });
  }
};
