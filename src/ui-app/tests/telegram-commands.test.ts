/**
 * Read-only Telegram commands (#0540): `/status`, `/tasks`, `/agents`, `/help`.
 *
 * Covers the acceptance criteria directly: all four render, `/help` is
 * role-aware, member query scoping is stated rather than discovered by refusal,
 * oversized lists paginate with an explicit count, group bursts do not
 * interleave, and the whole path stays behind the live-role intake gate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Status, Task } from "../../core/types.js";
import { AuthStore, getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import {
  createTelegramInvite,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  type TelegramInviteContext,
} from "../../core/telegram-identity.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import { createTelegramIntakeHandler } from "../../server/telegram/intake.js";
import {
  createTelegramCommandHandler,
  type TelegramCommandDeps,
} from "../../server/telegram/commands.js";
import { clampMessage, paginate } from "../../server/telegram/render.js";
import type { TelegramActor } from "../../server/telegram/actor.js";
import type { TelegramSendOptions, TelegramUpdate } from "../../server/telegram/types.js";
import { resetTelegramRateLimitersForTests } from "../../server/telegram/rate-limits.js";

const SECRET = "commands-test-secret";

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    title: `Task ${partial.id}`,
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "server",
    story: "",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "hello@repoos.org",
    branch: `feat/task-${partial.id}`,
    tags: [],
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    path: `work/${partial.id}.md`,
    absPath: `/repo/work/${partial.id}.md`,
    git: {
      branchExists: true,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    ...partial,
  } as Task;
}

function counts(tasks: Task[]): Record<Status, number> {
  const out = Object.fromEntries(
    (["draft", "inbox", "ready", "active", "review", "done"] as Status[]).map((s) => [s, 0]),
  ) as Record<Status, number>;
  for (const t of tasks) out[t.status]++;
  return out;
}

function commandUpdate(
  command: string,
  args: string[] = [],
  opts: { senderId?: number; chatId?: number } = {},
): TelegramUpdate {
  const senderId = opts.senderId ?? 1;
  const chatId = opts.chatId ?? senderId;
  return {
    updateId: 1,
    kind: "message",
    receivedAt: new Date().toISOString(),
    raw: {},
    message: {
      messageId: 10,
      chatId,
      chatType: "private",
      chatTitle: null,
      senderId,
      senderUsername: "tester",
      senderIsBot: false,
      text: `/${command}`,
      date: 0,
      command,
      commandArgs: args,
    },
  };
}

const ACTOR_ADMIN: TelegramActor = { email: "admin@test.com", role: "admin", telegramUserId: 1 };
const ACTOR_MEMBER: TelegramActor = { email: "member@test.com", role: "member", telegramUserId: 2 };

interface SentMessage {
  chatId: number;
  text: string;
  options?: TelegramSendOptions;
}

interface Harness {
  deps: TelegramCommandDeps;
  sent: SentMessage[];
  handler: ReturnType<typeof createTelegramCommandHandler>;
}

function harness(
  overrides: {
    tasks?: Task[];
    running?: { id: string; pid: number; startedAt: string }[];
    finished?: { id: string; at: string; clean: boolean }[];
    pageSize?: number;
    sendDelayMs?: number;
    events?: string[];
  } = {},
): Harness {
  const sent: SentMessage[] = [];
  const tasks = overrides.tasks ?? [];
  const deps: TelegramCommandDeps = {
    config: { root: "/tmp/repoos-tg-commands" },
    repositoryName: "RepoOS",
    index: {
      getTasks: (status?: Status) => (status ? tasks.filter((t) => t.status === status) : tasks),
      getTask: (id: string) => tasks.find((t) => t.id === id) ?? null,
      counts: () => counts(tasks),
    },
    runner: {
      running: () => overrides.running ?? [],
      recentlyFinished: () => overrides.finished ?? [],
    },
    reviews: { enabled: () => true, runningCount: () => 1 },
    ...(overrides.pageSize ? { pageSize: overrides.pageSize } : {}),
    send: async (chatId, text, options) => {
      overrides.events?.push(`start:${chatId}`);
      if (overrides.sendDelayMs) await new Promise((r) => setTimeout(r, overrides.sendDelayMs));
      sent.push({ chatId, text, options });
      overrides.events?.push(`end:${chatId}`);
    },
  };
  return { deps, sent, handler: createTelegramCommandHandler(deps) };
}

describe("createTelegramCommandHandler", () => {
  it("renders /status with counts, attention, and a web link", async () => {
    const { handler, sent } = harness({
      tasks: [
        task({ id: "0540", title: "Read-only commands" }),
        task({ id: "0541", title: "Guide chat", status: "review" }),
        task({ id: "0542", title: "Follow-ups", needsInput: true }),
      ],
    });
    await handler(commandUpdate("status"), ACTOR_ADMIN);
    expect(sent).toHaveLength(1);
    const text = sent[0].text;
    expect(text).toContain("RepoOS — status");
    expect(text).toContain("3 tasks");
    expect(text).toContain("Needs attention");
    // Reuses the shared notification specs for the same facts.
    expect(text).toContain("🙋 Needs you");
    expect(text).toContain("👀 In review");
    expect(text).toContain("/work");
  });

  it("excludes archived review/needs-input tasks from /status attention (#0657)", async () => {
    const { handler, sent } = harness({
      tasks: [
        task({ id: "0541", title: "Parked review", status: "review", isArchived: true }),
        task({ id: "0542", title: "Parked question", needsInput: true, isArchived: true }),
      ],
    });
    await handler(commandUpdate("status"), ACTOR_ADMIN);
    const text = sent[0].text;
    expect(text).not.toContain("Needs attention");
    expect(text).toContain("0 need you");
  });

  it("makes /help role-aware", async () => {
    const admin = harness();
    await admin.handler(commandUpdate("help"), ACTOR_ADMIN);
    const adminText = admin.sent[0].text;
    expect(adminText).toContain("You are admin (admin@test.com)");
    expect(adminText).toContain("Admin actions");

    const member = harness();
    await member.handler(commandUpdate("help"), ACTOR_MEMBER);
    const memberText = member.sent[0].text;
    expect(memberText).toContain("You are member (member@test.com)");
    expect(memberText).toContain("admin-only");
    expect(memberText).not.toBe(adminText);
  });

  it("lists tasks and paginates with an explicit count and a next-page hint", async () => {
    const tasks = Array.from({ length: 20 }, (_, i) =>
      task({ id: String(i + 1).padStart(4, "0"), title: `Task ${i + 1}` }),
    );
    const { handler, sent } = harness({ tasks, pageSize: 8 });

    await handler(commandUpdate("tasks"), ACTOR_MEMBER);
    const first = sent[0].text;
    expect(first).toContain("Showing 1–8 of 20");
    expect(first).toContain("More: /tasks work 2");

    await handler(commandUpdate("tasks", ["work", "2"]), ACTOR_MEMBER);
    const second = sent[1].text;
    expect(second).toContain("Showing 9–16 of 20");
    expect(second).toContain("/tasks work 1");
    expect(second).toContain("/tasks work 3");
  });

  it("tells a member which scopes are admin-only instead of silently refusing", async () => {
    const { handler, sent } = harness();
    await handler(commandUpdate("tasks", ["done"]), ACTOR_MEMBER);
    const text = sent[0].text;
    expect(text).toContain("Members can list active & review tasks only");
    expect(text).toContain("admin-only");
  });

  it("lets an admin query any status", async () => {
    const { handler, sent } = harness({
      tasks: [task({ id: "0001", status: "done" }), task({ id: "0002", status: "active" })],
    });
    await handler(commandUpdate("tasks", ["done"]), ACTOR_ADMIN);
    expect(sent[0].text).toContain("#0001");
    expect(sent[0].text).not.toContain("#0002");
  });

  it("lists running and recently finished agents", async () => {
    const { handler, sent } = harness({
      tasks: [task({ id: "0540", title: "Read-only commands" })],
      running: [{ id: "0540", pid: 123, startedAt: "2026-09-28T10:30:00Z" }],
      finished: [{ id: "0539", at: "2026-09-28T12:01:00Z", clean: true }],
    });
    await handler(commandUpdate("agents"), ACTOR_ADMIN);
    const text = sent[0].text;
    expect(text).toContain("Running (1)");
    expect(text).toContain("#0540 Read-only commands — started 10:30Z");
    expect(text).toContain("Recently finished");
    expect(text).toContain("#0539 — finished 12:01Z");
  });

  it("serializes concurrent commands in the same chat", async () => {
    const events: string[] = [];
    const { handler } = harness({ sendDelayMs: 15, events });

    await Promise.all([
      handler(commandUpdate("status", [], { chatId: 99, senderId: 1 }), ACTOR_ADMIN),
      handler(commandUpdate("help", [], { chatId: 99, senderId: 2 }), ACTOR_MEMBER),
    ]);

    expect(events).toEqual(["start:99", "end:99", "start:99", "end:99"]);
  });

  it("ignores non-command updates so later tasks own plain text", async () => {
    const { handler, sent } = harness();
    const update = commandUpdate("help", [], { chatId: 1 });
    update.message!.command = null;
    update.message!.text = "hello there";
    await handler(update, ACTOR_MEMBER);
    expect(sent).toHaveLength(0);
  });

  it("does not reply to slash commands owned by identity intake", async () => {
    const { handler, sent } = harness();
    await handler(commandUpdate("start"), ACTOR_MEMBER);
    await handler(commandUpdate("bind", ["abc"]), ACTOR_MEMBER);
    expect(sent).toHaveLength(0);
  });
});

describe("render helpers", () => {
  it("clamps an over-limit message with an explicit truncation notice", () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const clamped = clampMessage(text, 4096);
    expect(clamped.length).toBeLessThanOrEqual(4096);
    expect(clamped).toContain("message truncated at Telegram's length limit");
  });

  it("clamps pagination into range", () => {
    const page = paginate([1, 2, 3], 99, 2);
    expect(page.page).toBe(2);
    expect(page.items).toEqual([3]);
    expect(page.hasNext).toBe(false);
  });
});

describe("live-role gate integration", () => {
  let tmpDir: string;
  let store: AuthStore;
  let ctx: TelegramInviteContext;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `repoos-tg-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tmpDir, ".repoos"), { recursive: true });
    resetAuthStoreInstance();
    resetTelegramRateLimitersForTests();
    store = getAuthStore(tmpDir)!;
    ctx = {
      secret: SECRET,
      repoIdentity: repositoryIdentity(tmpDir),
      instanceIdentity: instanceIdentity(tmpDir),
      now: new Date("2026-01-15T12:00:00.000Z"),
    };
  });

  afterEach(() => {
    store.close();
    resetAuthStoreInstance();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function link(telegramUserId: number, email: string, role: "admin" | "member"): void {
    store.upsertUser(email, role, "admin@test.com");
    const created = createTelegramInvite(store, ctx, { email, createdBy: "admin@test.com" });
    if ("error" in created) throw new Error("invite");
    redeemTelegramInvite(store, ctx, { nonce: created.nonce, telegramUserId });
    // The intake path binds a private chat as a side effect of `/start <invite>`;
    // since these tests call the core redeem directly, bind it the same way.
    bindTelegramChatDirect(store, {
      telegramChatId: telegramUserId,
      chatType: "private",
      title: null,
      actorEmail: email,
    });
  }

  function intakeWith(sent: SentMessage[]): (update: TelegramUpdate) => Promise<void> {
    const deps: TelegramCommandDeps = {
      config: { root: tmpDir },
      repositoryName: "RepoOS",
      index: {
        getTasks: () => [],
        getTask: () => null,
        counts: () => counts([]),
      },
      runner: { running: () => [], recentlyFinished: () => [] },
      reviews: { enabled: () => false, runningCount: () => 0 },
      send: (chatId, text, options) => {
        sent.push({ chatId, text, options });
      },
    };
    const onAuthorized = createTelegramCommandHandler(deps);
    const handler = createTelegramIntakeHandler({
      root: tmpDir,
      authSessionSecret: SECRET,
      enabled: () => true,
      now: () => new Date("2026-01-15T12:00:00.000Z"),
      resolveBot: () => ({ id: 9001, username: "RepoBot" }),
      onAuthorized,
    });
    return handler as (update: TelegramUpdate) => Promise<void>;
  }

  it("answers an authorized sender and stays silent for an unbound one", async () => {
    link(7, "member@test.com", "member");
    const sent: SentMessage[] = [];
    const handle = intakeWith(sent);

    await handle(commandUpdate("help", [], { senderId: 7, chatId: 7 }));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("help");

    await handle(commandUpdate("help", [], { senderId: 8, chatId: 8 }));
    expect(sent).toHaveLength(1);
  });

  it("stays silent once the sender's allowlist row is deleted mid-session", async () => {
    link(7, "member@test.com", "member");
    const sent: SentMessage[] = [];
    const handle = intakeWith(sent);

    await handle(commandUpdate("status", [], { senderId: 7, chatId: 7 }));
    expect(sent).toHaveLength(1);

    store.deleteUser("member@test.com");
    await handle(commandUpdate("status", [], { senderId: 7, chatId: 7 }));
    expect(sent).toHaveLength(1);
  });

  it("keeps the group trigger rules: only the addressed bot gets a reply", async () => {
    link(7, "admin@test.com", "admin");
    // Bind the group as a chat so only the trigger rule is under test.
    bindTelegramChatDirect(store, {
      telegramChatId: -100,
      chatType: "supergroup",
      title: "Project",
      actorEmail: "admin@test.com",
    });
    const sent: SentMessage[] = [];
    const handle = intakeWith(sent);

    // Addressed to a different bot → not for us.
    const otherBot = commandUpdate("status", [], { senderId: 7, chatId: -100 });
    otherBot.message!.chatType = "supergroup";
    otherBot.message!.text = "/status@SomeOtherBot";
    await handle(otherBot);
    expect(sent).toHaveLength(0);

    // Addressed to this bot → answered.
    const addressed = commandUpdate("status", [], { senderId: 7, chatId: -100 });
    addressed.message!.chatType = "supergroup";
    addressed.message!.text = "/status@RepoBot";
    await handle(addressed);
    expect(sent).toHaveLength(1);
  });
});
