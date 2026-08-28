/**
 * Model Playground routes (0313): serves the curated "worth trying" catalog
 * (GET) and runs a stateless chat turn against a chosen model (POST).
 *
 * The chat turn reuses the same `opencode run --model <id>` one-shot path
 * every other role (PM, reviewer, freeform doc) already goes through — the
 * playground's `runId` (`${providerId}/${modelId}`) is exactly the model id
 * opencode expects, so no new API-key handling is needed: opencode's own
 * provider auth on the server machine covers it, keeping keys out of the
 * client entirely.
 */
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { listPlaygroundModels, PLAYGROUND_PROVIDERS } from "../../core/providers/index.js";
import { runPrompt, recordOneShotSession } from "../agents.js";
import type { Agent } from "../../core/types.js";

/**
 * `runId` is `${providerId}/${modelId}`, forwarded verbatim as an opencode
 * `--model` argv value (see `promptCommand` in agents.ts) — safe from shell
 * injection since it's spawned via argv, never a shell string, but still
 * worth constraining to the character set real provider/model ids use and to
 * a provider we've actually registered, so a malformed client payload fails
 * fast with a clear 400 instead of reaching the CLI at all.
 */
const RUN_ID_PATTERN = /^[a-zA-Z0-9][\w.-]*\/[\w./-]+$/;

/** Exported for tests. */
export function isKnownRunId(runId: string): boolean {
  if (!RUN_ID_PATTERN.test(runId)) return false;
  const providerId = runId.slice(0, runId.indexOf("/"));
  return PLAYGROUND_PROVIDERS.some((p) => p.id === providerId);
}

export const getPlaygroundModels: RouteHandler = async (_ctx, req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const refresh = url.searchParams.get("refresh") === "1";
  const providers = await listPlaygroundModels({ refresh });
  return json(res, 200, { providers, at: new Date().toISOString() });
};

const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LEN = 8000;

export interface PlaygroundChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface RawChatMessage {
  role?: unknown;
  text?: unknown;
}

/** Trim/validate the client-supplied history into a safe, bounded turn list. Exported for tests. */
export function sanitizePlaygroundHistory(raw: unknown): PlaygroundChatMessage[] {
  const list = Array.isArray(raw) ? (raw as RawChatMessage[]) : [];
  return list
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      text: typeof m.text === "string" ? m.text.slice(0, MAX_MESSAGE_LEN).trim() : "",
    }))
    .filter((m) => m.text.length > 0);
}

/**
 * Build a one-shot prompt carrying the whole visible conversation: opencode's
 * `run` command is stateless per-invocation, so multi-turn context has to be
 * folded into the prompt text itself rather than resumed via a session id.
 * Exported for tests.
 */
export function buildPlaygroundPrompt(runId: string, history: PlaygroundChatMessage[]): string {
  const turns = history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n\n");
  return [
    `You are the model ${runId}, being tried out in a quick chat playground. Answer the user's latest message directly and concisely.`,
    turns,
    "Assistant:",
  ].join("\n\n");
}

export const sendPlaygroundMessage: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const body = (await readBody(req)) as { runId?: unknown; messages?: unknown };
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  if (!runId || runId.length > 200 || !isKnownRunId(runId)) {
    return json(res, 400, { error: "runId must be a known provider/model id" });
  }

  const history = sanitizePlaygroundHistory(body.messages);
  if (!history.length || history[history.length - 1].role !== "user") {
    return json(res, 400, { error: "the last message must be a non-empty user message" });
  }

  const agent: Agent = { name: "playground", cli: "opencode", model: runId, enabled: true };
  const prompt = buildPlaygroundPrompt(runId, history);
  const result = await runPrompt(agent, prompt, { cwd: config.root });
  recordOneShotSession(config.root, agent, result, { sessionType: "playground", taskId: null });

  if (!result.ok || !result.output) {
    return json(res, 502, { error: result.error ?? "the model returned no output" });
  }
  return json(res, 200, {
    ok: true,
    text: result.output,
    elapsedMs: result.elapsedMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  });
};
