/**
 * Story definition routes (#0486): PM-assisted create under `stories/`, plus
 * the story panel's PM chat (#0515) and the verbatim create/update paths agents
 * and scripts use to write a story exactly as given (#0696).
 */
import type { RouteHandler } from "./types.js";
import type { Agent } from "../../core/types.js";
import { json, readBody } from "./utils.js";
import { join } from "node:path";
import {
  isModelOverridePinned,
  mergeAgentOverride,
  resolvePmAgent,
  storyPmPrompt,
} from "../agents.js";
import { agentsForConfig } from "../../core/config.js";
import { getCurrentUser } from "./auth.js";
import { commitTaskFile, commitFiles } from "../../core/git.js";
import { normalizeStoryName, storyKey, storyPmSessionId } from "../../core/stories.js";
import {
  mergeStoriesForDisplay,
  type MergedStoryGroup,
  type StoryDefinition,
} from "../../core/story-display.js";
import {
  fallbackStoryName,
  findStoryDefinitionByKey,
  listStoryDefinitions,
  markStoryPmChat,
  rewriteStoryDefinition,
  setStoryPmWorking,
  writeStoryDefinition,
} from "../../core/story-definition-files.js";
import { deleteStoryFile, PathGuardError, WriteError } from "../write.js";
import { dropPmImages, queuePmImages, type IncomingPmImage } from "../pm-attachments.js";
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
 *
 * `pm: false` (#0696) turns the flesh-out and the task tagging off, leaving the
 * definition exactly as submitted — the same behavior `POST /api/stories`
 * gives unconditionally. The UI keeps `pm` implicitly true so **New story**
 * still gets its PM prose.
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

  const wantPm = body?.pm !== false;
  const pmBase = wantPm
    ? typeof body?.agentOverride === "string" && body.agentOverride
      ? (agentsForConfig(config).find((a) => a.enabled && a.name === body.agentOverride) ?? null)
      : resolvePmAgent(config)
    : null;
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

/**
 * `POST /api/stories` (#0696): write a story definition exactly as given and
 * commit it, without starting the PM flesh-out or tagging any task. This is the
 * deterministic create an agent or script wants — `repoos story new` uses the
 * same core call — and the difference from `/api/stories/freeform` is the whole
 * point: the PM rewrites the body and tags untagged tasks, which is wrong when
 * the caller already knows the finished story.
 *
 * Body: `{ name?, body, createdBy? }`. `body` is required; a `description`
 * field is accepted as an alias so a caller can reuse the freeform payload
 * shape. Name collisions return 409, same as the freeform route.
 */
export const createStoryDefinition: RouteHandler = async (ctx, req, res) => {
  const { config, emitEvent } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { ok: false, reason: "stories are not enabled" });
  }
  const body = (await readBody(req)) as Record<string, unknown>;
  const text =
    typeof body?.body === "string"
      ? body.body
      : typeof body?.description === "string"
        ? body.description
        : "";
  if (!text.trim()) {
    return json(res, 400, { ok: false, reason: "story body is required" });
  }
  const name = normalizeStoryName(typeof body?.name === "string" ? body.name : "");
  const createdBy = getCurrentUser(req, config)?.email;

  let definition: StoryDefinition;
  try {
    definition = writeStoryDefinition(config, {
      name: name || fallbackStoryName(text),
      body: text,
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
  return json(res, 201, { ok: true, definition });
};

/**
 * `PATCH /api/stories/:key` (#0696): rename and/or rewrite a registered story's
 * definition without the PM, keeping its stable number. Body:
 * `{ name?, body? }`; at least one is required. The number, `created_at` and
 * `created_by` survive, matching what the PM flesh-out rename guarantees. When
 * the new name slugs to a different file the definition is renamed and both
 * paths are committed in one commit; a name that collides with another story is
 * a 409.
 */
export const updateStoryDefinition: RouteHandler = async (ctx, req, res, params) => {
  const { config, emitEvent } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { ok: false, reason: "stories are not enabled" });
  }
  let key = params.param1;
  try {
    key = decodeURIComponent(key);
  } catch {
    // Same lenient decoding as `deleteStory`.
  }
  const existing = findStoryDefinitionByKey(config, key.trim().toLowerCase());
  if (!existing) {
    return json(res, 404, { ok: false, reason: `story not found: ${params.param1}` });
  }
  const body = (await readBody(req)) as Record<string, unknown>;
  const name = typeof body?.name === "string" ? normalizeStoryName(body.name) : undefined;
  const text = typeof body?.body === "string" ? body.body : undefined;
  if (name === undefined && text === undefined) {
    return json(res, 400, { ok: false, reason: "name or body is required" });
  }

  let rewritten;
  try {
    rewritten = rewriteStoryDefinition(config, existing.path, {
      name: name ?? existing.name,
      body: text ?? existing.body,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("already exists") ? 409 : 400;
    return json(res, status, { ok: false, reason: message });
  }
  const paths = [rewritten.definition.path, rewritten.previousPath]
    .filter((p): p is string => Boolean(p))
    .map((p) => join(config.root, p));
  commitFiles(
    config.root,
    paths,
    `docs(stories): update "${rewritten.definition.name}" (#${rewritten.definition.number || storyKey(rewritten.definition.name)})`,
  );
  emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });
  return json(res, 200, { ok: true, definition: rewritten.definition });
};

// ---- story panel PM chat (#0515) ----

/**
 * Resolve the `:key` path segment to the merged story group the panel shows.
 * The client sends the story key percent-encoded and the router hands params
 * over undecoded, so decode here. Matching the merged roll-up rather than the
 * definition files is deliberate: a story that exists only as a task tag has
 * no file but is still a story the panel can open and talk about — it just has
 * no number, so its PM session falls back to a slug.
 */
function resolveStory(
  ctx: Parameters<RouteHandler>[0],
  rawKey: string,
): MergedStoryGroup<{ id: string; title: string; status: string; body: string }> | null {
  let key = rawKey;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    // A malformed escape is not worth a 500 — fall through and match as-is.
  }
  const wanted = key.trim().toLowerCase();
  if (!wanted) return null;
  const groups = mergeStoriesForDisplay(ctx.index.getTasks(), listStoryDefinitions(ctx.config));
  return groups.find((g) => g.key === wanted) ?? null;
}

/**
 * The story context handed to the PM agent, in the same shape `pmMessage`
 * builds for a task: identity first, then progress, then the member tasks the
 * PM is most likely to need to reason about, then the written scope.
 */
function storyContext(
  story: MergedStoryGroup<{ id: string; title: string; status: string; body: string }>,
): string {
  const lines = [
    `Story #${story.number || "—"}: ${story.name}`,
    `Definition: ${story.registered ? (story.path ?? "unknown") : "not registered (tag-only)"}`,
    `Progress: ${story.done} of ${story.total} tasks done${story.complete ? " (complete)" : ""}`,
  ];
  if (story.tasks.length) {
    lines.push("", "Member tasks:");
    for (const t of story.tasks) {
      lines.push(`- #${t.id} · ${t.status} · ${t.title.replace(/\s+/g, " ")}`);
    }
  } else {
    lines.push("", "Member tasks: none tagged yet.");
  }
  lines.push("", "Scope:", story.body || "(no written scope)");
  return lines.join("\n");
}

/**
 * Send a message to the PM agent about one story — the story panel's PM tab
 * (#0515), the exact counterpart of the task panel's. Same session-key scheme,
 * same resume/start split, same optimistic-error contract enforced client-side.
 */
export const pmStoryMessage: RouteHandler = async (ctx, req, res, params) => {
  const { config, runner, logger, emitEvent } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { error: "stories are not enabled" });
  }
  const story = resolveStory(ctx, params.param1);
  if (!story) {
    return json(res, 404, { error: "Story not found" });
  }

  // Per-user when auth is on (0248), so teammates sharing one instance each get
  // their own conversation about a story — same rule as the task PM chat.
  const email = getCurrentUser(req, config)?.email;
  const sessionId = storyPmSessionId(story.key, story.number, email);

  const body = (await readBody(req)) as Record<string, unknown>;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }

  // One-shot agent/CLI/model override from the story PM tab's selector, applied
  // the way the task PM route applies its overrides. "default" is the model
  // dropdown's sentinel for "the configured pm agent's own model", not a pin.
  const agentName =
    typeof body?.agentOverride === "string" && body.agentOverride ? body.agentOverride : undefined;
  const cliOverride =
    typeof body?.cliOverride === "string" && body.cliOverride ? body.cliOverride : undefined;
  const modelOverride =
    typeof body?.modelOverride === "string" && body.modelOverride ? body.modelOverride : undefined;
  let pm: Agent | null;
  if (agentName || cliOverride || isModelOverridePinned(modelOverride)) {
    const base =
      agentsForConfig(config).find((a) => a.enabled && a.name === (agentName || "pm")) ?? null;
    pm = base ? mergeAgentOverride(base, cliOverride, modelOverride) : null;
  } else {
    pm = resolvePmAgent(config);
  }
  if (!pm) {
    return json(res, 400, {
      error: "PM agent is not configured — enable it on the Agents page",
    });
  }
  // Antigravity runs inside a task worktree on every turn; a story has none, so
  // refuse rather than fall back to the main checkout.
  if (pm.cli === "antigravity") {
    return json(res, 400, {
      error: "Antigravity is not supported for story PM chats — pick another agent",
    });
  }

  // 0381: chat-input screenshots ride along as a pending batch keyed to this PM
  // session, then attach to whatever task the PM creates from the message. The
  // mechanism is session-keyed and task-agnostic, so a story chat uses it
  // unchanged.
  const rawImages = Array.isArray(body?.images) ? (body.images as IncomingPmImage[]) : [];
  let imageBatchId: string | null = null;
  if (rawImages.length > 0) {
    const queued = queuePmImages(config, sessionId, rawImages);
    imageBatchId = queued.batchId;
    if (queued.errors.length > 0) {
      // Best-effort: a rejected image never blocks the message itself.
      logger.system("warn", "Some story PM chat attachments were rejected", {
        story: story.key,
        errors: queued.errors,
      });
    }
  }

  const context = storyContext(story);
  const existing = runner.output(sessionId);
  const result = existing
    ? runner.send(sessionId, text, pm, { resumePreamble: `Story context:\n${context}` })
    : runner.startChat(sessionId, text, pm, context, storyPmPrompt);

  if (!result.ok) {
    dropPmImages(imageBatchId);
    return json(res, result.busy ? 409 : 400, {
      error: result.reason ?? (result.busy ? "PM is busy" : "could not send message to PM"),
    });
  }

  // The runner accepted the turn (running now, or queued behind
  // maxConcurrentAgents) — raise the "PM is working" indicator so the story
  // card and panel header show it. Registered under the *session key*, so two
  // users chatting about one story each hold their own entry. Cleared by the
  // `agent.exited` hook in server.ts via `clearStoryPmChat`.
  if (story.path) markStoryPmChat(sessionId, story.path);
  emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });

  return json(res, 200, { ok: true, spawn: { ok: true, pid: result.pid } });
};

/**
 * Delete a registered story's definition file (#0634). Only a *registered*
 * story can be deleted — a tag-only story (tasks tagged with a name that has
 * no `stories/*.md` file) has no definition to remove, so it 404s here and the
 * panel hides the button for it. Task files tagged with the story name are
 * never touched; the tag-only derived story that remains is the documented
 * outcome, not a side effect to clean up.
 */
export const deleteStory: RouteHandler = async (ctx, _req, res, params) => {
  const { config, emitEvent, logger } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { error: "stories are not enabled" });
  }
  let key = params.param1;
  try {
    key = decodeURIComponent(key);
  } catch {
    // Same lenient decoding as `resolveStory`.
  }
  const definition = findStoryDefinitionByKey(config, key.trim().toLowerCase());
  if (!definition) {
    return json(res, 404, { error: `story not found: ${params.param1}` });
  }
  try {
    deleteStoryFile(
      config,
      join(config.root, definition.path),
      `stories(${definition.number || definition.key}): delete`,
    );
  } catch (err) {
    if (err instanceof PathGuardError) return json(res, 400, { error: err.message });
    if (err instanceof WriteError) return json(res, 404, { error: err.message });
    throw err;
  }
  // The stories/ watcher would emit this too, but emitting here makes the
  // deletion deterministic for API callers (and non-watched deployments).
  emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });
  logger.system("info", `story deleted: ${definition.name}`, { story: definition.key });
  return json(res, 200, { ok: true });
};

/**
 * Interrupt a running PM response about a story. Resolves the same per-user
 * session id as `pmStoryMessage` and stops the in-flight turn. Idempotent.
 */
export const pmStoryInterrupt: RouteHandler = (ctx, req, res, params) => {
  const { config, runner } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { error: "stories are not enabled" });
  }
  const story = resolveStory(ctx, params.param1);
  if (!story) {
    return json(res, 404, { error: "Story not found" });
  }
  const email = getCurrentUser(req, config)?.email;
  const result = runner.interrupt(storyPmSessionId(story.key, story.number, email));
  return json(res, 200, { ok: true, ...result });
};

/**
 * The retained story PM transcript + live run stats — the same payload shape
 * `getTaskOutput` returns, resolved from the story key so the client never has
 * to know the session-key scheme.
 */
export const getStoryPmOutput: RouteHandler = (ctx, req, res, params) => {
  const { config, runner } = ctx;
  if (!storiesFeatureEnabled(config)) {
    return json(res, 404, { error: "stories are not enabled" });
  }
  const story = resolveStory(ctx, params.param1);
  if (!story) {
    return json(res, 404, { error: "Story not found" });
  }
  const email = getCurrentUser(req, config)?.email;
  const sessionId = storyPmSessionId(story.key, story.number, email);
  const session = runner.output(sessionId);
  return json(res, 200, {
    ok: true,
    lines: session?.lines ?? [],
    stats: runner.stats(sessionId),
  });
};
