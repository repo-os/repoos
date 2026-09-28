/**
 * `GET /api/check-runs` — the durable history of check runs (#0564).
 *
 * One row per `repoos check` execution: local and remote halves, pre-review
 * and close-out and release phases, and bare CLI runs. Newest first. The
 * Checks page's "Runs" tab renders this as a sortable table across all tasks;
 * the task drawer's live check chip reads the per-task slice to know which
 * machine a run is/was on.
 *
 * Reads `.repoos/checks.db` — the store the check command and the remote
 * runner write. Never throws: an unreadable store yields an empty list.
 */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { getCheckStore } from "../../core/check-store.js";

export const getCheckRuns: RouteHandler = (ctx, req, res) => {
  let limit: number | undefined;
  let taskId: string | undefined;
  let machine: string | undefined;
  let remote: boolean | undefined;
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const limitRaw = url.searchParams.get("limit");
    if (limitRaw) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
    }
    taskId = url.searchParams.get("taskId") ?? undefined;
    machine = url.searchParams.get("machine") ?? undefined;
    const remoteRaw = url.searchParams.get("remote");
    if (remoteRaw === "1" || remoteRaw === "true") remote = true;
    else if (remoteRaw === "0" || remoteRaw === "false") remote = false;
  } catch {
    /* a malformed URL just yields the default view */
  }
  const store = getCheckStore(ctx.config.root, ctx.config.cacheDir);
  return json(res, 200, { ok: true, runs: store.list({ limit, taskId, machine, remote }) });
};
