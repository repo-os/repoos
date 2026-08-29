/**
 * Document routes: manual create + PM-agent-backed freeform create.
 */
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { resolvePmAgent, runPrompt, recordOneShotSession } from "../agents.js";
import {
  createDocument,
  createFreeformDocument,
  createSkill,
  createFreeformSkill,
  docFreeformPrompt,
  skillFreeformPrompt,
  parseGeneratedDocument,
} from "../../core/docs.js";

export const createDoc: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const content = body.content;
  if (typeof content !== "string") {
    return json(res, 400, { error: "content is required" });
  }
  try {
    const result = createDocument(config, {
      path: body.path as string,
      content,
    });
    return json(res, 201, { ok: true, path: result.path });
  } catch (err) {
    return json(res, 400, { error: (err as Error).message });
  }
};

export const createSkillRoute: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return json(res, 400, { error: "name is required" });
  }
  try {
    const result = createSkill(config, {
      name,
      description: typeof body.description === "string" ? body.description : "",
      body: typeof body.body === "string" ? body.body : "",
      content: typeof body.content === "string" ? body.content : undefined,
    });
    return json(res, 201, { ok: true, path: result.path });
  } catch (err) {
    return json(res, 400, { error: (err as Error).message });
  }
};

export const createFreeformSkillRoute: RouteHandler = async (ctx, req, res) => {
  const { config, emitEvent } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return json(res, 400, { ok: false, reason: "description is required" });
  }
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;

  const pm = resolvePmAgent(config);
  if (!pm) {
    return json(res, 400, { ok: false, reason: "No PM agent is configured" });
  }

  try {
    const skillResult = await createFreeformSkill(config, description, async (desc) => {
      const result = await runPrompt(pm, skillFreeformPrompt(desc), {
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
      recordOneShotSession(config.root, pm, result, { sessionType: "pm", taskId: null });
      if (!result.ok || !result.output) {
        throw new Error(result.error ?? "the PM agent returned no usable output");
      }
      return parseGeneratedDocument(result.output);
    });
    return json(res, 201, { ok: true, path: skillResult.path });
  } catch (err) {
    return json(res, 400, { ok: false, reason: (err as Error).message });
  }
};

export const createFreeformDoc: RouteHandler = async (ctx, req, res) => {
  const { config, emitEvent } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return json(res, 400, { ok: false, reason: "description is required" });
  }
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;

  const pm = resolvePmAgent(config);
  if (!pm) {
    return json(res, 400, { ok: false, reason: "No PM agent is configured" });
  }

  try {
    const docResult = await createFreeformDocument(config, description, async (desc) => {
      const result = await runPrompt(pm, docFreeformPrompt(desc), {
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
      // Freeform doc authoring is real PM spend that belongs to no task (0311).
      recordOneShotSession(config.root, pm, result, { sessionType: "pm", taskId: null });
      if (!result.ok || !result.output) {
        throw new Error(result.error ?? "the PM agent returned no usable output");
      }
      return parseGeneratedDocument(result.output);
    });
    return json(res, 201, { ok: true, path: docResult.path });
  } catch (err) {
    return json(res, 400, { ok: false, reason: (err as Error).message });
  }
};
