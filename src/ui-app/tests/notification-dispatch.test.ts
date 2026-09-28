import { afterEach, describe, expect, it } from "vitest";
import type { RepoOSConfig, Task } from "../../core/types";
import { AuthStore } from "../../core/auth-store.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  dispatchNotification,
  notificationContextFromConfig,
  NtfyNotificationProvider,
  type NotificationPayload,
  type NotificationProvider,
} from "../../server/notifications/index.js";
import { TelegramNotificationProvider } from "../../server/notifications/telegram-provider.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import { LocalTelegramProvider } from "../../server/telegram/provider.js";
import { TelegramCredentialStore } from "../../server/telegram/store.js";
import { setTelegramProvider, resetTelegramProviders } from "../../server/telegram/index.js";

function config(root: string, over: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    telegram: { enabled: true },
    ntfyEnabled: true,
    ntfyTopic: "repoos_test",
    ...over,
  };
}

function task(): Task {
  return {
    id: "0042",
    title: "Fix the widget",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    priority: "p2",
    area: "ui",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    branch: "",
    tags: [],
    created_at: null,
    updated_at: null,
    releasedAt: null,
    path: "work/0042-fix.md",
    absPath: "/repo/work/0042-fix.md",
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: false,
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
  };
}

const samplePayload: NotificationPayload = {
  kind: "task.started",
  severity: "low",
  repositoryName: "repo",
  taskId: "1",
  taskTitle: "t",
  status: "active",
  summary: "s",
  link: "/work?task=1",
  headline: "▶️ Started",
};

describe("dispatchNotification", () => {
  it("does not throw when a provider throws during deliver", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-notif-dispatch-"));
    const ctx = notificationContextFromConfig(config(root), null);
    const boom: NotificationProvider = {
      id: "boom",
      isEnabled: () => true,
      deliver: () => {
        throw new Error("telegram down");
      },
    };
    expect(() => dispatchNotification(ctx, samplePayload, [boom])).not.toThrow();
  });

  it("dispatches to every enabled provider from one call", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-notif-dispatch-"));
    const ctx = notificationContextFromConfig(config(root), null);
    const seen: string[] = [];
    const a: NotificationProvider = {
      id: "a",
      isEnabled: () => true,
      deliver: () => {
        seen.push("a");
      },
    };
    const b: NotificationProvider = {
      id: "b",
      isEnabled: () => true,
      deliver: () => {
        seen.push("b");
      },
    };
    dispatchNotification(ctx, { ...samplePayload, kind: "task.created", headline: "🆕 New" }, [
      a,
      b,
    ]);
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("ntfy agent failure parity", () => {
  const sent: { body: string; headers: Record<string, string> }[] = [];
  afterEach(() => {
    sent.length = 0;
    // @ts-expect-error cleanup
    delete globalThis.fetch;
  });

  it("delivers Needs you for task.agent_failed", () => {
    // @ts-expect-error test stub
    globalThis.fetch = (
      _url: string,
      init: { body?: string; headers?: Record<string, string> },
    ) => {
      sent.push({ body: init?.body ?? "", headers: init?.headers ?? {} });
      return Promise.resolve({ ok: true, status: 200 });
    };
    const root = mkdtempSync(join(tmpdir(), "repoos-notif-agent-fail-"));
    const ctx = notificationContextFromConfig(
      config(root, { ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      null,
    );
    dispatchNotification(
      ctx,
      {
        kind: "task.agent_failed",
        severity: "high",
        repositoryName: "repo",
        taskId: "0042",
        taskTitle: "Fix the widget",
        status: "active",
        summary: "watchdog-stuck",
        link: "/work?task=0042",
        headline: "❌ Agent failed",
        subtitle: "Agent is waiting for your decision",
      },
      [new NtfyNotificationProvider()],
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("🙋 Needs you");
    expect(sent[0].headers.Priority).toBe("high");
  });
});

describe("notifyStatusChange + ntfy", () => {
  const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
  const stubFetch = (): void => {
    // @ts-expect-error test stub
    globalThis.fetch = (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      sent.push({ url, body: init?.body ?? "", headers: init?.headers ?? {} });
      return Promise.resolve({ ok: true, status: 200 });
    };
  };

  afterEach(() => {
    sent.length = 0;
    resetTelegramProviders();
    // @ts-expect-error cleanup
    delete globalThis.fetch;
  });

  it("still posts ntfy when a throwing telegram provider is also registered", () => {
    stubFetch();
    const root = mkdtempSync(join(tmpdir(), "repoos-notif-ntfy-"));
    const ctx = notificationContextFromConfig(
      config(root, { ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      null,
    );
    const throwingTelegram: NotificationProvider = {
      id: "telegram",
      isEnabled: () => true,
      deliver: () => {
        throw new Error("telegram outage");
      },
    };
    dispatchNotification(
      ctx,
      {
        kind: "task.started",
        severity: "low",
        repositoryName: "repo",
        taskId: task().id,
        taskTitle: task().title,
        status: task().status,
        summary: "s",
        link: "/work?task=0042",
        headline: "▶️ Started",
      },
      [new NtfyNotificationProvider(), throwingTelegram],
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe("▶️ Started · Fix the widget");
    expect(sent[0].headers.Priority).toBe("low");
  });
});

describe("TelegramNotificationProvider", () => {
  afterEach(() => {
    resetTelegramProviders();
    delete process.env.REPOOS_SECRET_STORE_KEY;
  });

  it("does not send to unbound chats or chats opted out of notifications", async () => {
    process.env.REPOOS_SECRET_STORE_KEY = Buffer.alloc(32, 7).toString("hex");
    const root = mkdtempSync(join(tmpdir(), "repoos-telegram-notif-"));
    const store = new AuthStore(root);
    expect(store.isAvailable()).toBe(true);

    const sends: number[] = [];
    const provider = new LocalTelegramProvider({
      resolveConfig: () => ({ enabled: true, provisioningUrl: "" }),
      root,
      repositoryName: "repo",
      store: new TelegramCredentialStore(root),
      createApi: () =>
        ({
          getMe: async () => ({
            id: 1,
            is_bot: true,
            first_name: "Bot",
            username: "bot",
          }),
          sendMessage: async (input: { chatId: number }) => {
            sends.push(input.chatId);
            return { message_id: 1, chat: { id: input.chatId } };
          },
        }) as never,
    });
    await provider.connectByBotToken("123456:ABCDEF");
    setTelegramProvider(root, provider);

    bindTelegramChatDirect(store, {
      telegramChatId: 10,
      chatType: "private",
      title: null,
      actorEmail: "admin@test.com",
    });
    store.setTelegramChatNotificationsEnabled(10, false);

    const ctx = notificationContextFromConfig(config(root), store, "http://127.0.0.1:7171");
    const telegram = new TelegramNotificationProvider();
    telegram.deliver(ctx, samplePayload);

    await new Promise((r) => setTimeout(r, 20));
    expect(sends).toEqual([]);

    store.setTelegramChatNotificationsEnabled(10, true);
    telegram.deliver(ctx, samplePayload);
    await new Promise((r) => setTimeout(r, 20));
    expect(sends).toEqual([10]);
  });
});
