/**
 * Server-backed CLI commands (#0723) — start, pause, sync, review, done, message, etc.
 */
import { c } from "../cli/colors.js";
import {
  pollUntil,
  RepoOsApi,
  RepoOsApiError,
  resolveControlPlaneBase,
  type ApiJson,
} from "../cli/repoos-api.js";
import { effectiveEngineerFromApi } from "../cli/effective-from-api.js";
import { HANDOFF_DEADLINE_MS } from "../server/handoff.js";
import { fmtDuration } from "./driver.js";
import {
  agentModelAllowRows,
  pauseAllowlistEntry,
  resumeAllowlistEntry,
  pairPauseInfo,
} from "../core/budget-allowlist.js";
import type { RepoOSConfig } from "../core/types.js";
import type { LandableCheck, LandableResult } from "../core/landable.js";

interface CommonOpts {
  json: boolean;
  wait: boolean;
  now: boolean;
  port?: number;
}

function parseCommonFlags(args: string[]): { rest: string[]; opts: CommonOpts; error?: string } {
  const opts: CommonOpts = { json: false, wait: false, now: false };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--wait") opts.wait = true;
    else if (a === "--now") opts.now = true;
    else if (a === "--port") {
      const p = args[++i];
      const n = Number(p);
      if (!p || !Number.isInteger(n) || n <= 0)
        return { rest, opts, error: "--port requires a positive integer" };
      opts.port = n;
    } else rest.push(a);
  }
  return { rest, opts };
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print the agent-driver budget allowlist so a driver can choose an allowed
 * pair before running `repoos override` (#0764). Reads the local config file —
 * no server round-trip.
 */
function printBudgetAllowlist(config: RepoOSConfig): void {
  const rows = config.budget?.allowlist ?? [];
  if (!rows.length) {
    console.log(
      c.dim(
        "  Budget allowlist: (empty — agent drivers are not restricted to any agent+model pair)",
      ),
    );
    return;
  }
  console.log(
    c.dim("  Budget allowlist for agent drivers — allowed agent + model pairs (paused shown):"),
  );
  const now = Date.now();
  for (const row of rows) {
    if (row.paused) {
      const info = pairPauseInfo(rows, row.cli, row.models[0] ?? "", now);
      if (!info.paused) {
        // `pausedUntil` has passed — the row is already selectable again.
        console.log(`  · ${row.cli} + ${row.models.join(", ")}`);
        continue;
      }
      const detail = [info.reason, info.until ? `until ${info.until}` : ""]
        .filter(Boolean)
        .join(", ");
      console.log(
        `  · ${row.cli} + ${row.models.join(", ")} ${c.yellow("(paused agent)")}${detail ? c.dim(` — ${detail}`) : ""}`,
      );
      continue;
    }
    for (const model of row.models) {
      const info = pairPauseInfo(rows, row.cli, model, now);
      const detail = [info.reason, info.until ? `until ${info.until}` : ""]
        .filter(Boolean)
        .join(", ");
      const suffix = info.paused
        ? ` ${c.yellow("(paused)")}${detail ? c.dim(` — ${detail}`) : ""}`
        : "";
      console.log(`  · ${row.cli} + ${model}${suffix}`);
    }
  }
  console.log(
    c.dim(
      "  Paused pairs are never selected. Resume with: repoos agents resume <agent> [--model <model>]",
    ),
  );
}

function printErr(message: string): void {
  console.error(c.red("  ✗ ") + message);
}

function getAtPath(obj: Record<string, unknown>, key: string): unknown {
  if (key in obj) return obj[key];
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function parseSetValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function ensureServer(api: RepoOsApi): Promise<void> {
  if (!(await api.health())) {
    throw new RepoOsApiError(
      `Can't reach the RepoOS server at ${api.base}. Start it with \`repoos serve\`.`,
      0,
    );
  }
}

export async function cmdStart(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  let fresh = false;
  const idParts: string[] = [];
  for (const a of rest) {
    if (a === "--fresh") fresh = true;
    else idParts.push(a);
  }
  const id = idParts[0];
  if (!id) {
    printErr("Usage: repoos start <id> [--fresh] [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const body = fresh ? { mode: "fresh" } : {};
    const data = await api.requestOk("POST", `/api/tasks/${id}/start`, body);
    if (opts.json) printJson(data);
    else console.log(c.green("  ✓ ") + c.dim(`started #${id}`));
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdPause(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const id = rest[0];
  if (!id) {
    printErr("Usage: repoos pause <id> [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("POST", `/api/tasks/${id}/pause`, {});
    if (opts.json) printJson(data);
    else console.log(c.green("  ✓ ") + c.dim(`paused #${id}`));
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdMessage(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const id = rest[0];
  const text = rest.slice(1).join(" ").trim();
  if (!id || !text) {
    printErr('Usage: repoos message <id> "<text>" [--now] [--json] [--port N]');
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("POST", `/api/tasks/${id}/message`, {
      text,
      ...(opts.now ? { now: true } : {}),
    });
    if (opts.json) printJson(data);
    else if (data?.queued) {
      const why = data.now
        ? (data.reason ?? "agent still busy after the interrupt")
        : "agent busy — delivers when the turn ends";
      console.log(c.green("  ✓ ") + c.dim(`message queued to #${id} (${why})`));
    } else if (data?.deliveredNow) {
      const how = data.interrupted ? " (interrupted the running turn)" : " (agent was idle)";
      console.log(c.green("  ✓ ") + c.dim(`message delivered now to #${id}${how}`));
    } else {
      console.log(c.green("  ✓ ") + c.dim(`message sent to #${id}`));
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdReviewAgain(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const id = rest[0];
  if (!id) {
    printErr("Usage: repoos review again <id> [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const res = await api.request("POST", `/api/tasks/${id}/review/again`, {});
    const body = res.body;
    if (res.status === 200 && body.ok === true) {
      if (opts.json) printJson(body);
      else console.log(c.green("  ✓ ") + c.dim(`review started for #${id}`));
      return 0;
    }
    const errText =
      typeof body.error === "string" && body.error.trim()
        ? body.error.trim()
        : `review again refused (HTTP ${res.status})`;
    if (opts.json) printJson({ ok: false, error: errText, status: res.status, ...body });
    else printErr(errText);
    return 1;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdReview(args: string[]): Promise<number> {
  if (args[0] === "again") {
    return cmdReviewAgain(args.slice(1));
  }
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const id = rest[0];
  if (!id) {
    printErr("Usage: repoos review <id> [--wait] [--json] [--port N]");
    return 1;
  }
  const wait = opts.wait || !opts.json;
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const started = await api.request("PATCH", `/api/tasks/${id}`, {
      status: "review",
      origin: "cli-review",
    });
    if (started.status !== 202) {
      throw new RepoOsApiError(
        started.body.error ?? `handoff request failed (${started.status})`,
        started.status,
        started.body,
      );
    }
    if (!wait) {
      if (opts.json) printJson({ ok: true, pendingHandoff: true, task: started.body });
      else console.log(c.green("  ✓ ") + c.dim(`handoff started for #${id} (use --wait to block)`));
      return 0;
    }
    const result = await pollUntil(
      async () => {
        const t = await api.requestOk("GET", `/api/tasks/${id}`);
        if (t.status === "review") return t;
        if (t.pendingHandoff) return null;
        if (t.status === "active") {
          const reason =
            typeof t.last_check_failure === "string"
              ? t.last_check_failure
              : "handoff did not move task to review";
          throw new RepoOsApiError(reason, 400, t);
        }
        return null;
      },
      { label: `handoff for #${id}`, timeoutMs: HANDOFF_DEADLINE_MS },
    );
    if (opts.json) printJson({ ok: true, task: result });
    else console.log(c.green("  ✓ ") + c.dim(`#${id} is in review`));
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

/** Merge main into the task branch (drawer "Sync with main"). */
export async function cmdSync(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const id = rest[0];
  if (!id) {
    printErr("Usage: repoos sync <id> [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const res = await api.request("POST", `/api/tasks/${id}/sync`, {});
    const body = res.body;
    const ok = body.ok === true && res.status === 200;
    if (ok) {
      if (opts.json) printJson(body);
      else console.log(c.green("  ✓ ") + c.dim(`synced #${id} with main`));
      return 0;
    }
    if (opts.json) {
      printJson(body);
    } else {
      const conflicts = Array.isArray(body.conflicts)
        ? body.conflicts.filter((p): p is string => typeof p === "string")
        : [];
      const errText =
        typeof body.error === "string" && body.error.trim()
          ? body.error.trim()
          : conflicts.length
            ? `merge conflict in ${conflicts.join(", ")}`
            : `sync refused (HTTP ${res.status})`;
      printErr(errText);
      for (const path of conflicts) console.error(c.dim(`    · ${path}`));
    }
    return 1;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

/** Refresh the current review tree's UI evidence without an engineer turn. */
export async function cmdVerify(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) return (printErr(error), 1);
  const id = rest[0];
  if (!id) return (printErr("Usage: repoos verify <id> [--json] [--port N]"), 1);
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const result = await api.requestOk("POST", `/api/tasks/${id}/verify`, {});
    if (opts.json) printJson(result);
    else {
      if (result.ok === false) {
        console.log(
          c.yellow("  ! ") +
            c.dim(
              `evidence refresh for #${id} finished with verification issues at ${result.headIdentity ?? "unknown HEAD"}`,
            ),
        );
      } else {
        console.log(
          c.green("  ✓ ") +
            c.dim(`evidence refreshed for #${id} at ${result.headIdentity ?? "unknown HEAD"}`),
        );
      }
      if (result.detail) console.log(`  ${result.detail}`);
      for (const line of Array.isArray(result.restored) ? result.restored : []) {
        console.log(c.yellow(`  · ${line}`));
      }
      if (Array.isArray(result.issues) && result.issues.length) {
        for (const issue of result.issues) console.log(c.yellow(`  · ${issue.message ?? issue}`));
      }
    }
    return result.ok === false ? 1 : 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdDone(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  let commitDirty = false;
  const idParts: string[] = [];
  for (const a of rest) {
    if (a === "--commit-dirty") commitDirty = true;
    else idParts.push(a);
  }
  const id = idParts[0];
  if (!id) {
    printErr("Usage: repoos done <id> [--commit-dirty] [--wait] [--json] [--port N]");
    return 1;
  }
  const wait = opts.wait || !opts.json;
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const started = await api.request("POST", `/api/tasks/${id}/done`, { commitDirty });
    if (started.status === 409 && started.body.needsCommit) {
      throw new RepoOsApiError(
        started.body.error ?? "close-out blocked on dirty tree",
        409,
        started.body,
      );
    }
    // #0834: HEAD moved after handoff only by engineer self-check checkpoint
    // commits — the server started (or found already running) an automatic
    // gate + delta re-review instead of refusing, and close-out resumes itself
    // once the delta review is good to go. This is progress, not an error.
    if (started.status === 202 && started.body.checkpointRecovery) {
      const message = String(
        started.body.message ?? "checkpoint recovery started after engineer checkpoint commit(s)",
      );
      if (!wait) {
        if (opts.json) printJson(started.body);
        else console.log(c.green("  ✓ ") + c.dim(message));
        return 0;
      }
      if (!opts.json) console.log(c.dim(`  … ${message}\n`));
      // Keep waiting: the delta review re-enqueues close-out, and a bounce
      // back to `active` below ends the wait with the reviewer's verdict.
    } else if (started.status !== 200 || !started.body.ok) {
      throw new RepoOsApiError(
        started.body.error ?? `close-out refused (${started.status})`,
        started.status,
        started.body,
      );
    }
    if (!wait) {
      if (opts.json) printJson(started.body);
      else console.log(c.green("  ✓ ") + c.dim(`close-out enqueued for #${id}`));
      return 0;
    }
    // True once the task had a real close-out job — before that, a 404 + an
    // `active` task is the checkpoint-delta bounce (#0834), not a job hiccup.
    let jobSeen = false;
    const jobResult = await pollUntil(
      async () => {
        let jobRes: { status: number; body: ApiJson };
        try {
          jobRes = await api.request("GET", `/api/tasks/${id}/integration-job`);
        } catch {
          return null;
        }
        if (jobRes.status === 404) {
          const task = await api.requestOk("GET", `/api/tasks/${id}`);
          if (task.status === "done") return { phase: "done", task };
          // #0834: a failed checkpoint delta review bounces the task back to
          // `active` and no job will ever be enqueued for this wait — end it
          // with the verdict instead of spinning until the timeout.
          if (task.status === "active" && !jobSeen) {
            return {
              job: {
                taskId: id,
                phase: "failed",
                reason:
                  "the post-handoff delta review asked for changes — the task was returned to the engineer",
              },
            };
          }
          return null;
        }
        const phase = (jobRes.body.job as { phase?: string } | undefined)?.phase;
        jobSeen = true;
        if (phase === "done" || phase === "failed") return jobRes.body;
        if (phase) {
          if (!opts.json) {
            process.stdout.write(c.dim(`  … close-out: ${phase}\n`));
          }
        }
        return null;
      },
      { label: `close-out for #${id}`, timeoutMs: 900_000, intervalMs: 500 },
    );
    const phase = (jobResult.job as { phase?: string } | undefined)?.phase ?? "done";
    if (phase === "failed") {
      const reason =
        (jobResult.job as { reason?: string } | undefined)?.reason ?? "close-out failed";
      throw new RepoOsApiError(reason, 500, jobResult);
    }
    if (opts.json) printJson(jobResult);
    else console.log(c.green("  ✓ ") + c.dim(`#${id} moved to done`));
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdOverride(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const wantsHelp = rest.includes("--help") || rest.includes("-h");
  const id = rest.find((a) => !a.startsWith("-"));
  if (!id || wantsHelp) {
    const { config } = resolveControlPlaneBase({ port: opts.port });
    console.log(
      c.cyan("Usage:") +
        " repoos override <id> [--cli <name>] [--model <model>] [--json] [--port N]",
    );
    printBudgetAllowlist(config);
    return wantsHelp ? 0 : 1;
  }
  let cli: string | undefined;
  let model: string | undefined;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === "--cli") cli = rest[++i];
    else if (rest[i] === "--model") model = rest[++i];
  }
  if (!cli && !model) {
    printErr("Pass at least one of --cli or --model");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const patch: Record<string, string> = {};
    if (cli) patch.cliOverride = cli;
    if (model) patch.modelOverride = model;
    const updated = await api.requestOk("PATCH", `/api/tasks/${id}`, patch);
    const configRes = await api.requestOk("GET", "/api/config");
    const agents =
      ((configRes.config as { agents?: unknown } | undefined)?.agents as
        | { name: string; cli: string; model: string; enabled: boolean }[]
        | undefined) ?? [];
    const effective = effectiveEngineerFromApi(agents, {
      agentOverride: updated.agentOverride as string | null | undefined,
      cliOverride: updated.cliOverride as string | null | undefined,
      modelOverride: updated.modelOverride as string | null | undefined,
    });
    const out = {
      ok: true,
      task: updated,
      effective: { name: effective.name, cli: effective.cli, model: effective.model },
    };
    if (opts.json) printJson(out);
    else {
      console.log(
        c.green("  ✓ ") +
          `effective engineer: ${effective.name} · ${effective.cli} · ${effective.model}`,
      );
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdPreview(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  let stop = false;
  const idParts: string[] = [];
  for (const a of rest) {
    if (a === "--stop") stop = true;
    else idParts.push(a);
  }
  const id = idParts[0];
  if (!id) {
    printErr("Usage: repoos preview <id> [--stop] [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    if (stop) {
      const data = await api.requestOk("POST", `/api/tasks/${id}/preview/stop`, {});
      if (opts.json) printJson(data);
      else console.log(c.green("  ✓ ") + c.dim(`preview stopped for #${id}`));
      return 0;
    }
    const data = await api.requestOk("POST", `/api/tasks/${id}/preview`, { target: "default" });
    if (opts.json) printJson(data);
    else
      console.log(
        c.green("  ✓ ") + c.dim(`preview: ${(data as { url?: string }).url ?? "started"}`),
      );
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

/** One companion service as the dev-target API returns it (#0843). */
interface DevServiceLike {
  name: string;
  status: string;
  error?: string;
  pid?: number;
  port?: number;
  url?: string;
  log?: string[];
}

export async function cmdDev(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  // `repoos dev list` · `repoos dev <name> start|stop|restart` · `repoos dev <name>`
  // The command run is ALWAYS the one declared in repoos.toml, resolved by name.
  // #0843: `--service <name>` scopes status/logs at one companion service.
  let service: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--service") {
      service = rest[++i];
      if (!service) {
        printErr("--service requires a service name");
        return 1;
      }
      continue;
    }
    positional.push(a);
  }
  const sub = positional[0];
  if (!sub || sub === "list" || sub === "status") {
    const api = new RepoOsApi({ port: opts.port });
    try {
      await ensureServer(api);
      const data = (await api.requestOk("GET", "/api/dev/targets", undefined)) as {
        targets?: Array<{
          name: string;
          label: string;
          status: string;
          kind: string;
          url?: string;
          artifactPath?: string;
          error?: string;
          services?: DevServiceLike[];
        }>;
        errors?: string[];
      };
      if (opts.json) {
        printJson(data);
        return 0;
      }
      if (data.errors?.length) {
        for (const e of data.errors) console.log(c.yellow("  ! ") + c.dim(e));
      }
      const targets = data.targets ?? [];
      if (!targets.length) {
        console.log(c.dim("  no dev targets declared in repoos.toml ([[dev.targets]])"));
        return 0;
      }
      for (const t of targets) {
        const dot =
          t.status === "running"
            ? c.green("●")
            : t.status === "failed"
              ? c.red("●")
              : t.status === "starting"
                ? c.yellow("●")
                : c.dim("○");
        const target = t.url ?? t.artifactPath ?? "";
        console.log(
          `  ${dot} ${t.name} ${c.dim(`[${t.kind}] ${t.status}`)}${target ? c.dim(` ${target}`) : ""}`,
        );
        if (t.error) console.log(c.red(`      ${t.error}`));
        // #0843: companion services render as sub-rows with their own state —
        // the real port the service was given, not a placeholder.
        for (const s of t.services ?? []) {
          const sDot =
            s.status === "running"
              ? c.green("●")
              : s.status === "failed"
                ? c.red("●")
                : s.status === "starting"
                  ? c.yellow("●")
                  : c.dim("○");
          const port = typeof s.port === "number" ? ` :${s.port}` : "";
          console.log(
            `    ${sDot} ${c.dim("service")} ${s.name}${port} ${c.dim(String(s.status))}`,
          );
          if (s.error) console.log(c.red(`        ${s.error}`));
        }
      }
      return 0;
    } catch (e) {
      printErr((e as RepoOsApiError).message);
      return 1;
    }
  }

  const name = sub;
  const action = positional[1] ?? "status";
  const valid = ["start", "stop", "restart", "status", "logs"];
  if (!valid.includes(action)) {
    printErr(
      "Usage: repoos dev [list] · repoos dev <name> start|stop|restart|status|logs [--service <name>] [--json] [--port N]",
    );
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const base = `/api/dev/targets/${encodeURIComponent(name)}`;
    if (action === "start" || action === "stop" || action === "restart") {
      const data = (await api.requestOk("POST", `${base}/${action}`, {})) as {
        target?: { status?: string; error?: string; url?: string };
      };
      if (opts.json) {
        printJson(data);
        return 0;
      }
      if (data.target?.error) {
        printErr(`dev target "${name}" ${data.target.status}: ${data.target.error}`);
        return 1;
      }
      console.log(
        c.green("  ✓ ") +
          c.dim(
            `dev target "${name}" ${data.target?.status ?? action}${data.target?.url ? ` ${data.target.url}` : ""}`,
          ),
      );
      return 0;
    }
    if (action === "status" || action === "logs") {
      const data = (await api.requestOk("GET", base, undefined)) as {
        target?: {
          status?: string;
          error?: string;
          log?: string[];
          services?: DevServiceLike[];
        };
      };
      if (opts.json) {
        printJson(data);
        return 0;
      }
      // #0843: `--service <name>` shows one companion service instead of the
      // target — its state and, for `logs`, its own captured output.
      if (service) {
        const svc = data.target?.services?.find((s) => s.name === service);
        if (!svc) {
          printErr(
            `dev target "${name}" has no service "${service}"` +
              (data.target?.services?.length
                ? ` (declared: ${data.target.services.map((s) => s.name).join(", ")})`
                : " (no services declared)"),
          );
          return 1;
        }
        console.log(c.dim(`  ${name}/${service}: ${svc.status}`));
        if (typeof svc.port === "number") console.log(c.dim(`  port ${svc.port}`));
        if (svc.error) console.log(c.red(`  ${svc.error}`));
        if (action === "logs") {
          for (const line of svc.log ?? []) console.log(`  ${line}`);
        }
        return 0;
      }
      console.log(c.dim(`  ${name}: ${data.target?.status ?? "unknown"}`));
      if (data.target?.error) console.log(c.red(`  ${data.target.error}`));
      if (action === "logs") {
        for (const line of data.target?.log ?? []) console.log(`  ${line}`);
      }
      return 0;
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdConfig(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const sub = rest[0];
  const key = rest[1];
  const valueRaw = rest.slice(2).join(" ");
  if (sub !== "get" && sub !== "set") {
    printErr("Usage: repoos config get|set <key> [value] [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    if (sub === "get") {
      if (!key) {
        printErr("Usage: repoos config get <key>");
        return 1;
      }
      const data = await api.requestOk("GET", "/api/config");
      const config = (data.config ?? {}) as Record<string, unknown>;
      const val = getAtPath(config, key);
      if (opts.json) printJson({ key, value: val });
      else console.log(val === undefined ? c.dim("(not set)") : String(val));
      return 0;
    }
    if (!key || !valueRaw) {
      printErr("Usage: repoos config set <key> <value>");
      return 1;
    }
    const patch = { [key]: parseSetValue(valueRaw) };
    const data = await api.requestOk("PATCH", "/api/config", patch);
    if (opts.json) printJson(data);
    else console.log(c.green("  ✓ ") + c.dim(`set ${key}`));
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdRunners(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const probe = rest.includes("--probe");
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const status = await api.requestOk("GET", "/api/remote-validation/status");
    let test: ApiJson | undefined;
    if (probe) {
      test = await api.requestOk("POST", "/api/remote-validation/test", {});
    }
    const out = probe ? { status, test } : status;
    if (opts.json) printJson(out);
    else {
      const rv = status as unknown as {
        enabled?: boolean;
        hosts?: Array<{
          host: string;
          healthy: boolean;
          probed: boolean;
          inFlight: number;
          maxConcurrent: number;
          activeRuns?: Array<{
            taskId: string;
            kind?: string;
            stage?: string | null;
            startedAt: string;
            elapsedMs?: number;
            phases?: Array<{
              phase: string;
              startedAt: string;
              endedAt?: string;
              durationMs?: number;
            }>;
          }>;
          queuedRuns?: Array<{
            taskId: string;
            kind: string;
            host: string;
            position: number;
            waitedMs: number;
            blockers?: Array<{ taskId: string; kind: string; host: string; elapsedMs: number }>;
          }>;
        }>;
      };
      console.log(c.dim("  remote validation:"), rv.enabled ? "on" : "off");
      if (probe && test) {
        console.log(c.dim("  probe:"), (test as { ok?: boolean }).ok ? "ok" : "failed");
      }
      // Same run + queue detail the Runners tab shows (#0897): which host is
      // busy with what, and why a validation is waiting instead of running.
      const now = Date.now();
      for (const h of rv.hosts ?? []) {
        const state = h.healthy
          ? c.green("healthy")
          : h.probed
            ? c.red("unhealthy")
            : c.dim("unprobed");
        console.log(`  ${h.host} ${state} ${c.dim(`(${h.inFlight}/${h.maxConcurrent} running)`)}`);
        for (const r of h.activeRuns ?? []) {
          const elapsed = r.elapsedMs ?? Math.max(0, now - Date.parse(r.startedAt));
          const phases = (r.phases ?? [])
            .map((p) => {
              const ms =
                p.durationMs ??
                (p.endedAt
                  ? Date.parse(p.endedAt) - Date.parse(p.startedAt)
                  : Math.max(0, now - Date.parse(p.startedAt)));
              return `${p.phase} ${fmtDuration(ms)}`;
            })
            .join(" · ");
          console.log(
            c.dim(
              `    running #${r.taskId} ${r.kind ?? "checks"}${r.stage ? ` · ${r.stage}` : ""} · ${fmtDuration(elapsed)}`,
            ) + (phases ? c.dim(` (${phases})`) : ""),
          );
        }
        for (const q of h.queuedRuns ?? []) {
          console.log(
            c.yellow(
              `    queued #${q.taskId} ${q.kind} on ${q.host || h.host} — position ${q.position}, waiting ${fmtDuration(q.waitedMs)}`,
            ),
          );
          if (q.blockers?.length) {
            console.log(
              c.dim(
                `      ahead: ${q.blockers
                  .map((b) => `#${b.taskId} ${b.kind} on ${b.host} (${fmtDuration(b.elapsedMs)})`)
                  .join(", ")}`,
              ),
            );
          }
        }
      }
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdAgentsRunning(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(c.cyan("Usage:") + " repoos agents [list] [--json] [--port N]");
    console.log(c.cyan("       ") + ` ${AGENTS_PAUSE_USAGE}`);
    return 0;
  }
  if (args[0] === "pause" || args[0] === "resume") {
    return cmdAgentsPauseResume(args[0], args.slice(1));
  }
  const { opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("GET", "/api/agents/running");
    if (opts.json) printJson(data);
    else {
      const agents = (data.agents ?? []) as Array<{ taskId?: string; role?: string }>;
      if (!agents.length) console.log(c.dim("  (no agents running)"));
      else {
        for (const a of agents) {
          console.log(`  #${a.taskId ?? "?"} · ${a.role ?? "agent"}`);
        }
      }
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

const AGENTS_PAUSE_USAGE =
  'Usage: repoos agents pause|resume <agent> [--model <model>] [--until <date>] [--reason "..."] [--json] [--port N]';

/**
 * `repoos agents pause|resume` (#0850): pause an allowlist agent or one model
 * without removing the row, or resume it. Writes through PATCH /api/config so
 * the running server (and its Budget Controls tab) sees the change live.
 */
async function cmdAgentsPauseResume(mode: "pause" | "resume", args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  let model: string | undefined;
  let until: string | undefined;
  let reason: string | undefined;
  let agent = "";
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--help" || a === "-h") {
      console.log(c.cyan("Usage:") + ` ${AGENTS_PAUSE_USAGE}`);
      return 0;
    }
    if (a === "--model") model = rest[++i];
    else if (a === "--until") until = rest[++i];
    else if (a === "--reason") reason = rest[++i];
    else if (!a.startsWith("-") && !agent) agent = a;
  }
  if (!agent) {
    printErr(AGENTS_PAUSE_USAGE);
    return 1;
  }
  if (mode === "resume" && until) {
    printErr("--until is only meaningful with `pause`");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const configData = await api.requestOk("GET", "/api/config");
    const rows = agentModelAllowRows(
      (configData.config as Record<string, unknown> | undefined)?.["budget.allowlist"],
    );
    const result =
      mode === "pause"
        ? pauseAllowlistEntry(rows, { cli: agent, model, until, reason })
        : resumeAllowlistEntry(rows, { cli: agent, model });
    if ("error" in result) {
      printErr(result.error);
      return 1;
    }
    await api.requestOk("PATCH", "/api/config", { "budget.allowlist": result.rows });
    if (opts.json) {
      printJson({ ok: true, action: mode, agent, model: model ?? null, rows: result.rows });
    } else {
      const target = model ? `${agent} + ${model}` : `${agent} (all models)`;
      console.log(c.green("  ✓ ") + c.dim(`${mode === "pause" ? "paused" : "resumed"} ${target}`));
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdDecisions(args: string[]): Promise<number> {
  const { opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("GET", "/api/decisions");
    if (opts.json) {
      printJson(data);
      return 0;
    }
    const digest = data as {
      items?: Array<{
        kind: string;
        taskId: string | null;
        title: string;
        cause: { headline: string };
        actions: Array<{ label: string; policyAutomatic: boolean }>;
      }>;
      automationPaused?: boolean;
    };
    const items = digest.items ?? [];
    if (!items.length) {
      console.log(c.green("  ✓ ") + c.dim("No decisions waiting — policy and CTO have the board."));
      return 0;
    }
    const paused = digest.automationPaused ? " (automation paused)" : "";
    console.log(c.yellow(`  ${items.length} item(s) need a decision${paused}:`));
    for (const item of items) {
      const id = item.taskId ? `#${item.taskId}` : item.kind;
      console.log(`  · ${id} — ${item.cause.headline}`);
      const auto = item.actions.filter((a) => a.policyAutomatic).map((a) => a.label);
      const human = item.actions.filter((a) => !a.policyAutomatic).map((a) => a.label);
      if (auto.length) console.log(c.dim(`      CTO/policy: ${auto.join("; ")}`));
      if (human.length) console.log(c.dim(`      You: ${human.join("; ")}`));
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdStats(args: string[]): Promise<number> {
  const { opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("GET", "/api/stats/board");
    // System pressure and the top CPU/memory consumers live on /api/system.
    // Best-effort: a board summary must still print on a server that cannot
    // sample processes (Windows without `ps`).
    let system: StatsSystemView | null = null;
    try {
      system = (await api.requestOk("GET", "/api/system")) as StatsSystemView;
    } catch {
      system = null;
    }
    if (opts.json) {
      printJson({ ...(data as Record<string, unknown>), system });
    } else {
      const spend = (data as { totalSpendUsd?: number }).totalSpendUsd;
      if (spend !== undefined) console.log(`  board spend: $${spend.toFixed(2)}`);
      else console.log(JSON.stringify(data));
      if (system) printSystemSummary(system);
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

interface StatsTopProcess {
  pid: number;
  command: string;
  cpuPercent: number;
  memBytes: number;
  owner: "repoos" | "other";
}

interface StatsSystemView {
  pressure?: {
    level: "normal" | "warning" | "critical";
    reason: string | null;
    warnings?: string[];
    swapUsedRatio?: number | null;
    compressorRatio?: number | null;
    availableMemRatio?: number;
    loadPerCpu?: number;
    source?: "memory" | "load";
  };
  topProcesses?: { byCpu: StatsTopProcess[]; byMemory: StatsTopProcess[] };
  globalEngineers?: { own: number; others: number; servers: unknown[] } | null;
}

function fmtStatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtRatio(ratio: number | null | undefined): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

function printTopProcesses(title: string, rows: StatsTopProcess[]): void {
  if (!rows.length) return;
  console.log(c.bold(`  ${title}`));
  for (const p of rows.slice(0, 8)) {
    const owner = p.owner === "repoos" ? c.cyan("repoos") : c.dim("other ");
    console.log(
      `    ${String(p.pid).padStart(7)}  ${owner}  ${`${p.cpuPercent.toFixed(1)}%`.padStart(6)}  ${fmtStatBytes(p.memBytes).padStart(8)}  ${p.command}`,
    );
  }
}

function printSystemSummary(system: StatsSystemView): void {
  const p = system.pressure;
  if (p) {
    const label =
      p.level === "critical"
        ? c.red("critical")
        : p.level === "warning"
          ? c.yellow("warning")
          : c.green("normal");
    console.log(
      c.dim(
        `  pressure: ${label}  swap ${fmtRatio(p.swapUsedRatio)} · compressor ${fmtRatio(
          p.compressorRatio,
        )} · available ${fmtRatio(p.availableMemRatio)} · load ${p.loadPerCpu?.toFixed(1) ?? "—"}×/cpu (${p.source ?? "memory"})`,
      ),
    );
    if (p.reason) console.log(`    ${c.yellow(p.reason)}`);
  }
  const g = system.globalEngineers;
  if (g) {
    console.log(
      c.dim(
        `  engineers: ${g.own} here · ${g.others} on other RepoOS servers (${g.servers.length} registered)`,
      ),
    );
  }
  if (system.topProcesses) {
    printTopProcesses("top CPU", system.topProcesses.byCpu);
    printTopProcesses("top memory", system.topProcesses.byMemory);
  }
}

function landableIcon(status: LandableCheck["status"]): string {
  if (status === "pass") return c.green("✓");
  if (status === "warn") return c.yellow("!");
  return c.red("✗");
}

/**
 * `repoos landable <id>` (#0867): print the read-only landing pre-checks and
 * exit 0 only when every check passes. Never edits, commits or moves status.
 */
export async function cmdLandable(args: string[]): Promise<number> {
  const { rest, opts, error } = parseCommonFlags(args);
  if (error) {
    printErr(error);
    return 1;
  }
  const id = rest[0];
  if (!id) {
    printErr("Usage: repoos landable <id> [--json] [--port N]");
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const result = (await api.requestOk(
      "GET",
      `/api/tasks/${id}/landable`,
    )) as unknown as LandableResult;
    if (opts.json) printJson(result);
    else {
      const verdict = result.landable
        ? c.green(`#${id} is landable`)
        : c.red(`#${id} is not landable yet`);
      console.log(`  ${verdict}`);
      for (const check of result.checks) {
        console.log(`    ${landableIcon(check.status)} ${c.bold(check.label)} — ${check.detail}`);
        if (check.nextStep) console.log(c.dim(`        next: ${check.nextStep}`));
      }
      const { pass, warn, fail } = result.summary;
      const parts = [
        `${pass} passed`,
        `${warn} warning${warn === 1 ? "" : "s"}`,
        `${fail} failing`,
      ];
      console.log(c.dim(`  ${parts.join(" · ")}`));
    }
    return result.landable ? 0 : 1;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

/** Shared server-down check for tests. */
export async function controlApiServerDownMessage(port: number): Promise<string> {
  const { baseUrl } = resolveControlPlaneBase({ port });
  const api = new RepoOsApi({ port });
  try {
    await ensureServer(api);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}
