/**
 * `GET /api/check-plan` — the read-only data behind the Checks surface (#0447).
 *
 * Returns the repo's resolved check plan, the profile-selected steps and why
 * the rest are skipped, the declared prerequisites that are missing (with
 * install advice), and the last recorded `repoos check` run. It resolves the
 * plan through the engine's own functions and runs nothing: the UI explains
 * what `repoos check` would do, it does not re-implement it.
 *
 * Query params: `?profile=<name>` and `?changed=<git-ref>` (changed-path fast
 * mode). Both are optional; an unknown profile simply selects nothing, and an
 * unresolvable ref degrades to a full-plan view with a warning rather than an
 * error.
 */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { resolveCheckPlanView } from "../check-plan-info.js";

export const getCheckPlan: RouteHandler = (ctx, req, res) => {
  let profile: string | undefined;
  let changed: string | undefined;
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    profile = url.searchParams.get("profile") ?? undefined;
    changed = url.searchParams.get("changed") ?? undefined;
  } catch {
    /* a malformed URL just yields the default view */
  }
  return json(res, 200, {
    ok: true,
    checkPlan: resolveCheckPlanView(ctx.config, { profile, changedRef: changed }),
  });
};
