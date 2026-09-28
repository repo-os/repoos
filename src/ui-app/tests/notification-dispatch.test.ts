import { afterEach, describe, expect, it } from "vitest";
import type { RepoOSConfig, Task } from "../../core/types";
import { AuthStore } from "../../core/auth-store.js";
import { bindTelegramChatDirect } from "../../core/telegram-chat.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  dispatchNotification,
  notificationContextFromConfig,
  notifyStatusChange,
  type NotificationPayload,
  type NotificationProvider,
} from "../../server/notifications/index.js";
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
    const payload: NotificationPayload = {
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
    expect(() => dispatchNotification(ctx, payload, [boom])).not.toThrow();
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
    dispatchNotification(
      ctx,
      {
        kind: "task.created",
        severity: "low",
        repositoryName: "r",
        taskId: "1",
        taskTitle: "t",
        status: "inbox",
        summary: "s",
        link: "/work?task=1",
        headline: "🆕 New",
      },
      [a, b],
    );
    expect(seen).toEqual(["a", "b"]);
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
    // @ts-expect-error cleanup
    delete globalThis.fetch;
  });

  it("still posts ntfy with unchanged body and priority when telegram also runs", () => {
    stubFetch();
    const root = mkdtempSync(join(tmpdir(), "repoos-notif-ntfy-"));
    const store = new AuthStore(root);
    expect(store.isAvailable()).toBe(true);
    bindTelegramChatDirect(store, {
      telegramChatId: 99,
      chatType: "private",
      title: null,
      actorEmail: "admin@test.com",
    });
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
          sendMessage: async () => {
            throw new Error("telegram outage");
          },
        }) as never,
    });
    setTelegramProvider(root, provider);
    const ctx = notificationContextFromConfig(
      config(root, { ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      store,
    );
    notifyStatusChange(ctx, task(), "ready", "active");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe("▶️ Started · Fix the widget");
    expect(sent[0].headers.Priority).toBe("low");
    resetTelegramProviders();
  });
});
