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
import { createTelegramIntakeHandler } from "../../server/telegram/intake.js";
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
