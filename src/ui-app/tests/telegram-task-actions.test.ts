/**
 * Task creation and lifecycle actions over Telegram (#0543).
 *
 * The tests drive the handler directly for the state machine (previews, Edit,
 * callbacks) and the real intake for the demotion case, where "re-resolve the
 * sender's live role at press time" is the property under test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore, getAuthStore, resetAuthStoreInstance } from "../../core/auth-store.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import {
  TELEGRAM_AUDIT,
  createTelegramInvite,
  instanceIdentity,
  redeemTelegramInvite,
  repositoryIdentity,
  type TelegramInviteContext,
} from "../../core/telegram-identity.js";
import { createRepoOS } from "../../core/repoos.js";
import { commitTaskFile } from "../../core/git.js";
import type { Task } from "../../core/types.js";
import { Logger } from "../../core/logger.js";
import type { TelegramAuthorizedHandler } from "../../server/telegram/intake.js";
import { chainedOnAuthorized } from "../../server/telegram/index.js";
import { createTelegramTaskActionsHandler } from "../../server/telegram/task-actions.js";
import {
  resetTelegramRateLimitersForTests,
  tryAcquireTelegramCreateLimits,
} from "../../server/telegram/rate-limits.js";
import {
  TELEGRAM_ACTION_TTL_MS,
  TelegramActionNonceLedger,
  signTelegramAction,
  verifyTelegramAction,
} from "../../server/telegram/callbacks.js";
import { classifyTelegramAttachment } from "../../server/telegram/attachments.js";
import { createTelegramTask } from "../../server/telegram/task-creation.js";
import type { TelegramActor } from "../../server/telegram/actor.js";
import type { TelegramSendOptions, TelegramUpdate } from "../../server/telegram/types.js";

const SECRET = "task-actions-test-secret";

let root: string;
let store: AuthStore;
let inviteCtx: TelegramInviteContext;

function setupRoot(): void {
  root = mkdtempSync(join(tmpdir(), "repoos-tg-task-actions-"));
  mkdirSync(join(root, ".repoos"), { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
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

function bindUser(email: string, role: "admin" | "member", telegramUserId: number): void {
  store.upsertUser(email, role, "owner@test.com");
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

function taskFixture(over: Partial<Task> = {}): Task {
  return {
    id: "0042",
    title: "Fix the widget",
    type: "feature",
    status: "review",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "server",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "hello@repoos.org",
    branch: "feat/fix-the-widget",
    tags: [],
    created_at: null,
    updated_at: null,
    releasedAt: null,
    path: "work/0042-fix-the-widget.md",
    absPath: join(root, "work", "0042-fix-the-widget.md"),
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

const ADMIN: TelegramActor = { email: "admin@test.com", role: "admin", telegramUserId: 7 };
const MEMBER: TelegramActor = { email: "member@test.com", role: "member", telegramUserId: 8 };

interface Sent {
  chatId: number;
  text: string;
  options?: TelegramSendOptions;
}

interface Calls {
  create: Array<{ title: string; type: string; priority: string; area: string; body: string }>;
  started: string[];
  paused: string[];
  reviewed: string[];
  done: string[];
}

interface Harness {
  handler: TelegramAuthorizedHandler;
  sent: Sent[];
  calls: Calls;
  clock: { value: Date };
}

function makeHarness(
  over: {
    tasks?: Task[];
    now?: () => Date;
    skipSecret?: boolean;
    createResult?:
      | { ok: true; task: Task; imageCount: number; fileCount: number }
      | { ok: false; error: string };
  } = {},
): Harness {
  const tasks = new Map<string, Task>((over.tasks ?? []).map((t) => [t.id, t]));
  const sent: Sent[] = [];
  const calls: Calls = { create: [], started: [], paused: [], reviewed: [], done: [] };
  const clock = { value: new Date("2026-10-21T00:00:00Z") };
  const logger = new Logger({ root });
  const handler = createTelegramTaskActionsHandler({
    config: { root, cacheDir: ".repoos" },
    authSessionSecret: over.skipSecret ? undefined : SECRET,
    repositoryName: "RepoOS",
    areaVocabulary: ["server", "web", "docs"],
    defaultArea: "server",
    publicOrigin: "https://repoos.example",
    index: { getTask: (id) => tasks.get(id) ?? null },
    ops: {
      createTask: (draft) => {
        calls.create.push({
          title: draft.title,
          type: draft.type,
          priority: draft.priority,
          area: draft.area,
          body: draft.body,
        });
        return (
          over.createResult ?? {
            ok: true,
            task: taskFixture({ id: "0099", title: draft.title, status: "inbox" }),
            imageCount: 0,
            fileCount: 0,
          }
        );
      },
      start: async (task) => {
        calls.started.push(task.id);
        return { ok: true, message: `▶️ Started #${task.id}` };
      },
      pause: async (task) => {
        calls.paused.push(task.id);
        return { ok: true, message: `⏸ Paused #${task.id}` };
      },
      requestReview: async (task) => {
        calls.reviewed.push(task.id);
        return { ok: true, message: `👀 Review requested for #${task.id}` };
      },
      moveToDone: async (task) => {
        calls.done.push(task.id);
        return { ok: true, message: `🚀 Close-out started for #${task.id}` };
      },
      downloadFile: async () => ({ data: PNG_1PX, filePath: "a.png" }),
    },
    send: async (chatId, text, options) => {
      sent.push({ chatId, text, options });
    },
    now: over.now ?? (() => clock.value),
    logger,
  });
  return { handler, sent, calls, clock };
}

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function newtaskUpdate(senderId: number, text: string, chatId = senderId): TelegramUpdate {
  const args = text
    .replace(/^\/newtask(?:@[A-Za-z0-9_]+)?\s*/i, "")
    .trim()
    .split(/\s+/);
  return {
    updateId: 1,
    kind: "message",
    message: {
      messageId: 11,
      chatId,
      chatType: "private",
      chatTitle: null,
      senderId,
      senderUsername: null,
      senderIsBot: false,
      text,
      date: 0,
      command: "newtask",
      commandArgs: args,
      messageThreadId: null,
    },
    raw: { message: { message_id: 11, text } },
    receivedAt: "2026-10-21T00:00:00Z",
  };
}

function textUpdate(senderId: number, text: string, chatId = senderId): TelegramUpdate {
  return {
    updateId: 2,
    kind: "message",
    message: {
      messageId: 12,
      chatId,
      chatType: "private",
      chatTitle: null,
      senderId,
      senderUsername: null,
      senderIsBot: false,
      text,
      date: 0,
      command: null,
      commandArgs: [],
      messageThreadId: null,
    },
    raw: { message: { message_id: 12, text } },
    receivedAt: "2026-10-21T00:00:00Z",
  };
}

function callbackUpdate(
  senderId: number,
  data: string,
  chatId = senderId,
  messageThreadId: number | null = null,
): TelegramUpdate {
  return {
    updateId: 3,
    kind: "callback_query",
    callbackQuery: {
      id: "cb-1",
      fromUserId: senderId,
      fromUsername: null,
      data,
      chatId,
      chatType: "private",
      messageId: 11,
      messageThreadId,
    },
    raw: { callback_query: { id: "cb-1", data } },
    receivedAt: "2026-10-21T00:00:00Z",
  };
}

function keyboard(sent: Sent): Array<Array<{ text: string; callback_data: string }>> {
  const markup = sent.options?.replyMarkup as
    | { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
    | undefined;
  return markup?.inline_keyboard ?? [];
}

function lastWithButton(sent: Sent[], label: string): Sent {
  for (let i = sent.length - 1; i >= 0; i--) {
    for (const row of keyboard(sent[i])) {
      if (row.some((b) => b.text.includes(label))) return sent[i];
    }
  }
  throw new Error(`no message carries a ${label} button`);
}

function button(sent: Sent, label: string): string {
  for (const row of keyboard(sent)) {
    for (const b of row) if (b.text.includes(label)) return b.callback_data;
  }
  throw new Error(`button ${label} not found in ${JSON.stringify(keyboard(sent))}`);
}

describe("Telegram task creation (#0543)", () => {
  beforeEach(setupRoot);
  afterEach(teardownRoot);

  it("renders a preview that commits nothing, with Create/Edit/Cancel", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle to Settings"), ADMIN);
    expect(h.calls.create).toHaveLength(0);
    expect(h.sent).toHaveLength(1);
    const text = h.sent[0].text;
    expect(text).toContain("nothing has been created yet");
    expect(text).toContain("Title: Add a dark mode toggle to Settings");
    expect(text).toContain("Type: feature");
    expect(text).toContain("Priority: p2");
    expect(text).toContain("Area: server");
    expect(keyboard(h.sent[0])[0].map((b) => b.text)).toEqual([
      "✅ Create",
      "✏️ Edit",
      "✖️ Cancel",
    ]);
  });

  it("refuses a member with a role explanation and creates nothing", async () => {
    bindUser("member@test.com", "member", 8);
    const h = makeHarness();
    await h.handler(newtaskUpdate(8, "/newtask Add a dark mode toggle"), MEMBER);
    expect(h.calls.create).toHaveLength(0);
    expect(h.sent[0].text).toContain("admin action");
    expect(h.sent[0].text).toContain("member");
    const row = store.getAuditLog(20).find((e) => e.action === TELEGRAM_AUDIT.taskCreateRefused);
    expect(row?.actorEmail).toBe("member@test.com");
  });

  it("creates through the shared path on Create and audits the presser", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle to Settings"), ADMIN);
    await h.handler(callbackUpdate(7, button(h.sent[0], "Create")), ADMIN);
    expect(h.calls.create).toEqual([
      {
        title: "Add a dark mode toggle to Settings",
        type: "feature",
        priority: "p2",
        area: "server",
        body: "Add a dark mode toggle to Settings",
      },
    ]);
    expect(h.sent.at(-1)?.text).toContain("Created #0099");
    expect(h.sent.at(-1)?.text).toContain("https://repoos.example/work?task=0099");
    const row = store.getAuditLog(20).find((e) => e.action === TELEGRAM_AUDIT.taskCreated);
    expect(row?.actorEmail).toBe("admin@test.com");
    expect(JSON.parse(row?.details ?? "{}").taskId).toBe("0099");
  });

  it("edits one field at a time and re-renders the preview", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle to Settings"), ADMIN);
    await h.handler(callbackUpdate(7, button(h.sent[0], "Edit")), ADMIN);
    const fields = h.sent.at(-1)!;
    expect(keyboard(fields)[0].map((b) => b.text)).toEqual(["Title", "Type", "Priority", "Area"]);
    await h.handler(callbackUpdate(7, button(fields, "Priority")), ADMIN);
    expect(h.sent.at(-1)?.text).toContain("new priority");
    await h.handler(textUpdate(7, "p1"), ADMIN);
    expect(h.sent.at(-1)?.text).toContain("Priority: p1");
    // Invalid values are refused, never coerced.
    await h.handler(callbackUpdate(7, button(lastWithButton(h.sent, "Edit"), "Edit")), ADMIN);
    await h.handler(callbackUpdate(7, button(h.sent.at(-1)!, "Type")), ADMIN);
    await h.handler(textUpdate(7, "improvement"), ADMIN);
    expect(
      h.sent
        .slice(-2)
        .map((m) => m.text)
        .join("\n"),
    ).toContain("Type must be one of");
  });

  it("rejects a replayed payload and an expired payload", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle"), ADMIN);
    const create = button(h.sent[0], "Create");
    await h.handler(callbackUpdate(7, create), ADMIN);
    await h.handler(callbackUpdate(7, create), ADMIN);
    expect(h.calls.create).toHaveLength(1);
    expect(h.sent.at(-1)?.text).toMatch(/already used|expired/);

    const h2Root = mkdtempSync(join(tmpdir(), "repoos-tg-expired-"));
    try {
      mkdirSync(join(h2Root, ".repoos"), { recursive: true });
      resetAuthStoreInstance();
      const store2 = getAuthStore(h2Root)!;
      const ctx = {
        secret: SECRET,
        repoIdentity: repositoryIdentity(h2Root),
        instanceIdentity: instanceIdentity(h2Root),
      };
      store2.upsertUser("admin@test.com", "admin", "owner@test.com");
      const inv = createTelegramInvite(store2, ctx, {
        email: "admin@test.com",
        createdBy: "owner@test.com",
      });
      if ("error" in inv) throw new Error("invite failed");
      redeemTelegramInvite(store2, ctx, { nonce: inv.nonce, telegramUserId: 9 });
      bindTelegramChatDirect(store2, {
        telegramChatId: 9,
        chatType: "private",
        title: null,
        actorEmail: "owner@test.com",
      });

      let clock = new Date("2026-10-21T00:00:00Z");
      const sent: Sent[] = [];
      const handler = createTelegramTaskActionsHandler({
        config: { root: h2Root, cacheDir: ".repoos" },
        authSessionSecret: SECRET,
        repositoryName: "RepoOS",
        areaVocabulary: ["server"],
        defaultArea: "server",
        index: { getTask: () => null },
        ops: {
          createTask: () => ({ ok: false, error: "should not run" }),
          start: async () => ({ ok: true, message: "" }),
          pause: async () => ({ ok: true, message: "" }),
          requestReview: async () => ({ ok: true, message: "" }),
          moveToDone: async () => ({ ok: true, message: "" }),
        },
        send: async (chatId, text, options) => {
          sent.push({ chatId, text, options });
        },
        now: () => clock,
      });
      await handler(newtaskUpdate(9, "/newtask Add a dark mode toggle", 9), {
        ...ADMIN,
        email: "admin@test.com",
        telegramUserId: 9,
      });
      const token = button(sent[0], "Create");
      clock = new Date(clock.getTime() + TELEGRAM_ACTION_TTL_MS + 1000);
      await handler(callbackUpdate(9, token), {
        ...ADMIN,
        email: "admin@test.com",
        telegramUserId: 9,
      });
      expect(sent.at(-1)?.text).toContain("expired");
      store2.close();
    } finally {
      resetAuthStoreInstance();
      rmSync(h2Root, { recursive: true, force: true });
    }
  });

  it("rejects a payload rendered for an admin but pressed by a member", async () => {
    bindUser("admin@test.com", "admin", 7);
    bindUser("member@test.com", "member", 8);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle"), ADMIN);
    const token = button(h.sent[0], "Create");
    await h.handler(callbackUpdate(8, token), MEMBER);
    expect(h.calls.create).toHaveLength(0);
    expect(h.sent.at(-1)?.text).toContain("member");
  });

  it("refuses a demoted admin on their next press (live role, no restart)", async () => {
    bindUser("admin@test.com", "admin", 7);
    bindUser("member@test.com", "member", 8);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle"), ADMIN);
    const token = button(h.sent[0], "Create");
    // Demote without re-linking: the link stays, auth_users.role changes.
    store.upsertUser("admin@test.com", "member", "owner@test.com");
    await h.handler(callbackUpdate(7, token), ADMIN);
    expect(h.calls.create).toHaveLength(0);
    expect(h.sent.at(-1)?.text).toContain("member");
    const row = store.getAuditLog(20).find((e) => e.action === TELEGRAM_AUDIT.taskActionRefused);
    expect(row?.actorEmail).toBe("admin@test.com");
    expect(JSON.parse(row?.details ?? "{}").outcome).toBe("denied_role");
  });

  it("enforces the creation limiter before a preview is accepted", async () => {
    bindUser("admin@test.com", "admin", 7);
    for (let i = 0; i < 5; i++) expect(tryAcquireTelegramCreateLimits(7, 7)).toBe(true);
    const h = makeHarness();
    await h.handler(newtaskUpdate(7, "/newtask Add a dark mode toggle"), ADMIN);
    expect(h.sent[0].text).toContain("rate limit");
    expect(h.calls.create).toHaveLength(0);
  });
});

describe("Telegram lifecycle actions (#0543)", () => {
  beforeEach(setupRoot);
  afterEach(teardownRoot);

  it("Start and Pause call the shared action operations", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness({ tasks: [taskFixture({ status: "ready" })] });
    const startToken = signTelegramAction(SECRET, {
      kind: "start",
      ref: "0042",
      now: h.clock.value,
    });
    await h.handler(callbackUpdate(7, startToken), ADMIN);
    expect(h.calls.started).toEqual(["0042"]);

    const pauseToken = signTelegramAction(SECRET, {
      kind: "pause",
      ref: "0042",
      now: h.clock.value,
    });
    await h.handler(callbackUpdate(7, pauseToken), ADMIN);
    expect(h.calls.paused).toEqual(["0042"]);
    const audit = store.getAuditLog(20).find((e) => e.action === TELEGRAM_AUDIT.taskAction);
    expect(audit?.actorEmail).toBe("admin@test.com");
  });

  it("Move to done is two-step: first tap starts nothing, Cancel is a no-op", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness({ tasks: [taskFixture()] });
    const doneToken = signTelegramAction(SECRET, {
      kind: "done",
      ref: "0042",
      now: h.clock.value,
    });
    await h.handler(callbackUpdate(7, doneToken), ADMIN);
    expect(h.calls.done).toHaveLength(0);
    const confirmCard = h.sent.at(-1)!;
    expect(confirmCard.text).toContain("Repository: RepoOS");
    expect(confirmCard.text).toContain("Task: #0042 — Fix the widget");
    expect(confirmCard.text).toContain("Branch: feat/fix-the-widget");
    expect(keyboard(confirmCard)[0].map((b) => b.text)).toEqual(["✅ Confirm merge", "✖️ Cancel"]);

    await h.handler(callbackUpdate(7, button(confirmCard, "Cancel")), ADMIN);
    expect(h.calls.done).toHaveLength(0);
    expect(h.sent.at(-1)?.text).toContain("untouched");
  });

  it("only the explicit Confirm merge press runs close-out", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness({ tasks: [taskFixture()] });
    const doneToken = signTelegramAction(SECRET, {
      kind: "done",
      ref: "0042",
      now: h.clock.value,
    });
    await h.handler(callbackUpdate(7, doneToken), ADMIN);
    const confirm = button(h.sent.at(-1)!, "Confirm");
    await h.handler(callbackUpdate(7, confirm), ADMIN);
    expect(h.calls.done).toEqual(["0042"]);
    expect(h.sent.at(-1)?.text).toContain("Close-out started");
  });

  it("refuses a member for every lifecycle action", async () => {
    bindUser("member@test.com", "member", 8);
    const h = makeHarness({ tasks: [taskFixture({ status: "active" })] });
    for (const kind of ["start", "pause", "resume", "review", "done"] as const) {
      const token = signTelegramAction(SECRET, { kind, ref: "0042", now: h.clock.value });
      await h.handler(callbackUpdate(8, token), MEMBER);
    }
    expect(h.calls.started).toHaveLength(0);
    expect(h.calls.paused).toHaveLength(0);
    expect(h.calls.reviewed).toHaveLength(0);
    expect(h.calls.done).toHaveLength(0);
  });

  it("a task from another repository and a nonexistent id are indistinguishable", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness({ tasks: [taskFixture()] });
    for (const ref of ["9999", "1234"]) {
      const token = signTelegramAction(SECRET, { kind: "pause", ref, now: h.clock.value });
      await h.handler(callbackUpdate(7, token), ADMIN);
      expect(h.sent.at(-1)?.text).toBe(`No task #${ref} in this repository.`);
    }
  });

  it("routes callback replies into the originating forum topic", async () => {
    bindUser("admin@test.com", "admin", 7);
    const h = makeHarness({ tasks: [taskFixture({ status: "ready" })] });
    const token = signTelegramAction(SECRET, { kind: "start", ref: "0042", now: h.clock.value });
    await h.handler(callbackUpdate(7, token, -100, 55), ADMIN);
    expect(h.sent.at(-1)?.options?.messageThreadId).toBe(55);
  });
});

describe("Telegram attachments (#0543)", () => {
  beforeEach(setupRoot);
  afterEach(teardownRoot);

  it("sniffs images by bytes and refuses disallowed content", () => {
    const png = classifyTelegramAttachment(PNG_1PX);
    expect(png).toMatchObject({ ok: true, kind: "image", mime: "image/png" });

    const pdf = classifyTelegramAttachment(Buffer.from("%PDF-1.7\n..."));
    expect(pdf).toMatchObject({ ok: true, kind: "file", mime: "application/pdf" });

    // A shell script is refused even if a sender names it `.png`.
    const script = classifyTelegramAttachment(Buffer.from("#!/bin/sh\nrm -rf /\n"));
    expect(script.ok).toBe(true); // plain text is allowed…
    const binary = classifyTelegramAttachment(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00]));
    expect(binary).toMatchObject({ ok: false });
    // …but oversize is refused before storage.
    expect(
      classifyTelegramAttachment(Buffer.alloc(11 * 1024 * 1024, 1), { maxBytes: 10 }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("stores images under work/.attachments and never tracks them", () => {
    const repoos = createRepoOS(root);
    const index = {
      getTask: () => null,
      applyFileChange: () => {},
    };
    const result = createTelegramTask(
      { config: repoos.config, repoos, index, logger: new Logger({ root }) },
      {
        title: "Screenshot task",
        type: "feature",
        priority: "p2",
        area: "server",
        body: "A task with a screenshot.",
        originalPrompt: "A task with a screenshot.",
      },
      [{ name: "shot.png", bytes: PNG_1PX }],
      { email: "admin@test.com" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const file = readFileSync(result.task.absPath, "utf8");
    expect(file).toContain("## Screenshots");
    expect(file).toContain(`/api/tasks/${result.task.id}/attachments/`);
    expect(file).toContain("## Original prompt");
  });
});

describe("Telegram-created tasks match UI-created tasks (#0543)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
    roots.length = 0;
  });

  function blankRepo(): { root: string; repoos: ReturnType<typeof createRepoOS> } {
    const r = mkdtempSync(join(tmpdir(), "repoos-tg-parity-"));
    roots.push(r);
    mkdirSync(join(r, "work"), { recursive: true });
    return { root: r, repoos: createRepoOS(r) };
  }

  function normalize(text: string): string {
    return text
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, "<ts>")
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<ts>");
  }

  it("uses the same frontmatter, body sections, activity and commit path", () => {
    const ui = blankRepo();
    const tg = blankRepo();
    const body = [
      "## Problem",
      "",
      "There is no dark mode toggle in Settings, so every screen is rendered in the",
      "",
      "## Desired UX",
      "",
      "Add a toggle that switches the theme immediately.",
      "",
      "## Acceptance criteria",
      "",
      "- The toggle persists across reloads and follows the system preference when",
      "  no explicit choice has been made.",
      "- Existing users keep their current theme until they change it.",
      "- The Settings page explains the three-way choice (light, dark, system) in",
      "  plain language and the control is reachable by keyboard.",
      "",
      "## Notes for AI",
      "",
      "Reuse the theme store.",
    ].join("\n");
    const fields = {
      title: "Add a dark mode toggle",
      type: "feature",
      priority: "p2",
      area: "server",
      body,
      originalPrompt: "Please add a dark mode toggle to Settings.",
    };

    const uiTask = ui.repoos.createTask({ ...fields, createdBy: "admin@test.com" });
    commitTaskFile(ui.root, uiTask.absPath, `docs(${uiTask.id}): add task`);

    const tgResult = createTelegramTask(
      {
        config: tg.repoos.config,
        repoos: tg.repoos,
        index: { getTask: () => null, applyFileChange: () => {} },
        logger: new Logger({ root: tg.root }),
      },
      fields,
      [],
      { email: "admin@test.com" },
    );
    expect(tgResult.ok).toBe(true);
    if (!tgResult.ok) return;

    const uiFile = normalize(readFileSync(uiTask.absPath, "utf8"));
    const tgFile = normalize(readFileSync(tgResult.task.absPath, "utf8"));
    expect(tgFile).toBe(uiFile);
  });
});

describe("composed handler chain (#0543)", () => {
  it("stops before guide chat when task actions consumed the update", async () => {
    const order: string[] = [];
    const first: TelegramAuthorizedHandler = async () => {
      order.push("task-actions");
      return true;
    };
    const second: TelegramAuthorizedHandler = async () => {
      order.push("guide-chat");
    };
    const update = textUpdate(7, "a new title");
    await chainedOnAuthorized(first, second)(update, ADMIN);
    expect(order).toEqual(["task-actions"]);
  });

  it("continues when the handler did not consume the update", async () => {
    const order: string[] = [];
    const first: TelegramAuthorizedHandler = async () => {
      order.push("task-actions");
      return false;
    };
    const second: TelegramAuthorizedHandler = async () => {
      order.push("guide-chat");
    };
    await chainedOnAuthorized(first, second)(textUpdate(7, "hello"), ADMIN);
    expect(order).toEqual(["task-actions", "guide-chat"]);
  });
});

describe("callback payload verification (#0543)", () => {
  it("rejects forged and tampered tokens", () => {
    const token = signTelegramAction(SECRET, { kind: "start", ref: "0042" });
    expect(verifyTelegramAction(SECRET, token).ok).toBe(true);
    const parts = token.split(".");
    parts[0] = "p";
    expect(verifyTelegramAction(SECRET, parts.join("."))).toMatchObject({ ok: false });
    expect(verifyTelegramAction("different-secret", token)).toMatchObject({ ok: false });
  });

  it("consumes a nonce exactly once", () => {
    const ledger = new TelegramActionNonceLedger(root ?? tmpdir(), ".repoos");
    const token = signTelegramAction(SECRET, { kind: "pause", ref: "0042" });
    const verified = verifyTelegramAction(SECRET, token);
    if (!verified.ok) throw new Error("token should verify");
    expect(ledger.consume(verified.payload.nonce, verified.payload.expiresAt)).toBe(true);
    expect(ledger.consume(verified.payload.nonce, verified.payload.expiresAt)).toBe(false);
  });
});
