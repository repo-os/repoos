import { join } from "node:path";
import type { RouteContext, RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  createInput,
  enrichInput,
  listInputs,
  readInputAttachment,
  resolveInput,
  saveInputAttachment,
  updateInput,
  type Input,
  type InputResolution,
  type InputStatus,
} from "../../core/input.js";
import { commitTaskFile } from "../../core/git.js";
import { removeInputAttachments } from "../../core/input.js";
import { deleteInputFile, PathGuardError, WriteError } from "../write.js";
import type { Agent } from "../../core/types.js";
import {
  extractOneShotReportText,
  resolvePmAgent,
  runPrompt,
  recordOneShotSession,
} from "../agents.js";
import { getCurrentUser } from "./auth.js";

/**
 * Commit an input's markdown file to `main`, the same fail-soft way task
 * files are committed (`commitTaskFile` just commits one path). Only the
 * `.md` — attachments under `inputs/.attachments/` are gitignored and served
 * from disk, never committed.
 */
function commitInput(root: string, input: Input, verb: string): void {
  commitTaskFile(root, join(root, input.path), `inputs(${input.id}): ${verb}`);
}

/** Inputs whose PM enrichment is still running (#0631 reconnect reconcile). */
const enrichingInputIds = new Set<string>();

function inputPrompt(body: string): string {
  return [
    "You are the RepoOS PM agent. Classify this raw human input for triage.",
    "Return ONLY a JSON object with exactly these string fields:",
    '{"title":"short useful title","type":"idea|question|bug|improvement|feedback|other","area":"short product area or empty string"}',
    "Keep the title under 80 characters. Do not invent details.",
    "",
    body,
  ].join("\n");
}
/**
 * Pull the PM's enrichment fields out of its reply (#0628). The reply may be
 * wrapped in prose, or — before this fix — arrive as raw stream-json, where a
 * single greedy `/\{[\s\S]*\}/` span across JSONL event lines never parses.
 * Scan every flat `{...}` candidate non-greedily, then fall back to the greedy
 * span (an object with braces inside a string value), and take the first that
 * parses with at least one known field. Returns {} when nothing parseable is
 * found; callers log that rather than dropping enrichment silently.
 */
export function parseEnrichment(raw: string): { title?: string; type?: string; area?: string } {
  const candidates = [...(raw.match(/\{[^{}]*\}/g) ?? [])];
  const greedy = raw.match(/\{[\s\S]*\}/);
  if (greedy) candidates.push(greedy[0]);
  for (const candidate of candidates) {
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      continue;
    }
    const fields = {
      title: typeof value.title === "string" ? value.title : undefined,
      type: typeof value.type === "string" ? value.type : undefined,
      area: typeof value.area === "string" ? value.area : undefined,
    };
    if (fields.title || fields.type || fields.area) return fields;
  }
  return {};
}
export const getInputs: RouteHandler = (ctx, _req, res) =>
  json(
    res,
    200,
    listInputs(ctx.config).map((input) => ({
      ...input,
      enriching: enrichingInputIds.has(input.id),
    })),
  );
export const postInput: RouteHandler = async (ctx, req, res) => {
  const b = (await readBody(req)) as Record<string, unknown>,
    text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return json(res, 400, { error: "text is required" });
  const input = createInput(
    ctx.config,
    text,
    typeof b.type === "string" ? b.type : "other",
    getCurrentUser(req, ctx.config)?.email ?? (typeof b.createdBy === "string" ? b.createdBy : ""),
  );
  commitInput(ctx.config.root, input, "capture");
  // The PM call takes 15-20s; the create panel already promises "creating in
  // the background", so return the raw input now and enrich asynchronously
  // (#0628) — open views update in place via the `input.enriched` SSE event.
  // The response also carries `enriching` (#0631): whether a PM agent was
  // configured and enrichment actually started. Without it, clients can't
  // tell "spinner until `input.enriched`" from "nothing will ever arrive".
  const pm = resolvePmAgent(ctx.config);
  if (pm) void enrichInputInBackground(ctx, input, pm, text);
  return json(res, 201, { ...input, enriching: pm != null });
};

/**
 * Enrich a freshly created input with the PM agent's title/type/area, off the
 * POST's critical path (#0628). The PM's captured stdout is first reduced to
 * its final report text (`extractOneShotReportText`) — stream-json drivers
 * wrap the answer in JSONL events the old greedy regex could never parse —
 * then parsed, applied, committed, and pushed over SSE. Every terminal
 * outcome — enriched fields applied, nothing parseable, or a failure — emits
 * the same `input.enriched` event, carrying the input the client should now
 * render (unchanged on failure). This is the terminal signal for the
 * inputs-list in-progress state (#0631); failures are additionally logged as
 * warnings so enrichment is never silently dropped, and the input always
 * keeps its raw (first-line) title until real fields arrive.
 */
async function enrichInputInBackground(
  ctx: RouteContext,
  input: Input,
  pm: Agent,
  text: string,
): Promise<void> {
  enrichingInputIds.add(input.id);
  // What the client should render when enrichment ends: the enriched input on
  // success, or the input as it exists on disk when enrichment did not apply
  // (#0631 r4 — re-read so edits during the PM run are not reverted).
  let outcome = input;
  let enrichedApplied = false;
  try {
    const result = await runPrompt(pm, inputPrompt(text), { cwd: ctx.config.root });
    recordOneShotSession(ctx.config.root, pm, result, { sessionType: "pm", taskId: null });
    const report = result.ok ? extractOneShotReportText(pm.cli, result.output ?? "") : "";
    const fields = parseEnrichment(report);
    if (!fields.title && !fields.type && !fields.area) {
      ctx.logger.system("warn", "PM enrichment returned nothing parseable; input keeps raw title", {
        input: input.id,
        cli: pm.cli,
        ...(result.ok ? {} : { error: result.error }),
      });
    } else {
      // Throws "input not found" if the input was deleted while the PM ran —
      // caught below and logged, same as any other failure.
      const enriched = enrichInput(ctx.config, input.id, fields);
      commitInput(ctx.config.root, enriched, "capture");
      outcome = enriched;
      enrichedApplied = true;
    }
  } catch (e) {
    ctx.logger.system("warn", "input enrichment failed; input keeps raw title", {
      input: input.id,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
  if (!enrichedApplied) {
    const current = listInputs(ctx.config).find((i) => i.id === input.id);
    if (current) outcome = current;
  }
  // Terminal event on every path (#0631): the inputs-list pending indicator
  // clears here, not on a client-side timeout. When enrichment did not apply,
  // the payload is the current on-disk input (not the creation-time snapshot).
  ctx.emitEvent({
    type: "input.enriched",
    id: input.id,
    input: outcome,
    at: new Date().toISOString(),
  });
  enrichingInputIds.delete(input.id);
}
export const patchInput: RouteHandler = async (ctx, req, res, p) => {
  const b = (await readBody(req)) as Record<string, unknown>;
  const hasStatus = b.status !== undefined && b.status !== null;
  const text = typeof b.text === "string" ? b.text : undefined;
  const hasText = text !== undefined;
  const title = typeof b.title === "string" ? b.title : undefined;
  const type = typeof b.type === "string" ? b.type : undefined;
  const area = typeof b.area === "string" ? b.area : undefined;
  if (!hasStatus && !hasText && title === undefined && type === undefined && area === undefined)
    return json(res, 400, { error: "status, text, title, type or area is required" });
  if (hasStatus && !["new", "reviewing", "processed"].includes(String(b.status)))
    return json(res, 400, { error: "invalid status" });
  if (hasText && !text.trim()) return json(res, 400, { error: "text is required" });
  if (title !== undefined && !title.trim()) return json(res, 400, { error: "title is required" });
  try {
    const updated = updateInput(ctx.config, p.param1, {
      ...(hasStatus ? { status: b.status as InputStatus } : {}),
      ...(hasText ? { text } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(area !== undefined ? { area } : {}),
    });
    commitInput(
      ctx.config.root,
      updated,
      hasText ? "edit body" : title !== undefined ? "retitle" : updated.status,
    );
    return json(res, 200, updated);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "input not found") return json(res, 404, { error: msg });
    return json(res, 400, { error: msg });
  }
};
export const postResolveInput: RouteHandler = async (ctx, req, res, p) => {
  const b = (await readBody(req)) as Record<string, unknown>;
  const resolution = b.resolution;
  if (resolution !== "task" && resolution !== "none")
    return json(res, 400, { error: "resolution must be 'task' or 'none'" });
  const taskId = typeof b.taskId === "string" ? b.taskId.trim() : "";
  if (resolution === "task" && !taskId)
    return json(res, 400, { error: "taskId is required when resolving to a task" });
  try {
    const updated = resolveInput(
      ctx.config,
      p.param1,
      resolution as InputResolution,
      resolution === "task" ? taskId : "",
    );
    commitInput(
      ctx.config.root,
      updated,
      resolution === "task" ? `resolved to task #${taskId}` : "resolved: no action",
    );
    return json(res, 200, updated);
  } catch (e) {
    return json(res, 404, { error: (e as Error).message });
  }
};
export const uploadInputAttachment: RouteHandler = async (ctx, req, res, p) => {
  const b = (await readBody(req)) as Record<string, unknown>;
  if (typeof b.name !== "string" || typeof b.data !== "string")
    return json(res, 400, { error: "name and data are required" });
  try {
    return json(res, 201, {
      ok: true,
      attachment: saveInputAttachment(ctx.config, p.param1, b.name, b.data),
    });
  } catch (e) {
    return json(res, 404, { error: (e as Error).message });
  }
};
/**
 * Delete an input (#0634): remove its markdown file and its (gitignored,
 * disk-only) attachments, committing the removal when git tracks the file.
 * Mirrors `deleteTask`: 404 when the input is gone, 400 for a path-guard
 * refusal. Safe against an in-flight PM enrichment — `enrichInput` re-reads
 * the input list and throws "input not found", which the enrichment's own
 * catch already logs without crashing.
 */
export const deleteInput: RouteHandler = async (ctx, _req, res, p) => {
  const input = listInputs(ctx.config).find((i) => i.id === p.param1);
  if (!input) return json(res, 404, { error: `input not found: ${p.param1}` });
  try {
    deleteInputFile(ctx.config, join(ctx.config.root, input.path), `inputs(${input.id}): delete`);
  } catch (err) {
    if (err instanceof PathGuardError) return json(res, 400, { error: err.message });
    if (err instanceof WriteError) return json(res, 404, { error: err.message });
    throw err;
  }
  removeInputAttachments(ctx.config, input.id);
  // No SSE event: inputs are not in the live index, so the deleting client
  // refreshes its own list (repo.deleteInput) and other tabs pick the removal
  // up on their next inputs fetch.
  enrichingInputIds.delete(input.id);
  ctx.logger.system("info", `input deleted: ${input.title}`, { input: input.id });
  return json(res, 200, { ok: true });
};

export const getInputAttachment: RouteHandler = (ctx, _req, res, p) => {
  try {
    const file = readInputAttachment(ctx.config, p.param1, decodeURIComponent(p.param2));
    res.writeHead(200, {
      "Content-Type": file.mime,
      "Content-Length": file.data.length,
      "Content-Disposition": `inline; filename="${decodeURIComponent(p.param2)}"`,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(file.data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
};
