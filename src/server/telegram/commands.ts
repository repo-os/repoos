/**
 * Read-only Telegram commands: `/status`, `/tasks`, `/agents`, `/help` (#0540).
 *
 * This is the first place the Telegram auth model becomes user-visible, so it
 * sits behind the same live-role gate as everything else: `createTelegramIntakeHandler`
 * runs it only through `onAuthorized`, which is reached after
 * `resolveTelegramSender` resolved a current `auth_users` row. An unbound
 * sender, or a bound sender whose row was deleted, never reaches this module
 * and gets silence (ADR 0007) — nothing here needs to (or may) send an error
 * for a sender it never sees.
 *
 * Data comes from the same live in-process sources the HTTP read routes use —
 * `LiveIndex`, `AgentRunner`, `ReviewManager` — never a Telegram-only query or
 * a second agent runtime. Links reuse the notification provider's origin
 * resolution (`webUiLink`), and the one-line task renderer reuses the
 * notification `NotificationSpec` formatter.
 */
import type { AuthRole } from "../../core/auth.js";
import type { RepoOSConfig, Status, Task } from "../../core/types.js";
import { STATUSES } from "../../core/types.js";
import type { FinishedAgentInfo, RunningAgentInfo } from "../agents.js";
import { type NotificationSpec } from "../notifications/format.js";
import { webUiLink } from "../notifications/link.js";
import { notificationForMovedToReview, notificationForNeedsInput } from "../notifications/spec.js";
import type { TelegramActor } from "./actor.js";
import type { TelegramAuthorizedHandler } from "./intake.js";
import {
  clampMessage,
  DEFAULT_PAGE_SIZE,
  paginate,
  showingLine,
  shortUtc,
  taskLine,
  truncateLine,
  type TelegramPage,
} from "./render.js";
import type { TelegramSendOptions, TelegramUpdate } from "./types.js";

/** The commands this module owns. Extended by later Telegram tasks. */
export const TELEGRAM_READ_COMMANDS = ["status", "tasks", "agents", "help"] as const;

/**
 * Slash commands other layers own and consume before `onAuthorized` (identity
 * linking and chat binding live in intake). When they arrive bare they must be
 * met with silence here, not an "unknown command" reply.
 */
const SILENT_FALLTHROUGH_COMMANDS = new Set([
  "start",
  "bind",
  "link",
  "unlink",
  // #0541 owns `/new`'s reply (guide-conversation reset); bare `/new` falling
  // into "unknown command → help" would answer it twice.
  "new",
]);

/** The default `/tasks` scope: work that is actually moving. */
const WORK_SCOPE = "work";
const WORK_STATUSES: readonly Status[] = ["active", "review"];

/** Longest `/agents` list shown before an explicit "and N more" line. */
const AGENT_LIST_LIMIT = 8;
const FINISHED_LIST_LIMIT = 5;

export interface TelegramCommandIndex {
  getTasks(status?: Status): Task[];
  getTask(id: string): Task | null;
  counts(): Record<Status, number>;
}

export interface TelegramCommandRunner {
  running(): RunningAgentInfo[];
  recentlyFinished(limit?: number): FinishedAgentInfo[];
}

export interface TelegramCommandReviews {
  enabled(): boolean;
  runningCount(): number;
}

export type TelegramCommandSender = (
  chatId: number,
  text: string,
  options?: TelegramSendOptions,
) => void | Promise<void>;

export interface TelegramCommandDeps {
  config: Pick<RepoOSConfig, "root">;
  repositoryName: string;
  index: TelegramCommandIndex;
  runner: TelegramCommandRunner;
  reviews: TelegramCommandReviews;
  /** Control-plane origin for links; falls back to `REPOOS_PUBLIC_URL`/tunnel. */
  publicOrigin?: string;
  pageSize?: number;
  send: TelegramCommandSender;
}

/**
 * Which `/tasks <scope>` words a role may ask for. Both roles can glance at
 * work in flight; only an admin may query arbitrary statuses (closed/historical
 * or pre-work states). This is the read-side half of the story's role boundary
 * — `/help` states it explicitly so a member hears it before being refused.
 */
export function telegramTaskScopesForRole(role: AuthRole): string[] {
  return role === "admin" ? [WORK_SCOPE, ...STATUSES] : [WORK_SCOPE, "active", "review"];
}

interface ParsedTasksArgs {
  scope: string;
  statuses: readonly Status[];
  page: number;
}

/**
 * Parse `/tasks [scope] [page]`. `scope` is a status name or the `work`
 * pseudo-scope; a bare integer is a page. The role check happens here so the
 * caller gets a single, obvious boundary decision.
 */
function parseTasksArgs(
  args: string[],
  role: AuthRole,
): { ok: true; parsed: ParsedTasksArgs } | { ok: false; denied: string } {
  const allowed = telegramTaskScopesForRole(role);
  let scope: string | null = null;
  let page = 1;
  for (const raw of args) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      page = Math.max(1, Number.parseInt(token, 10));
      continue;
    }
    if (!allowed.includes(token)) return { ok: false, denied: token };
    scope = token;
  }
  const chosen = scope ?? WORK_SCOPE;
  return {
    ok: true,
    parsed: {
      scope: chosen,
      statuses: chosen === WORK_SCOPE ? WORK_STATUSES : [chosen as Status],
      page,
    },
  };
}

function scopeLabel(scope: string): string {
  return scope === WORK_SCOPE ? "active & review" : scope;
}

function pagerHint(scope: string, page: TelegramPage<unknown>): string | null {
  const hints: string[] = [];
  if (page.hasPrev) hints.push(`/tasks ${scope} ${page.page - 1}`);
  if (page.hasNext) hints.push(`/tasks ${scope} ${page.page + 1}`);
  if (hints.length === 0) return null;
  return `More: ${hints.join(" · ")}`;
}

function webLink(deps: TelegramCommandDeps, path: string): string {
  return webUiLink(deps.config, path, deps.publicOrigin);
}

/** The shared notification spec that best describes a task's attention state. */
function attentionSpec(task: Task): NotificationSpec {
  if (task.needsInput) return notificationForNeedsInput();
  return notificationForMovedToReview();
}

function taskLabel(deps: TelegramCommandDeps, id: string): string {
  const task = deps.index.getTask(id);
  return task ? `#${task.id} ${truncateLine(task.title, 50)}` : `#${id}`;
}

function renderStatus(deps: TelegramCommandDeps): string {
  const tasks = deps.index.getTasks();
  const counts = deps.index.counts();
  const needsAttention = tasks.filter((t) => t.needsInput || t.status === "review");
  const needsInputCount = tasks.filter((t) => t.needsInput).length;

  const lines: string[] = [
    `📊 ${deps.repositoryName} — status`,
    `${tasks.length} tasks · ${counts.active} active · ${counts.review} in review · ${needsInputCount} need you`,
  ];

  if (needsAttention.length > 0) {
    lines.push("", "Needs attention");
    const shown = needsAttention.slice(0, 3);
    for (const task of shown) {
      lines.push(`• ${taskLine(attentionSpec(task), task)}`);
    }
    const remaining = needsAttention.length - shown.length;
    if (remaining > 0) lines.push(`…and ${remaining} more`);
  }

  const running = deps.runner.running().length;
  const reviews = deps.reviews;
  const reviewState = reviews.enabled() ? `${reviews.runningCount()} running` : "auto-review off";
  lines.push("", `Agents: ${running} running · Reviews: ${reviewState}`);
  lines.push(webLink(deps, "/work"));
  return lines.join("\n");
}

function taskListLine(task: Task): string {
  const meta = [task.status, task.priority, task.assignedTo].filter(Boolean).join(" · ");
  const title = truncateLine(`#${task.id} ${task.title}`, 72);
  return `• ${title}\n  ${meta}`;
}

function renderTasks(deps: TelegramCommandDeps, role: AuthRole, args: string[]): string {
  const parsed = parseTasksArgs(args, role);
  if (!parsed.ok) {
    return [
      `Members can list ${scopeLabel(WORK_SCOPE)} tasks only.`,
      `“${parsed.denied}” is admin-only — ask an admin or open the board.`,
      webLink(deps, "/work"),
    ].join("\n");
  }

  const { scope, statuses, page: requestedPage } = parsed.parsed;
  const all = deps.index.getTasks().filter((t) => statuses.includes(t.status));
  const page = paginate(all, requestedPage, deps.pageSize ?? DEFAULT_PAGE_SIZE);

  const lines: string[] = [
    `📋 ${deps.repositoryName} — tasks (${scopeLabel(scope)})`,
    showingLine(page),
  ];
  if (page.items.length === 0) {
    lines.push("No tasks in this scope.");
  } else {
    lines.push("");
    for (const task of page.items) lines.push(taskListLine(task));
    const hint = pagerHint(scope, page);
    if (hint) lines.push("", hint);
  }
  lines.push(webLink(deps, "/work"));
  return lines.join("\n");
}

function renderAgents(deps: TelegramCommandDeps): string {
  const running = deps.runner.running();
  const finished = deps.runner.recentlyFinished(FINISHED_LIST_LIMIT);
  const lines: string[] = [`🤖 ${deps.repositoryName} — agents`];

  if (running.length === 0) {
    lines.push("", "No agents running.");
  } else {
    lines.push("", `Running (${running.length})`);
    for (const agent of running.slice(0, AGENT_LIST_LIMIT)) {
      const started = shortUtc(agent.startedAt);
      lines.push(`• ${taskLabel(deps, agent.id)}${started ? ` — started ${started}` : ""}`);
    }
    const extra = running.length - AGENT_LIST_LIMIT;
    if (extra > 0) lines.push(`…and ${extra} more`);
  }

  if (finished.length > 0) {
    lines.push("", "Recently finished");
    for (const agent of finished) {
      const at = shortUtc(agent.at);
      const outcome = agent.clean ? "finished" : "ended with an error";
      lines.push(`• ${taskLabel(deps, agent.id)} — ${outcome}${at ? ` ${at}` : ""}`);
    }
  }

  lines.push(webLink(deps, "/agents"));
  return lines.join("\n");
}

function renderHelp(deps: TelegramCommandDeps, actor: TelegramActor): string {
  const lines: string[] = [
    `🤖 ${deps.repositoryName} — help`,
    `You are ${actor.role} (${actor.email}).`,
    "",
    "Read-only commands",
    "/status — repository overview",
    "/tasks [scope] [page] — list tasks (scope: work, or a status)",
    "/agents — running and recently finished agents",
    "/help — this message",
  ];

  if (actor.role === "admin") {
    lines.push(
      "",
      "Admin actions — start/pause agents, review, and settings — are not available from Telegram yet; use the web UI for now.",
    );
  } else {
    lines.push(
      "",
      "Your role is member, so the commands above are all that is available here. Creating tasks, starting or pausing agents, approving reviews, and changing settings are admin-only.",
    );
  }

  lines.push("", webLink(deps, "/work"));
  return lines.join("\n");
}

function renderCommandText(
  deps: TelegramCommandDeps,
  actor: TelegramActor,
  command: string,
  args: string[],
): string | null {
  switch (command) {
    case "status":
      return renderStatus(deps);
    case "tasks":
      return renderTasks(deps, actor.role, args);
    case "agents":
      return renderAgents(deps);
    case "help":
      return renderHelp(deps, actor);
    default:
      return null;
  }
}

/**
 * Per-chat serialization. A group burst can put several members' commands in
 * flight at once (notably over the webhook transport, which handles requests
 * concurrently), and a paginated reply is several items; without this, two
 * commands interleave their lines into an unreadable thread.
 */
function createChatQueue(): (chatId: number, task: () => Promise<void>) => Promise<void> {
  const chains = new Map<number, Promise<void>>();
  return (chatId, task) => {
    const previous = chains.get(chatId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const settled = run.finally(() => {
      if (chains.get(chatId) === settled) chains.delete(chatId);
    });
    chains.set(chatId, settled);
    return run;
  };
}

/**
 * Build the authorized-update handler for the read-only commands. Register it
 * as the intake `onAuthorized` callback; it ignores non-command updates
 * (callback queries and plain text belong to later Telegram tasks).
 */
export function createTelegramCommandHandler(deps: TelegramCommandDeps): TelegramAuthorizedHandler {
  const enqueue = createChatQueue();
  return async (update: TelegramUpdate, actor: TelegramActor) => {
    const message = update.message;
    if (!message || message.command === null) return;
    const command = message.command;
    if (SILENT_FALLTHROUGH_COMMANDS.has(command)) return;
    if (!(TELEGRAM_READ_COMMANDS as readonly string[]).includes(command)) {
      // Unknown command: point at what exists rather than staying silent.
      const text = renderHelp(deps, actor);
      await enqueue(message.chatId, async () => {
        await deps.send(message.chatId, clampMessage(text), {
          replyToMessageId: message.messageId,
        });
      });
      return;
    }

    const text = renderCommandText(deps, actor, command, message.commandArgs);
    if (text === null) return;
    await enqueue(message.chatId, async () => {
      await deps.send(message.chatId, clampMessage(text), {
        replyToMessageId: message.messageId,
      });
    });
  };
}
