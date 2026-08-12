/**
 * ntfy notification decisions (#0134): which transitions produce a message,
 * that sending is gated on the enabled toggle + a non-empty topic, and that
 * the base URL honors NTFY_BASE_URL / ntfyBaseUrl with https://ntfy.sh as the
 * default. The publish itself is never exercised against a real endpoint.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { RepoOSConfig, Status, Task } from "../../core/types";
import {
  ntfyBaseUrl,
  ntfyMessageFor,
  notifyStatusChange,
  notifyTaskCreated,
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

describe("ntfyMessageFor", () => {
  it("returns a message for active -> review", () => {
    expect(ntfyMessageFor("active", "review", "Fix it")).toBe(
      'Task "Fix it" moved from active to review',
    );
  });

  it("returns a message for review -> done (approved)", () => {
    expect(ntfyMessageFor("review", "done", "Fix it")).toBe(
      'Task "Fix it" moved from review to done (review approved)',
    );
  });

  it("returns a message when review is returned with issues", () => {
    expect(ntfyMessageFor("review", "active", "Fix it")).toBe(
      'Task "Fix it" review returned with issues — moved back from review to active',
    );
    expect(ntfyMessageFor("review", "ready", "Fix it")).toBe(
      'Task "Fix it" review returned with issues — moved back from review to ready',
    );
  });

  it("returns null for transitions that do not warrant a notification", () => {
    for (const [prev, next] of [
      ["ready", "active"],
      ["inbox", "ready"],
      ["active", "active"],
      ["done", "active"],
      ["draft", "inbox"],
    ] as [Status, Status][]) {
      expect(ntfyMessageFor(prev, next, "Fix it")).toBeNull();
    }
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
  const sent: { url: string; body: string }[] = [];
  const stubFetch = (): void => {
    // @ts-expect-error — global fetch is not typed in the jsdom test env
    globalThis.fetch = (url: string, init: { body?: string }) => {
      sent.push({ url, body: init?.body ?? "" });
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

  it("posts a transition message to https://ntfy.sh/<topic> when enabled", () => {
    stubFetch();
    notifyStatusChange(
      config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }),
      task("Fix the widget"),
      "active",
      "review",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe('Task "Fix the widget" moved from active to review');
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

  it("does not send for transitions that produce no message", () => {
    stubFetch();
    notifyStatusChange(config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }), task(), "ready", "active");
    expect(sent).toHaveLength(0);
  });

  it("sends a created notification for a new task", () => {
    stubFetch();
    notifyTaskCreated(config({ ntfyEnabled: true, ntfyTopic: "repoos_test" }), task("Ship it"));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://ntfy.sh/repoos_test");
    expect(sent[0].body).toBe('Task "Ship it" created');
  });
});
