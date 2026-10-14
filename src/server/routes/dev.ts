/**
 * Dev targets API (#0747, failure summary #0775).
 *
 * Routes for the user-declared dev targets in `[[dev.targets]]`: list with
 * state, start, stop and restart one by name. The command is ALWAYS resolved
 * from the committed `repoos.toml` by name — no request body ever carries a
 * command, which is the whole trust boundary of this feature.
 *
 * #0775 adds two read-only-around-a-failure routes: stopping the process a
 * failed target could not bind a port against (only when RepoOS started it),
 * and an optional AI-written explanation of the failure.
 */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import type { DevTargetManager } from "../dev.js";
import {
  debuggerAgent,
  extractOneShotReportText,
  recordOneShotSession,
  runPrompt,
} from "../agents.js";
import { redactSecrets } from "./debugger.js";
import type { DevTargetView } from "../dev.js";

/** Resolve the dev target manager, or null for a partial (test) context. */
function manager(ctx: { devTargets?: DevTargetManager }): DevTargetManager | null {
  return ctx.devTargets ?? null;
}

/**
 * GET /api/dev/targets — every declared target with its state, full log and (for
 * a failed target) the plain-language failure summary, including the process
 * holding a contended port.
 */
export const getDevTargets: RouteHandler = async (ctx, _req, res) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  return json(res, 200, {
    ok: true,
    targets: await dev.listDetailed(),
    errors: dev.configErrors(),
  });
};

/** GET /api/dev/targets/:name — one target with its state and failure summary. */
export const getDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const target = await dev.getDetailed(name);
  if (!target) return json(res, 404, { error: `Unknown dev target "${name}"` });
  return json(res, 200, { ok: true, target });
};

/** POST /api/dev/targets/:name/start */
export const startDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.start(name);
  if (!result.ok) return json(res, result.target ? 502 : 404, { error: result.error });
  return json(res, 200, { ok: true, target: (await dev.getDetailed(name)) ?? result.target });
};

/** POST /api/dev/targets/:name/stop */
export const stopDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.stop(name);
  if (!result.ok) return json(res, 404, { error: result.error });
  return json(res, 200, { ok: true, target: (await dev.getDetailed(name)) ?? result.target });
};

/** POST /api/dev/targets/:name/restart */
export const restartDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.restart(name);
  if (!result.ok) return json(res, result.target ? 502 : 404, { error: result.error });
  return json(res, 200, { ok: true, target: (await dev.getDetailed(name)) ?? result.target });
};

/**
 * POST /api/dev/targets/:name/stop-holder — stop the process holding the port a
 * failed target could not bind (#0775). The manager refuses unless RepoOS
 * itself recorded that PID, so this can never kill an arbitrary process.
 */
export const stopDevTargetHolder: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.stopHolder(name);
  if (!result.ok) return json(res, 409, { error: result.error });
  return json(res, 200, { ok: true, target: result.target });
};

/** The Debugger writes the optional plain-language explanation (#0775). */
function devFailurePrompt(target: DevTargetView, output: string): string {
  const f = target.failure;
  return [
    "You are the Debugger for RepoOS. A developer-declared dev target just failed and the",
    "human is looking at its output on the Dev page. Write a short plain-language summary.",
    "",
    "Answer with 2–4 short sentences of plain text and nothing else: no markdown, no code",
    "fences, no preamble. Say what failed, the most likely cause, and the concrete next",
    "action. If a port is already in use, name the port.",
    "",
    `Target: ${target.label} (${target.name}), kind ${target.kind}`,
    `Command: ${target.command}`,
    `Recorded reason: ${target.error ?? "(none)"}`,
    ...(f ? [`Detected: ${f.what} ${f.cause} ${f.fix}`] : []),
    ...(f?.holder ? [`Port holder: pid ${f.holder.pid} — ${f.holder.command}`] : []),
    "",
    "Output (newest last, secrets redacted):",
    output,
  ].join("\n");
}

/** Keep the log excerpt sent to the model bounded. */
const DEV_FAILURE_LOG_CHARS = 4000;

/**
 * POST /api/dev/targets/:name/explain — an optional AI-written explanation of a
 * failed target (#0775). Off unless the user enables it in Settings; the
 * deterministic summary needs no model and is always shown regardless.
 */
export const explainDevFailure: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  if (ctx.config.dev?.failureSummary?.ai !== true) {
    return json(res, 403, {
      error:
        "AI failure summaries are turned off. Turn them on under Settings → Advanced → Dev targets.",
    });
  }
  const name = decodeURIComponent(params.param1);
  const target = await dev.getDetailed(name);
  if (!target) return json(res, 404, { error: `Unknown dev target "${name}"` });
  if (!target.failure) {
    return json(res, 400, { error: `${target.label} is not in a failed state.` });
  }
  const output = redactSecrets(target.log.join("\n")).slice(-DEV_FAILURE_LOG_CHARS);
  const override = ctx.config.builtInAgents?.debugger ?? {};
  const agent = debuggerAgent({
    cli: typeof override.cli === "string" && override.cli.trim() ? override.cli.trim() : undefined,
    model:
      typeof override.model === "string" && override.model.trim()
        ? override.model.trim()
        : undefined,
  });
  const result = await runPrompt(agent, devFailurePrompt(target, output), {
    cwd: ctx.config.root,
    timeoutMs: 60_000,
  });
  recordOneShotSession(ctx.config.root, agent, result, { sessionType: "debugger", taskId: null });
  if (!result.ok) {
    return json(res, 502, { error: result.error ?? "The AI summary failed." });
  }
  const summary = extractOneShotReportText(agent.cli, result.output ?? "").trim();
  if (!summary) return json(res, 502, { error: "The AI summary came back empty." });
  return json(res, 200, { ok: true, summary: summary.slice(0, 2000) });
};
