/**
 * Task-agent follow-ups and needs-input answers over Telegram (#0542).
 *
 * Drives the FULL intake pipeline (`createTelegramIntakeHandler` wired with
 * the agent-chat handler as `onAuthorized`), so every test also exercises the
 * live role resolution, chat binding, and audit rows the command sits upon.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore, getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import { parseTask } from "../../core/task.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { Logger } from "../../core/logger.js";
import {
  TELEGRAM_AUDIT,
  createTelegramInvite,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  type TelegramInviteContext,
} from "../../core/telegram-identity.js";
import {
  createTelegramAgentChatHandler,
  type TelegramAgentChatOptions,
} from "../../server/telegram/agent-chat.js";
import { createTelegramCommandHandler } from "../../server/telegram/commands.js";
import {
  bootstrapTelegramAtBoot,
  resetTelegramProviders,
  setTelegramProvider,
} from "../../server/telegram/index.js";
import { LocalTelegramProvider } from "../../server/telegram/provider.js";
import { TelegramCredentialStore } from "../../server/telegram/store.js";
import {
  createTelegramIntakeHandler,
  type TelegramAuthorizedHandler,
} from "../../server/telegram/intake.js";
import {
  resetTelegramRateLimitersForTests,
  tryAcquireTelegramAgentLimits,
} from "../../server/telegram/rate-limits.js";
import type { TelegramUpdate } from "../../server/telegram/types.js";

const SECRET = "agent-chat-test-secret";

let root: string;
let store: AuthStore;
let inviteCtx: TelegramInviteContext;

function repoConfig(): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function taskFixture(over: Partial<Task> = {}): Task {
  const absPath = join(root, "work", "0042-fix.md");
  return {
    id: "0042",
    title: "Fix the widget",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "feat/fix-the-widget",
    tags: [],
    created_at: null,
    updated_at: null,
    releasedAt: null,
    path: "work/0042-fix.md",
    absPath,
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...over,
  };
}

interface SentTurn {
  id: string;
  text: string;
}

interface IndexStub {
  getTask(id: string): Task | null;
  applyFileChange(absPath: string, opts?: { guarded?: boolean }): void | Promise<void>;
}

interface RunnerStub {
  output(id: string): unknown;
  send(
    id: string,
    text: string,
    agent: unknown,
    opts: unknown,
  ): { ok: boolean; busy?: boolean; queued?: boolean; reason?: string; pid?: number };
  /** Optional: present when the stub doubles as the read-command runner. */
  running?: () => Array<{ id: string; startedAt: string }>;
  recentlyFinished?: () => Array<{ id: string; at: string; clean: boolean }>;
}

interface Harness {
  replies: Array<{ chatId: number; text: string }>;
  sent: SentTurn[];
  intake(update: TelegramUpdate): void | Promise<void>;
}

function makeHarness(opts: { runnerOverrides?: Partial<RunnerStub>; index?: IndexStub }): Harness {
  const index: IndexStub =
    opts.index ??
    (() => {
      const tasks = new Map<string, Task>([["0042", taskFixture()]]);
      return {
        getTask: (id) => tasks.get(id) ?? null,
        applyFileChange: () => {},
      };
    })();

  const sent: SentTurn[] = [];
  const runner: RunnerStub = {
    output: () => ({ id: "0042", lines: [] }),
    send: (id, text, _agent, _opts) => {
      sent.push({ id, text });
      return { ok: true, pid: 99 };
    },
    ...opts.runnerOverrides,
  };

  const replies: Array<{ chatId: number; text: string }> = [];
  const onAuthorized = createTelegramAgentChatHandler({
    config: repoConfig(),
    index,
    runner: runner as unknown as TelegramAgentChatOptions["runner"],
    logger: new Logger({ root }),
    reply: async (chatId, text) => {
      replies.push({ chatId, text });
    },
  });
  const intake = createTelegramIntakeHandler({
    root,
    authSessionSecret: SECRET,
    enabled: () => true,
    onAuthorized,
  });
  return {
    replies,
    sent,
    intake: (update) => intake(update),
  };
}

/**
 * The #0540 command handler with the #0542 agent-chat handler wired as its
 * `agentChat` disposition — the actual production composition.
 */
function composedCommandHarness(opts: { runnerOverrides?: Partial<RunnerStub>; tasks?: Task[] }): {
  sent: SentTurn[];
  replies: Array<{ chatId: number; text: string }>;
  commandReplies: string[];
  intake(update: TelegramUpdate): void | Promise<void>;
} {
  const tasks = new Map<string, Task>((opts.tasks ?? [taskFixture()]).map((t) => [t.id, t]));
  const sent: SentTurn[] = [];
  const runner: RunnerStub = {
    output: () => ({ id: "0042", lines: [] }),
    send: (id, text, _agent, _opts) => {
      sent.push({ id, text });
      return { ok: true, pid: 99 };
    },
    running: () => [],
    recentlyFinished: () => [],
    ...opts.runnerOverrides,
  };
  const replies: Array<{ chatId: number; text: string }> = [];
  const commandReplies: string[] = [];
  const agentChat: TelegramAuthorizedHandler = createTelegramAgentChatHandler({
    config: repoConfig(),
    index: { getTask: (id) => tasks.get(id) ?? null, applyFileChange: () => {} },
    runner: runner as unknown as TelegramAgentChatOptions["runner"],
    logger: new Logger({ root }),
    reply: async (chatId, text) => {
      replies.push({ chatId, text });
    },
  });
  const commandHandler = createTelegramCommandHandler({
    config: { root },
    repositoryName: "RepoOS",
    index: {
      getTasks: () => [...tasks.values()],
      getTask: (id) => tasks.get(id) ?? null,
      counts: () => ({ active: 1, review: 0, done: 0, inbox: 0, ready: 0, draft: 0 }),
    },
    runner: runner as unknown as never,
    reviews: { enabled: () => true, runningCount: () => 0 },
    send: async (_chatId, text) => {
      commandReplies.push(text);
    },
    agentChat,
  });
  const intake = createTelegramIntakeHandler({
    root,
    authSessionSecret: SECRET,
    enabled: () => true,
    onAuthorized: commandHandler,
  });
  return {
    sent,
    replies,
    commandReplies,
    intake: (update) => intake(update),
  };
}

function messageUpdate(
  partial: Partial<TelegramUpdate["message"]> & { senderId: number; chatId: number; text: string },
): TelegramUpdate {
  return {
    updateId: 1,
    kind: "message",
    receivedAt: new Date().toISOString(),
    raw: {},
    message: {
      messageId: 1,
      chatType: "private",
      chatTitle: null,
      senderUsername: null,
      senderIsBot: false,
      date: 0,
      command: null,
      commandArgs: [],
      ...partial,
    },
  };
}

function msgUpdate(senderId: number, chatId: number, text: string): TelegramUpdate {
  const args = text
    .replace(/^\/msg/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return messageUpdate({
    senderId,
    chatId,
    text,
    command: "msg",
    commandArgs: args,
  });
}

function setupRoot(): void {
  root = mkdtempSync(join(tmpdir(), "repoos-tg-agent-chat-"));
  mkdirSync(join(root, ".repoos"), { recursive: true });
  resetAuthStoreInstance();
  resetTelegramRateLimitersForTests();
  store = getAuthStore(root)!;
  inviteCtx = {
    secret: SECRET,
    repoIdentity: repositoryIdentity(root),
    instanceIdentity: instanceIdentity(root),
  };
}

function teardownRoot(): void {
  store.close();
  resetAuthStoreInstance();
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function allow(email: string, role: "admin" | "member"): void {
  store.upsertUser(email, role, "owner@test.com");
}

/** Bind an allowlisted email to a Telegram user + private chat, admin or member. */
function bindUser(email: string, role: "admin" | "member", telegramUserId: number): void {
  allow(email, role);
  const created = createTelegramInvite(store, inviteCtx, {
    email,
    createdBy: "owner@test.com",
  });
  if ("error" in created) throw new Error("invite creation failed");
  redeemTelegramInvite(store, inviteCtx, { nonce: created.nonce, telegramUserId });
  bindTelegramChatDirect(store, {
    telegramChatId: telegramUserId,
    chatType: "private",
    title: null,
    actorEmail: "owner@test.com",
  });
}

describe("task-agent follow-ups over Telegram (#0542)", () => {
  beforeEach(() => {
    setupRoot();
    mkdirSync(join(root, "work"), { recursive: true });
  });
  afterEach(teardownRoot);

  it("an admin can send a follow-up to an active task's agent", async () => {
    bindUser("admin@test.com", "admin", 42);
    const h = makeHarness({});
    await h.intake(msgUpdate(42, 42, "/msg 0042 keep the settings test out of this commit"));
    expect(h.sent).toEqual([{ id: "0042", text: "keep the settings test out of this commit" }]);
    expect(h.replies).toEqual([{ chatId: 42, text: "✅ Sent to the agent for #0042." }]);
    const audit = store.getAuditLog(10).find((e) => e.action === TELEGRAM_AUDIT.agentFollowUp);
    expect(audit?.actorEmail).toBe("admin@test.com");
    const details = JSON.parse(audit?.details ?? "{}");
    expect(details.outcome).toBe("sent");
    expect(details.taskId).toBe("0042");
  });

  it("canonicalizes #42 / 42 to the padded id #0042", async () => {
    bindUser("admin@test.com", "admin", 43);
    const h = makeHarness({});
    await h.intake(msgUpdate(43, 43, "/msg #42 unpadded still reaches the agent"));
    expect(h.sent).toEqual([{ id: "0042", text: "unpadded still reaches the agent" }]);
  });

  it("a member is refused before any lookup — replies never confirm an id", async () => {
    bindUser("member@test.com", "member", 44);
    const h = makeHarness({});
    await h.intake(msgUpdate(44, 44, "/msg 0042 hello"));
    await h.intake(msgUpdate(44, 44, "/msg 9999 hello"));
    expect(h.sent).toEqual([]);
    expect(h.replies).toHaveLength(2);
    expect(h.replies[0].text).toBe(h.replies[1].text);
    expect(h.replies[0].text).toContain("admin action");
    const refused = store
      .getAuditLog(10)
      .filter((e) => e.action === TELEGRAM_AUDIT.agentFollowUpRefused);
    expect(refused.length).toBe(2);
    expect(refused[0].actorEmail).toBe("member@test.com");
  });

  it("a demoted admin immediately loses the ability (live role resolution)", async () => {
    bindUser("promoted@test.com", "admin", 45);
    const h = makeHarness({});
    await h.intake(msgUpdate(45, 45, "/msg 0042 first"));
    expect(h.sent).toHaveLength(1);
    store.upsertUser("promoted@test.com", "member", "owner@test.com");
    await h.intake(msgUpdate(45, 45, "/msg 0042 second"));
    expect(h.sent).toHaveLength(1);
    expect(h.replies[1].text).toContain("admin action");
  });

  it("a task id from another repo is indistinguishable from a nonexistent one", async () => {
    bindUser("admin@test.com", "admin", 46);
    const h = makeHarness({});
    await h.intake(msgUpdate(46, 46, "/msg 98765 foreign id"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toBe("No task #98765 in this repository.");
    // Non-numeric input is a malformed command, not an id probe — usage reply.
    await h.intake(msgUpdate(46, 46, "/msg not-a-task hello"));
    expect(h.replies[1].text).toContain("/msg <task-id>");
    expect(h.sent).toEqual([]);
  });

  it("refuses to message an agent for a non-active task", async () => {
    bindUser("admin@test.com", "admin", 47);
    const tasks = new Map<string, Task>([["0042", taskFixture({ status: "review" })]]);
    const h = makeHarness({
      index: {
        getTask: (id) => tasks.get(id) ?? null,
        applyFileChange: () => {},
      },
    });
    await h.intake(msgUpdate(47, 47, "/msg 0042 hello"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toContain("is 'review'");
  });

  it("tells the sender when no agent conversation exists instead of dropping silently", async () => {
    bindUser("admin@test.com", "admin", 48);
    const h = makeHarness({ runnerOverrides: { output: () => null } });
    await h.intake(msgUpdate(48, 48, "/msg 0042 hello"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toContain("No agent conversation exists for #0042");
  });

  it("reports a busy agent rather than appearing to lose the message", async () => {
    bindUser("admin@test.com", "admin", 49);
    const h = makeHarness({
      runnerOverrides: {
        send: () => ({
          ok: false,
          busy: true,
          reason: "agent is busy — wait for the current turn or handoff to finish",
        }),
      },
    });
    await h.intake(msgUpdate(49, 49, "/msg 0042 hello"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toContain("can't take a message right now");
  });

  it("a queued accept is confirmed as queued", async () => {
    bindUser("admin@test.com", "admin", 50);
    const h = makeHarness({
      runnerOverrides: {
        send: () => ({ ok: true, queued: true, pid: undefined }),
      },
    });
    await h.intake(msgUpdate(50, 50, "/msg 0042 hello"));
    expect(h.replies[0].text).toContain("queued for a free slot");
  });

  it("enforces the agent rate limit before a turn is created", async () => {
    bindUser("admin@test.com", "admin", 51);
    // Commands bypass the intake's agent limiter (plain text only), so the
    // handler owns enforcement at the turn site — burn it here first.
    while (tryAcquireTelegramAgentLimits(51, 51)) {
      /* exhaust */
    }
    const h = makeHarness({});
    await h.intake(msgUpdate(51, 51, "/msg 0042 hello"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toContain("Rate limit");
  });

  it("replies with usage when the task id or message is missing", async () => {
    bindUser("admin@test.com", "admin", 52);
    const h = makeHarness({});
    await h.intake(msgUpdate(52, 52, "/msg"));
    await h.intake(msgUpdate(52, 52, "/msg 0042"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toContain("/msg <task-id>");
    expect(h.replies[1].text).toContain("/msg <task-id>");
  });

  it("other commands and plain text never reach the agent path", async () => {
    bindUser("admin@test.com", "admin", 53);
    const h = makeHarness({});
    await h.intake(messageUpdate({ senderId: 53, chatId: 53, text: "/status" }));
    await h.intake(messageUpdate({ senderId: 53, chatId: 53, text: "plain text question" }));
    await h.intake(messageUpdate({ senderId: 53, chatId: 53, text: "/start LeTwelveCharsOnly" }));
    expect(h.sent).toEqual([]);
    expect(h.replies).toEqual([]);
  });

  it("an over-padded ref is looked up exactly, never reinterpreted (#00042 ≠ #0042)", async () => {
    bindUser("admin@test.com", "admin", 54);
    const h = makeHarness({});
    await h.intake(msgUpdate(54, 54, "/msg 00042 over-padded"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toBe("No task #00042 in this repository.");
  });
});

// ---------------------------------------------------------------------------
// The composition seam: /msg routes through the #0540 command handler, which
// is the intake's ONE onAuthorized consumer in production.
// ---------------------------------------------------------------------------

describe("/msg through the composed command handler (#0542 seam)", () => {
  beforeEach(() => {
    setupRoot();
    mkdirSync(join(root, "work"), { recursive: true });
  });
  afterEach(teardownRoot);

  it("routes /msg to the agent handler while /status still renders", async () => {
    bindUser("admin@test.com", "admin", 71);
    const h = composedCommandHarness({});
    await h.intake(msgUpdate(71, 71, "/msg 0042 keep the settings test out"));
    expect(h.sent).toEqual([{ id: "0042", text: "keep the settings test out" }]);
    expect(h.replies[0].text).toBe("✅ Sent to the agent for #0042.");
    // Reads still work through the same handler — a second onAuthorized
    // consumer would have killed one side or the other.
    const h2 = composedCommandHarness({});
    await h2.intake(
      messageUpdate({
        senderId: 71,
        chatId: 71,
        text: "/status",
        command: "status",
        commandArgs: [],
      }),
    );
    expect(h2.commandReplies).toHaveLength(1);
    expect(h2.commandReplies[0]).toContain("RepoOS — status");
    expect(h2.sent).toEqual([]);
  });

  it("a member is refused by the agent handler through the command path too", async () => {
    bindUser("member@test.com", "member", 72);
    const h = composedCommandHarness({});
    await h.intake(msgUpdate(72, 72, "/msg 0042 hello"));
    expect(h.sent).toEqual([]);
    expect(h.replies[0].text).toContain("admin action");
  });

  it("an unwired command handler treats /msg as an unknown command (help, no send)", async () => {
    bindUser("admin@test.com", "admin", 73);
    const tasks = new Map<string, Task>([["0042", taskFixture()]]);
    const sent: SentTurn[] = [];
    const helpSent: Array<{ chatId: number; text: string }> = [];
    const commandHandler = createTelegramCommandHandler({
      config: { root },
      repositoryName: "RepoOS",
      index: {
        getTasks: () => [...tasks.values()],
        getTask: (id) => tasks.get(id) ?? null,
        counts: () => ({ active: 1, review: 0, done: 0, inbox: 0, ready: 0, draft: 0 }),
      },
      runner: { running: () => [], recentlyFinished: () => [] } as never,
      reviews: { enabled: () => true, runningCount: () => 0 },
      send: async (chatId, text) => {
        helpSent.push({ chatId, text });
      },
    });
    const intake = createTelegramIntakeHandler({
      root,
      authSessionSecret: SECRET,
      enabled: () => true,
      onAuthorized: commandHandler,
    });
    await intake(msgUpdate(73, 73, "/msg 0042 hello"));
    expect(sent).toEqual([]);
    expect(helpSent).toHaveLength(1);
    // No agent reply happened — nothing was sent to an agent.
    expect(helpSent[0].text).toContain("Read-only commands");
  });

  it("/help advertises /msg for admins and states the member boundary", async () => {
    bindUser("admin@test.com", "admin", 74);
    bindUser("memberxyz@test.com", "member", 75);
    const tasks = new Map<string, Task>([["0042", taskFixture()]]);
    const commandReplies: string[] = [];
    const commandHandler = createTelegramCommandHandler({
      config: { root },
      repositoryName: "RepoOS",
      index: {
        getTasks: () => [...tasks.values()],
        getTask: (id) => tasks.get(id) ?? null,
        counts: () => ({ active: 1, review: 0, done: 0, inbox: 0, ready: 0, draft: 0 }),
      },
      runner: { running: () => [], recentlyFinished: () => [] } as never,
      reviews: { enabled: () => true, runningCount: () => 0 },
      send: async (_chatId, text) => {
        commandReplies.push(text);
      },
      agentChat: createTelegramAgentChatHandler({
        config: repoConfig(),
        index: { getTask: (id) => tasks.get(id) ?? null, applyFileChange: () => {} },
        runner: {
          output: () => ({}),
          send: () => ({ ok: true }),
        } as unknown as TelegramAgentChatOptions["runner"],
        logger: new Logger({ root }),
        reply: async () => {},
      }),
    });
    const adminActor = { email: "admin@test.com", role: "admin" as const, telegramUserId: 74 };
    const memberActor = {
      email: "memberxyz@test.com",
      role: "member" as const,
      telegramUserId: 75,
    };
    await commandHandler(
      messageUpdate({ senderId: 74, chatId: 74, text: "/help", command: "help", commandArgs: [] }),
      adminActor,
    );
    await commandHandler(
      messageUpdate({ senderId: 75, chatId: 75, text: "/help", command: "help", commandArgs: [] }),
      memberActor,
    );
    expect(commandReplies[0]).toContain("/msg <task-id>");
    expect(commandReplies[1]).toContain("Messaging a task's agent is an admin action");
  });
});

// ---------------------------------------------------------------------------
// Boot-level seam: the REAL bootstrapTelegramAtBoot registers ONE intake
// handler that serves both /status (read commands) and /msg (agent chat).
// ---------------------------------------------------------------------------

describe("bootstrapTelegramAtBoot composes /msg with the commands (#0542)", () => {
  beforeEach(() => {
    setupRoot();
    mkdirSync(join(root, "work"), { recursive: true });
    process.env.REPOOS_SECRET_STORE_KEY = Buffer.alloc(32, 7).toString("hex");
  });

  afterEach(() => {
    resetTelegramProviders();
    delete process.env.REPOOS_SECRET_STORE_KEY;
    teardownRoot();
  });

  interface BootHarness {
    sent: SentTurn[];
    providerSends: Array<{ chatId: number; text: string }>;
    raw(update: Record<string, unknown>): Promise<void>;
  }

  async function bootHarness(): Promise<BootHarness> {
    const tasks = new Map<string, Task>([["0042", taskFixture()]]);
    const sent: SentTurn[] = [];
    const providerSends: Array<{ chatId: number; text: string }> = [];
    const runner = {
      output: () => ({ id: "0042", lines: [] }),
      send: (id: string, text: string) => {
        sent.push({ id, text });
        return { ok: true, pid: 7 };
      },
      running: () => [],
      recentlyFinished: () => [],
    };
    // Inject a provider whose Bot API never leaves the process, and connect
    // it: send paths require a stored credential (`status().connected`).
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root,
      repositoryName: "RepoOS",
      store: new TelegramCredentialStore(root),
      createApi: () =>
        ({
          getMe: async () => ({ id: 1, is_bot: true, first_name: "Bot", username: "bot" }),
          sendMessage: async (input: { chatId: number; text: string }) => {
            providerSends.push({ chatId: input.chatId, text: input.text });
            return { message_id: 1, chat: { id: input.chatId } };
          },
        }) as never,
    });
    await provider.connectByBotToken("123456:ABCDEF");
    setTelegramProvider(root, provider);

    void bootstrapTelegramAtBoot(
      { ...repoConfig(), telegram: { enabled: true } },
      {
        index: {
          getTasks: () => [...tasks.values()],
          getTask: (id: string) => tasks.get(id) ?? null,
          counts: () => ({ active: 1, review: 0, done: 0, inbox: 0, ready: 0, draft: 0 }),
        } as never,
        runner: runner as never,
        reviews: { enabled: () => true, runningCount: () => 0 } as never,
        agentChat: { logger: new Logger({ root }) },
      },
    );

    return {
      sent,
      providerSends,
      raw: async (update) => {
        await provider.handleUpdate(update);
      },
    };
  }

  function rawMsg(senderId: number, text: string): Record<string, unknown> {
    return {
      update_id: senderId,
      message: {
        message_id: senderId,
        chat: { id: senderId, type: "private" },
        from: { id: senderId, is_bot: false, username: "u" },
        text,
        date: Math.floor(Date.now() / 1000),
      },
    };
  }

  it("serves /msg and /status through the single registered intake handler", async () => {
    bindUser("bootadmin@test.com", "admin", 81);
    const h = await bootHarness();

    await h.raw(rawMsg(81, "/msg 0042 boot-level follow-up"));
    expect(h.sent).toEqual([{ id: "0042", text: "boot-level follow-up" }]);
    expect(JSON.stringify(h.providerSends)).toContain("✅ Sent to the agent for #0042.");

    await h.raw(rawMsg(81, "/status"));
    // The wiring's repositoryName is projectDisplayName(config.root) — match
    // the shared "— status" suffix rather than a repo name.
    const reads = h.providerSends.filter((s) => s.text.includes("— status"));
    expect(reads).toHaveLength(1);
  });

  it("a member reaches /status but never /msg", async () => {
    bindUser("bootmember@test.com", "member", 82);
    const h = await bootHarness();
    await h.raw(rawMsg(82, "/msg 0042 tried"));
    await h.raw(rawMsg(82, "/status"));
    expect(h.sent).toEqual([]);
    const reads = h.providerSends.filter((s) => s.text.includes("— status"));
    expect(reads).toHaveLength(1);
    expect(JSON.stringify(h.providerSends)).toContain("admin action");
  });
});

// ---------------------------------------------------------------------------
// needs-input answering — real task file, real dismissal, real actor email
// ---------------------------------------------------------------------------

const NEEDS_INPUT_TASK = `---
id: "0042"
title: Waiting for the human
type: feature
status: active
needs_input: true
needs_input_reason: review-failed
questions:
  - "Which API should I use?"
---
## Problem

Body.

## Activity

- 2026-09-28T00:00:00Z · created
`;

describe("answering needs-input over Telegram (#0542)", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-tg-needs-input-"));
    mkdirSync(join(root, ".repoos"), { recursive: true });
    mkdirSync(join(root, "work"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
    writeFileSync(join(root, "work", "0042-waiting.md"), NEEDS_INPUT_TASK);
    resetAuthStoreInstance();
    resetTelegramRateLimitersForTests();
    store = getAuthStore(root)!;
    inviteCtx = {
      secret: SECRET,
      repoIdentity: repositoryIdentity(root),
      instanceIdentity: instanceIdentity(root),
    };
  });

  afterEach(teardownRoot);

  it("an admin's answer reaches the agent and clears the flag with their email as actor", async () => {
    bindUser("admin@test.com", "admin", 61);
    const absPath = join(root, "work", "0042-waiting.md");
    const task = parseTask({
      content: readFileSync(absPath, "utf8"),
      absPath,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });

    const sent: SentTurn[] = [];
    const runner: RunnerStub = {
      output: () => ({ id: task.id }),
      send: (id, text) => {
        sent.push({ id, text });
        return { ok: true, pid: 3 };
      },
    };
    const replies: Array<{ chatId: number; text: string }> = [];
    const onAuthorized = createTelegramAgentChatHandler({
      config: repoConfig(),
      index: {
        getTask: (id) => (id === task.id ? task : null),
        applyFileChange: () => {},
      },
      runner: runner as unknown as TelegramAgentChatOptions["runner"],
      logger: new Logger({ root }),
      reply: async (chatId, text) => {
        replies.push({ chatId, text });
      },
    });
    const intake = createTelegramIntakeHandler({
      root,
      authSessionSecret: SECRET,
      enabled: () => true,
      onAuthorized,
    });

    await intake(msgUpdate(61, 61, "/msg 0042 use the public API"));
    expect(sent).toEqual([{ id: "0042", text: "use the public API" }]);
    expect(replies[0].text).toBe("✅ Answer sent to the agent for #0042.");

    // The task file cleared the flag AND named the real actor.
    const onDisk = readFileSync(absPath, "utf8");
    expect(onDisk).not.toContain("needs_input: true");
    expect(onDisk).not.toContain("questions:");
    expect(onDisk).toContain("needs_input (review-failed) dismissed by admin@test.com");
    expect(onDisk).not.toMatch(/dismissed by "human"|\?\?\s*"human"/);

    const audit = store.getAuditLog(10).find((e) => e.action === TELEGRAM_AUDIT.agentFollowUp);
    expect(JSON.parse(audit?.details ?? "{}").answeredNeedsInput).toBe(true);
  });

  it("a failed delivery never clears the waiting flag", async () => {
    bindUser("admin@test.com", "admin", 62);
    const absPath = join(root, "work", "0042-waiting.md");
    const task = parseTask({
      content: readFileSync(absPath, "utf8"),
      absPath,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    const onAuthorized = createTelegramAgentChatHandler({
      config: repoConfig(),
      index: {
        getTask: (id) => (id === task.id ? task : null),
        applyFileChange: () => {},
      },
      runner: {
        output: () => ({ id: task.id }),
        send: () => ({ ok: false, busy: true, reason: "agent is busy" }),
      } as unknown as TelegramAgentChatOptions["runner"],
      logger: new Logger({ root }),
      reply: async () => {},
    });
    const intake = createTelegramIntakeHandler({
      root,
      authSessionSecret: SECRET,
      enabled: () => true,
      onAuthorized,
    });
    await intake(msgUpdate(62, 62, "/msg 0042 hello"));
    expect(readFileSync(absPath, "utf8")).toContain("needs_input: true");
  });
});

describe("parseTaskAgentCommand / canonicalTaskRef", () => {
  it("parses the message body with the bot username present", async () => {
    const { parseTaskAgentCommand, canonicalTaskRef } =
      await import("../../server/telegram/agent-chat.js");
    expect(parseTaskAgentCommand("/msg@repoos_bot 0042 please continue")).toEqual({
      taskRef: "0042",
      message: "please continue",
    });
    expect(parseTaskAgentCommand("/status")).toEqual({ taskRef: null, message: null });
    expect(canonicalTaskRef("#0542")).toBe("0542");
    expect(canonicalTaskRef("542")).toBe("0542");
    expect(canonicalTaskRef("task")).toBeNull();
  });
});
