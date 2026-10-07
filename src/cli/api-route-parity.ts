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

/** Routes implemented by the server-backed control CLI (#0723). */
const CONTROL_API_MATCHERS: Matcher[] = [
  re("POST", /^\/api\/tasks\/([^/]+)\/(start|pause|message|done)$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/preview$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/preview\/stop$/.source),
  exact("GET", "/api/config"),
  exact("PATCH", "/api/config"),
  exact("GET", "/api/remote-validation/status"),
  exact("POST", "/api/remote-validation/test"),
  exact("GET", "/api/agents/running"),
  exact("GET", "/api/stats/board"),
  exact("GET", "/api/events"),
  exact("POST", "/api/cto/heartbeat"),
  // `repoos review` → PATCH status=review; `repoos override` → PATCH overrides
  re("PATCH", /^\/api\/tasks\/([^/]+)$/.source),
];

/** Routes covered by existing file-level CLI commands (not HTTP). */
const FILE_CLI_MATCHERS: Matcher[] = [
  exact("GET", "/api/health"),
  exact("GET", "/api/tasks"),
  re("GET", /^\/api\/tasks\/([^/]+)$/.source),
  exact("POST", "/api/tasks"),
  re("DELETE", /^\/api\/tasks\/([^/]+)$/.source),
  exact("GET", "/api/check-plan"),
];

/** UI-only, SSE/hub, auth, or internal routes — no CLI required. */
const UI_ONLY_MATCHERS: Matcher[] = [
  (r) => r.pattern.startsWith("/api/auth/"),
  (r) => r.pattern.startsWith("/api/hub/"),
  (r) => r.pattern.startsWith("/api/telegram/"),
  exact("GET", "/api/index"),
  exact("GET", "/api/board"),
  exact("GET", "/api/counts"),
  exact("GET", "/api/docs"),
  (r) => r.pattern.startsWith("/api/repo/"),
  (r) => r.pattern.startsWith("/api/inputs"),
  (r) => r.pattern.startsWith("/api/skills"),
  (r) => r.pattern.startsWith("/api/skill-registry"),
  (r) => r.pattern.startsWith("/api/stories"),
  exact("GET", "/api/system"),
  exact("GET", "/api/system/logs"),
  (r) => r.pattern.startsWith("/api/support/"),
  (r) => r.pattern.startsWith("/api/tunnel/"),
  (r) => r.pattern.startsWith("/api/release"),
  (r) => r.pattern.startsWith("/api/deployments"),
  (r) => r.pattern.startsWith("/api/chat"),
  (r) => r.pattern.startsWith("/api/debugger"),
  re("GET", /^\/api\/tasks\/([^/]+)\/debugger$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/message$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/interrupt$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/send-to-engineer$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/debugger\/send-to-pm$/.source),
  re("POST", /^\/api\/agents\/built-in\/([^/]+)\/run$/.source),
  (r) => r.pattern.startsWith("/api/cto"),
  exact("GET", "/api/stats/by-type"),
  exact("GET", "/api/stats/daily"),
  exact("POST", "/api/system/kill-process"),
  exact("GET", "/api/system/run-tests"),
  exact("POST", "/api/system/run-tests"),
  exact("GET", "/api/attention"),
  exact("GET", "/api/check-runs"),
  (r) => r.pattern.startsWith("/api/integration"),
  exact("GET", "/api/close-out/outcomes"),
  re("GET", /^\/api\/tasks\/([^/]+)\/integration-job$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/done\/cancel$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/worktree-handoff\/discard$/.source),
  re("GET", /^\/api\/tasks\/([^/]+)\/review$/.source),
  re("POST", /^\/api\/tasks\/([^/]+)\/review\/again$/.source),
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
  re("POST", /^\/api\/tasks\/([^/]+)\/needs-input\/dismiss$/.source),
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
  (r) => r.pattern.startsWith("/api/dev/"),
  (r) => r.pattern.startsWith("/api/models"),
  (r) => r.pattern.startsWith("/api/playground"),
  (r) => r.pattern.startsWith("/api/model-providers"),
  exact("GET", "/api/agents/queued"),
  exact("GET", "/api/agents/detect"),
  exact("GET", "/api/agents/detect/stream"),
  exact("POST", "/api/agents/updates"),
  re("GET", /^\/api\/agents\/([^/]+)\/logs$/.source),
  (r) => r.pattern.startsWith("/api/ntfy/"),
  exact("POST", "/api/transcribe"),
  (r) => r.pattern.startsWith("/api/service/"),
  exact("POST", "/api/server/restart"),
  re("POST", /^\/api\/tasks\/([^/]+)\/(sync|hotfix|abandon|reopen|archive|unarchive)$/.source),
  exact("POST", "/api/tasks/freeform"),
  exact("POST", "/api/docs/create"),
  exact("POST", "/api/docs/freeform"),
  re("GET", /^\/api\/freeform\/runs\/([^/]+)$/.source),
];

const ALL_MATCHERS = [...CONTROL_API_MATCHERS, ...FILE_CLI_MATCHERS, ...UI_ONLY_MATCHERS];

export function isApiRouteCovered(route: ApiRouteRef): boolean {
  if (!route.pattern.startsWith("/api/")) return true;
  return ALL_MATCHERS.some((m) => m(route));
}

export function uncoveredApiRoutes(routes: readonly ApiRouteRef[]): ApiRouteRef[] {
  return routes.filter((r) => r.pattern.startsWith("/api/") && !isApiRouteCovered(r));
}
