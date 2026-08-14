/**
 * ntfy notification redesign (#0161): scannable one-line notifications with
 * emoji + short event + title, priority tiers, and create+start dedup. Tests
 * verify which transitions produce notifications, the new message format, title
 * truncation, priority headers, and the optional subtitle for "Needs you".
 * Sending is gated on the enabled toggle + a non-empty topic. The publish
 * itself is never exercised against a real endpoint.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { RepoOSConfig, Status, Task } from "../../core/types";
import {
  ntfyBaseUrl,
  notificationForStatusChange,
  notificationForTaskCreated,
  notificationForNeedsInput,
  formatNotification,
  notifyStatusChange,
  notifyTaskCreated,
  notifyNeedsInput,
} from "../../server/ntfy";

function config(over: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root: "/repo",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ...over,
  };
}

function task(title = "Fix the widget"): Task {
  return {
    id: "0042",
    title,
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

describe("notificationForStatusChange", () => {
  it("returns Started for ready -> active with low priority", () => {
    const spec = notificationForStatusChange("ready", "active");
    expect(spec).toEqual({ headline: "▶️ Started", priority: "low" });
  });

  it("returns Done for active -> done with low priority", () => {
    const spec = notificationForStatusChange("active", "done");
    expect(spec).toEqual({ headline: "✅ Done", priority: "low" });
  });

  it("returns Done for review -> done with low priority", () => {
    const spec = notificationForStatusChange("review", "done");
    expect(spec).toEqual({ headline: "✅ Done", priority: "low" });
  });

  it("returns null for transitions that do not warrant a notification", () => {
    for (const [prev, next] of [
      ["inbox", "ready"],
      ["active", "active"],
      ["done", "active"],
      ["draft", "inbox"],
      ["active", "review"],
      ["review", "active"],
    ] as [Status, Status][]) {
      expect(notificationForStatusChange(prev, next)).toBeNull();
    }
  });
});

describe("notificationForTaskCreated", () => {
  it("returns New with low priority", () => {
    const spec = notificationForTaskCreated();
    expect(spec).toEqual({ headline: "🆕 New", priority: "low" });
  });
});

describe("notificationForNeedsInput", () => {
  it("returns Needs you with high priority and subtitle", () => {
    const spec = notificationForNeedsInput();
    expect(spec).toEqual({
      headline: "🙋 Needs you",
      priority: "high",
      subtitle: "Agent is waiting for your decision",
    });
  });
});

describe("formatNotification", () => {
  it("formats a simple notification as emoji + event · title", () => {
    const spec = { headline: "▶️ Started", priority: "low" as const };
    const msg = formatNotification(spec, "Add file tree navigation");
    expect(msg).toBe("▶️ Started · Add file tree navigation");
  });

  it("truncates long titles to fit on one line", () => {
    const spec = { headline: "▶️ Started", priority: "low" as const };
    const longTitle = "Add file tree navigation and refresh button and context menu to context page and activity log";
    const msg = formatNotification(spec, longTitle);
    expect(msg.length).toBeLessThanOrEqual(60); // ~50 char target + some buffer
    expect(msg).toContain("…");
    expect(msg.startsWith("▶️ Started · ")).toBe(true);
  });

  it("includes subtitle on a second line when provided", () => {
    const spec = {
      headline: "🙋 Needs you",
      priority: "high" as const,
      subtitle: "Agent is waiting for your decision",
    };
    const msg = formatNotification(spec, "Pick auth method");
    expect(msg).toBe("🙋 Needs you · Pick auth method\nAgent is waiting for your decision");
  });
});

describe("ntfyBaseUrl", () => {
  afterEach(() => {
    delete process.env.NTFY_BASE_URL;
  });

  it("defaults to https://ntfy.sh", () => {
    expect(ntfyBaseUrl(config())).toBe("https://ntfy.sh");
  });

  it("uses the configured ntfyBaseUrl when set", () => {
    expect(ntfyBaseUrl(config({ ntfyBaseUrl: "https://ntfy.example.com" }))).toBe(
      "https://ntfy.example.com",
    );
  });

  it("lets NTFY_BASE_URL win over the config key", () => {
    process.env.NTFY_BASE_URL = "https://ntfy.local";
    expect(ntfyBaseUrl(config({ ntfyBaseUrl: "https://ntfy.example.com" }))).toBe(
      "https://ntfy.local",
    );
  });

  it("strips a trailing slash", () => {
    expect(ntfyBaseUrl(config({ ntfyBaseUrl: "https://ntfy.example.com/" }))).toBe(
      "https://ntfy.example.com",
    );
  });
});

describe("notifyStatusChange / notifyTaskCreated", () => {
  const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
  const stubFetch = (): void => {
    // @ts-expect-error — global fetch is not typed in the jsdom test env
    globalThis.fetch = (url: string, init: { body?: string; headers?: Record<string, string> }) => {
      sent.push({ url, body: init?.body ?? "", headers: init?.headers ?? {} });
      return Promise.resolve({ ok: true, status: 200 });
    };
  };

  afterEach(() => {
    sent.length = 0;
    // @ts-expect-error — remove the stub so other tests see the real fetch
    delete globalThis.fetch;
  });

  it("never sends when the toggle is off", () => {
    stubFetch();
    const cfg = config({ ntfyEnabled: false, ntfyTopic: "repoos_test" });
    notifyStatusChange(cfg, task(), "active", "review");
    notifyTaskCreated(cfg, task());
    expect(sent).toHaveLength(0);
  });

  it("never sends when the topic is empty", () => {
    stubFetch();
    const cfg = config({ ntfyEnabled: true, ntfyTopic: "" });
    notifyStatusChange(cfg, task(), "active", "review");
    notifyTaskCreated(cfg, task());
    expect(sent).toHaveLength(0);
  });

  it("sends Started notification to https://ntfy.sh/<topic> with low priority", () => {
    stubFetch();
    notifyStatusChange(
      config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      task("Add file tree navigation"),
      "ready",
      "active",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe("▶️ Started · Add file tree navigation");
    expect(sent[0].headers.Priority).toBe("low");
  });

  it("sends Done notification with low priority", () => {
    stubFetch();
    notifyStatusChange(
      config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      task("Fix the widget"),
      "active",
      "done",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe("✅ Done · Fix the widget");
    expect(sent[0].headers.Priority).toBe("low");
  });

  it("posts to a configured base URL when set", () => {
    stubFetch();
    notifyStatusChange(
      config({ ntfyEnabled: true, ntfyTopic: "repoos_test", ntfyBaseUrl: "https://ntfy.example.com" }),
      task(),
      "review",
      "done",
    );
    expect(sent[0].url).toBe("https://ntfy.example.com/repoos_test");
  });

  it("sends New notification for a created task with low priority", () => {
    stubFetch();
    notifyTaskCreated(config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }), task("Ship it"));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe("🆕 New · Ship it");
    expect(sent[0].headers.Priority).toBe("low");
  });

  it("sends Needs you notification with high priority and subtitle", () => {
    stubFetch();
    notifyNeedsInput(
      config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      task("Fix the widget"),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe("🙋 Needs you · Fix the widget\nAgent is waiting for your decision");
    expect(sent[0].headers.Priority).toBe("high");
  });

  it("never sends needs input notification when disabled", () => {
    stubFetch();
    notifyNeedsInput(config({ ntfyEnabled: false, ntfyTopic: "repoos_test" }), task());
    expect(sent).toHaveLength(0);
  });

  it("never sends needs input notification when topic is empty", () => {
    stubFetch();
    notifyNeedsInput(config({ ntfyEnabled: true, ntfyTopic: "" }), task());
    expect(sent).toHaveLength(0);
  });
});
