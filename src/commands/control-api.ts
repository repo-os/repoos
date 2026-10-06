/**
 * Server-backed CLI commands (#0723) — start, pause, review, done, message, etc.
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

interface CommonOpts {
  json: boolean;
  wait: boolean;
  port?: number;
}

function parseCommonFlags(args: string[]): { rest: string[]; opts: CommonOpts; error?: string } {
  const opts: CommonOpts = { json: false, wait: false };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--wait") opts.wait = true;
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
    printErr('Usage: repoos message <id> "<text>" [--json] [--port N]');
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("POST", `/api/tasks/${id}/message`, { text });
    if (opts.json) printJson(data);
    else console.log(c.green("  ✓ ") + c.dim(`message sent to #${id}`));
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdReview(args: string[]): Promise<number> {
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
      { label: `handoff for #${id}`, timeoutMs: 600_000 },
    );
    if (opts.json) printJson({ ok: true, task: result });
    else console.log(c.green("  ✓ ") + c.dim(`#${id} is in review`));
    return 0;
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
    if (started.status !== 200 || !started.body.ok) {
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
          return null;
        }
        const phase = (jobRes.body.job as { phase?: string } | undefined)?.phase;
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
  const id = rest[0];
  if (!id) {
    printErr("Usage: repoos override <id> [--cli <name>] [--model <model>] [--json] [--port N]");
    return 1;
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
      console.log(
        c.dim("  remote validation:"),
        (status as { enabled?: boolean }).enabled ? "on" : "off",
      );
      if (probe && test) {
        console.log(c.dim("  probe:"), (test as { ok?: boolean }).ok ? "ok" : "failed");
      }
    }
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}

export async function cmdAgentsRunning(args: string[]): Promise<number> {
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
    if (opts.json) printJson(data);
    else {
      const spend = (data as { totalSpendUsd?: number }).totalSpendUsd;
      if (spend !== undefined) console.log(`  board spend: $${spend.toFixed(2)}`);
      else console.log(JSON.stringify(data));
    }
    return 0;
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
