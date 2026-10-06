/**
 * CLI/API parity map (#0723). Every registered `/api/*` route must match at
 * least one rule here or the parity test fails.
 */

export interface ApiRouteRef {
  method: string;
  pattern: string;
}

type Matcher = (route: ApiRouteRef) => boolean;

/** Routes implemented by the server-backed control CLI (#0723). */
const CONTROL_API_MATCHERS: Matcher[] = [
  (r) =>
    r.method === "POST" && /\/tasks\/\(\[\^\/\]\+\)\/(start|pause|message|done)\$/.test(r.pattern),
  (r) => r.method === "POST" && /\/tasks\/\(\[\^\/\]\+\)\/preview\$/.test(r.pattern),
  (r) => r.method === "POST" && /\/tasks\/\(\[\^\/\]\+\)\/preview\/stop\$/.test(r.pattern),
  (r) => r.method === "GET" && r.pattern === "/api/config",
  (r) => r.method === "PATCH" && r.pattern === "/api/config",
  (r) => r.method === "GET" && r.pattern === "/api/remote-validation/status",
  (r) => r.method === "POST" && r.pattern === "/api/remote-validation/test",
  (r) => r.method === "GET" && r.pattern === "/api/agents/running",
  (r) => r.method === "GET" && r.pattern === "/api/stats/board",
  (r) => r.method === "PATCH" && /\/tasks\/\(\[\^\/\]\+\)\$/.test(r.pattern),
];

/** Routes covered by existing file-level CLI commands (not HTTP). */
const FILE_CLI_MATCHERS: Matcher[] = [
  (r) => r.method === "GET" && r.pattern === "/api/health",
  (r) => r.method === "GET" && r.pattern === "/api/tasks",
  (r) => r.method === "GET" && /\/tasks\/\(\[\^\/\]\+\)\$/.test(r.pattern),
  (r) => r.method === "POST" && r.pattern === "/api/tasks",
  (r) => r.method === "DELETE" && /\/tasks\/\(\[\^\/\]\+\)\$/.test(r.pattern),
  (r) => r.method === "GET" && r.pattern === "/api/check-plan",
];

/** UI-only, SSE/hub, auth, or internal routes — no CLI required. */
const UI_ONLY_MATCHERS: Matcher[] = [
  (r) => r.pattern.startsWith("/api/auth/"),
  (r) => r.pattern.startsWith("/api/hub/"),
  (r) => r.pattern.startsWith("/api/telegram/"),
  (r) => r.method === "GET" && r.pattern === "/api/index",
  (r) => r.method === "GET" && r.pattern === "/api/board",
  (r) => r.method === "GET" && r.pattern === "/api/counts",
  (r) => r.method === "GET" && r.pattern === "/api/docs",
  (r) => r.method === "GET" && r.pattern.startsWith("/api/repo/"),
  (r) => r.method === "POST" && r.pattern.startsWith("/api/repo/"),
  (r) => r.method === "GET" && r.pattern.startsWith("/api/inputs"),
  (r) => r.method === "POST" && r.pattern.startsWith("/api/inputs"),
  (r) => r.method === "PATCH" && r.pattern.startsWith("/api/inputs"),
  (r) => r.method === "DELETE" && r.pattern.startsWith("/api/inputs"),
  (r) => r.pattern.startsWith("/api/skills"),
  (r) => r.pattern.startsWith("/api/skill-registry"),
  (r) => r.pattern.startsWith("/api/stories"),
  (r) => r.method === "GET" && r.pattern === "/api/system",
  (r) => r.method === "GET" && r.pattern === "/api/system/logs",
  (r) => r.pattern.startsWith("/api/support/"),
  (r) => r.pattern.startsWith("/api/tunnel/"),
  (r) => r.pattern.startsWith("/api/release"),
  (r) => r.pattern.startsWith("/api/deployments"),
  (r) => r.pattern.startsWith("/api/chat"),
  (r) => r.pattern.startsWith("/api/debugger"),
  (r) => r.pattern.includes("/debugger"),
  (r) => r.pattern.startsWith("/api/cto"),
  (r) => r.method === "GET" && r.pattern.startsWith("/api/stats/"),
  (r) => r.pattern.startsWith("/api/system/"),
  (r) => r.method === "GET" && r.pattern === "/api/attention",
  (r) => r.method === "GET" && r.pattern === "/api/check-runs",
  (r) => r.pattern.startsWith("/api/integration"),
  (r) => r.method === "GET" && r.pattern === "/api/close-out/outcomes",
  (r) => r.pattern.includes("/integration-job"),
  (r) => r.pattern.includes("/done/"),
  (r) => r.pattern.includes("/worktree-handoff"),
  (r) => r.pattern.includes("/review"),
  (r) => r.pattern.includes("/pm/"),
  (r) => r.pattern.includes("/attachments"),
  (r) => r.pattern.includes("/shots"),
  (r) => r.pattern.includes("/ui-verification"),
  (r) => r.pattern.includes("/needs-input"),
  (r) => r.pattern.includes("/clear-worktree"),
  (r) => r.pattern.includes("/output"),
  (r) => r.pattern.includes("/logs"),
  (r) => r.pattern.includes("/checks"),
  (r) => r.pattern.includes("/stats"),
  (r) => r.pattern.includes("/diff"),
  (r) => r.pattern.includes("/merge-conflict"),
  (r) => r.pattern.includes("/worktree-dirty"),
  (r) => r.pattern.includes("/file"),
  (r) => r.pattern.includes("/remote-validation/"),
  (r) => r.method === "GET" && r.pattern === "/api/config/raw",
  (r) => r.method === "PUT" && r.pattern === "/api/config/raw",
  (r) => r.pattern.startsWith("/api/dev/"),
  (r) => r.pattern.startsWith("/api/models"),
  (r) => r.pattern.startsWith("/api/playground"),
  (r) => r.pattern.startsWith("/api/model-providers"),
  (r) => r.method === "GET" && r.pattern === "/api/agents/queued",
  (r) => r.method === "GET" && r.pattern.startsWith("/api/agents/detect"),
  (r) => r.method === "POST" && r.pattern === "/api/agents/updates",
  (r) => r.pattern.includes("/agents/") && r.pattern.includes("/logs"),
  (r) => r.pattern.startsWith("/api/ntfy/"),
  (r) => r.method === "POST" && r.pattern === "/api/transcribe",
  (r) => r.pattern.startsWith("/api/service/"),
  (r) => r.method === "POST" && r.pattern === "/api/server/restart",
  (r) =>
    r.method === "POST" &&
    /\/tasks\/\(\[\^\/\]\+\)\/(sync|hotfix|abandon|reopen|archive|unarchive)\$/.test(r.pattern),
  (r) => r.method === "POST" && r.pattern === "/api/tasks/freeform",
  (r) => r.method === "POST" && r.pattern === "/api/docs/create",
  (r) => r.method === "POST" && r.pattern === "/api/docs/freeform",
  (r) => r.pattern.startsWith("/api/freeform/"),
];

const ALL_MATCHERS = [...CONTROL_API_MATCHERS, ...FILE_CLI_MATCHERS, ...UI_ONLY_MATCHERS];

export function isApiRouteCovered(route: ApiRouteRef): boolean {
  if (!route.pattern.startsWith("/api/")) return true;
  return ALL_MATCHERS.some((m) => m(route));
}

export function uncoveredApiRoutes(routes: readonly ApiRouteRef[]): ApiRouteRef[] {
  return routes.filter((r) => r.pattern.startsWith("/api/") && !isApiRouteCovered(r));
}
