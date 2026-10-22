/**
 * CLI/API parity map (#0723). Every registered `/api/*` route must match at
 * least one rule here or the parity test fails.
 *
 * Allowlist entries use exact method + pattern strings from `Router.listRoutes()`
 * — no broad substring matchers that could hide new routes.
 */

export interface ApiRouteRef {
  method: string;
  pattern: string;
}

type Matcher = (route: ApiRouteRef) => boolean;

const exact =
  (method: string, pattern: string): Matcher =>
  (r) =>
    r.method === method && r.pattern === pattern;

const re =
  (method: string, patternSource: string): Matcher =>
  (r) =>
    r.method === method && r.pattern === patternSource;

const under =
  (prefix: string): Matcher =>
  (r) =>
    r.pattern.startsWith(prefix) || r.pattern.replaceAll("\\/", "/").startsWith(`^${prefix}`);

/** Routes implemented by the server-backed control CLI (#0723). */
const CONTROL_API_MATCHERS: Matcher[] = [
  re(
    "POST",
    /^\/api\/tasks\/([^/]+)\/(start|pause|message|done|sync|hotfix|abandon|reopen|archive|unarchive|split)$/
      .source,
  ),
  re("POST", /^\/api\/tasks\/([^/]+)\/done\/cancel$/.source),
  // `repoos attention dismiss <id>` dismisses the task's needs-input event.
  re("POST", /^\/api\/tasks\/([^/]+)\/needs-input\/dismiss$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/review\/again$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/landable$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/preview$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/preview\/stop$/.source),
  // `repoos shot` single-entry capture through the browser-capture policy (#0874).
  re("POST", /^\/api\/tasks\/([^/]+)\/shots\/capture$/.source),
  // `repoos dev …` (#0747): list/status/get and start/stop/restart.
  exact("GET", "/api/dev/targets"),
  re("GET", /^\/api\/dev\/targets\/([^/]+)$/.source),
  re("POST", /^\/api\/dev\/targets\/([^/]+)\/(start|stop|restart)$/.source),
  exact("GET", "/api/config"),
  exact("PATCH", "/api/config"),
  exact("GET", "/api/remote-validation/status"),
  exact("POST", "/api/remote-validation/test"),
  exact("GET", "/api/agents/running"),
  exact("GET", "/api/stats/board"),
  exact("GET", "/api/driver/brief"),
  exact("GET", "/api/events"),
  exact("GET", "/api/integration-jobs"),
  exact("GET", "/api/integration/pipeline"),
  re("POST", /^\/api\/integration\/pipeline\/retry\/([^/]+)$/.source),
  re("POST", /^\/api\/integration\/pipeline\/refresh-install\/([^/]+)$/.source),
  exact("POST", "/api/cto/heartbeat"),
  // `repoos review` → PATCH status=review; `repoos override` → PATCH overrides
  re("PATCH", /^\/api\/tasks\/([^/]+)$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/bundle$/.source),
];

/** Routes covered by existing file-level CLI commands (not HTTP). */
const FILE_CLI_MATCHERS: Matcher[] = [
  // `repoos secrets …` — project environment metadata and writes (values never returned).
  re("GET", /^\/api\/project-environments\/([^/]+)\/secrets$/.source),
  re("PUT", /^\/api\/project-environments\/([^/]+)\/secrets$/.source),
  exact("GET", "/api/project-environment-bindings"),
  exact("PUT", "/api/project-environment-bindings"),
  exact("GET", "/api/health"),
  exact("GET", "/api/tasks"),
  re("GET", /^\/api\/tasks\/([^/]+)$/.source),
  exact("POST", "/api/tasks"),
  re("DELETE", /^\/api\/tasks\/([^/]+)$/.source),
  exact("GET", "/api/check-plan"),
  // `repoos schedule …` (#0093): task schedule definitions under schedules/.
  exact("GET", "/api/reminders"),
  exact("POST", "/api/reminders"),
  re("PATCH", /^\/api\/reminders\/([^/]+)$/.source),
  re("DELETE", /^\/api\/reminders\/([^/]+)$/.source),
  re("POST", /^\/api\/reminders\/([^/]+)\/done$/.source),
  re("POST", /^\/api\/reminders\/([^/]+)\/snooze$/.source),
  exact("GET", "/api/schedules"),
  exact("POST", "/api/schedules"),
  exact("POST", "/api/schedules/preview"),
  re("PATCH", /^\/api\/schedules\/([^/]+)$/.source),
  re("DELETE", /^\/api\/schedules\/([^/]+)$/.source),
  re("POST", /^\/api\/schedules\/([^/]+)\/run$/.source),
];

/** UI-only, SSE/hub, auth, or internal routes — no CLI required. */
const UI_ONLY_MATCHERS: Matcher[] = [
  under("/api/auth/"),
  under("/api/hub/"),
  under("/api/telegram/"),
  exact("GET", "/api/index"),
  exact("GET", "/api/board"),
  exact("GET", "/api/counts"),
  exact("GET", "/api/docs"),
  under("/api/repo/"),
  under("/api/inputs"),
  under("/api/skills"),
  under("/api/skill-registry"),
  under("/api/stories"),
  exact("GET", "/api/system"),
  exact("GET", "/api/system/logs"),
  under("/api/support/"),
  under("/api/tunnel/"),
  under("/api/release"),
  under("/api/deployments"),
  under("/api/chat"),
  under("/api/debugger"),
  re("GET", /^\/api\/tasks\/([^/]+)\/debugger$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/message$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/interrupt$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/send-to-engineer$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/send-to-pm$/.source),
  re("POST", /^\/api\/agents\/built-in\/([^/]+)\/run$/.source),
  under("/api/cto"),
  exact("GET", "/api/stats/by-type"),
  exact("GET", "/api/stats/daily"),
  exact("POST", "/api/system/kill-process"),
  // Control page worktree cleanup preview and apply action.
  exact("GET", "/api/system/worktree-gc"),
  exact("POST", "/api/system/worktree-gc"),
  exact("GET", "/api/system/run-tests"),
  exact("POST", "/api/system/run-tests"),
  exact("GET", "/api/attention"),
  exact("GET", "/api/decisions"),
  exact("GET", "/api/check-runs"),
  exact("GET", "/api/local-check-slots"),
  re("POST", /^\/api\/local-check-slots\/(\d+)\/release\/(\d+)$/.source),
  exact("GET", "/api/resource-queues"),
  exact("GET", "/api/close-out/outcomes"),
  re("GET", /^\/api\/tasks\/([^/]+)\/integration-job$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/worktree-handoff\/discard$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/review$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/review\/message$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/pm\/message$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/pm\/interrupt$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/attachments\/([^/]+)$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/attachments$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/shots$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/shots$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/shots\/([^/]+)$/.source),
  re("DELETE", /^\/api\/tasks\/([^/]+)\/shots\/([^/]+)$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/ui-verification$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/verify$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/clear-worktree$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/output$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/logs$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/checks$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/stats$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/diff-stats$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/diff$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/merge-conflict$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/worktree-dirty$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/file$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/remote-validation\/log$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/remote-validation\/events$/.source),
  exact("GET", "/api/config/raw"),
  exact("PUT", "/api/config/raw"),
  under("/api/dev/"),
  under("/api/models"),
  under("/api/playground"),
  under("/api/model-providers"),
  exact("GET", "/api/model-routing/status"),
  exact("GET", "/api/model-routing/decisions"),
  exact("POST", "/api/model-routing/probe"),
  exact("GET", "/api/agents/queued"),
  exact("GET", "/api/agents/detect"),
  exact("GET", "/api/agents/detect/stream"),
  exact("POST", "/api/agents/updates"),
  re("GET", /^\/api\/agents\/([^/]+)\/logs$/.source),
  under("/api/ntfy/"),
  exact("POST", "/api/transcribe"),
  under("/api/service/"),
  exact("POST", "/api/server/restart"),
  exact("POST", "/api/tasks/freeform"),
  exact("POST", "/api/docs/create"),
  exact("POST", "/api/docs/freeform"),
  re("GET", /^\/api\/freeform\/runs\/([^/]+)$/.source),
];

const ALL_MATCHERS = [...CONTROL_API_MATCHERS, ...FILE_CLI_MATCHERS, ...UI_ONLY_MATCHERS];

export function isApiRouteCovered(route: ApiRouteRef): boolean {
  if (!isApiRoutePattern(route.pattern)) return true;
  return ALL_MATCHERS.some((m) => m(route));
}

function isApiRoutePattern(pattern: string): boolean {
  // Router.listRoutes() stores RegExp routes as their `.source`, which begins
  // with `^\\/api\\/` rather than the literal request path.
  return pattern.startsWith("/api/") || pattern.replaceAll("\\/", "/").startsWith("^/api/");
}

export function uncoveredApiRoutes(routes: readonly ApiRouteRef[]): ApiRouteRef[] {
  return routes.filter((r) => isApiRoutePattern(r.pattern) && !isApiRouteCovered(r));
}
