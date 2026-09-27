/**
 * The story panel's PM chat routes (#0515): `POST /api/stories/:key/pm/message`,
 * `…/pm/interrupt` and `GET …/pm/output`, plus the session→story registry the
 * `agent.exited` hook uses to clear the "PM is working" indicator.
 *
 * These are the story counterparts of the task panel's three PM routes, so the
 * assertions are about the same contract: a per-story, per-user session key, a
 * resume-or-start split, and an indicator that is raised on accept and cleared
 * on every exit path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Agent, RepoOSConfig } from "../../core/types";
import {
  clearStoryPmChat,
  isStoryPmWorking,
  markStoryPmChat,
  setStoryPmWorking,
  writeStoryDefinition,
} from "../../core/story-definition-files";
import { storyPmSessionId } from "../../core/stories";
import { getStoryPmOutput, pmStoryInterrupt, pmStoryMessage } from "../../server/routes/stories";
import type { RouteContext } from "../../server/routes/types";

const dirs: string[] = [];
/** Every session key the lifecycle tests below use, for draining. */
const SESSIONS = [
  "pm-story-v1:0001",
  "pm-story-v1:0001::a@example.com",
  "pm-story-v1:0001::b@example.com",
  "pm-story-v1:0002",
  "0001",
];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  // The PM registry is process-global by design, so reset it between tests
  // rather than letting one test's live session explain another's failure.
  for (const session of SESSIONS) clearStoryPmChat(session);
  setStoryPmWorking("stories/alpha-slice.md", false);
});

function setup(storiesEnabled = true): { config: RepoOSConfig; storyPath: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-story-pm-chat-"));
  dirs.push(root);
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    stories: { enabled: storiesEnabled },
  };
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(root, "work", "0001-fixture.md"),
    `---\nid: "0001"\ntitle: Wire the list\ntype: feature\nstatus: ready\nstory: Alpha slice\n---\nBody\n`,
  );
  writeFileSync(
    join(root, "work", "0002-fixture.md"),
    `---\nid: "0002"\ntitle: Tag only work\ntype: feature\nstatus: ready\nstory: Tag only\n---\nBody\n`,
  );
  const story = writeStoryDefinition(config, {
    name: "Alpha slice",
    body: "Ship the email list.",
    createdBy: "hello@repoos.org",
  });
  return { config, storyPath: story.path };
}

interface StartChatCall {
  sessionId: string;
  text: string;
  context: string;
  /** The mission as the runner would build it, by calling the prompt builder. */
  mission: string;
}

const PM_AGENT = {
  name: "pm",
  cli: "claude code",
  model: "x",
  enabled: true,
  instructions: "Own the roadmap.",
} as unknown as Agent;

/**
 * Minimal AgentRunner stand-in — records what the route asked it to run.
 * `lines` undefined means no live session for any id, i.e. every first turn is
 * a cold start; pass them to exercise the resume path.
 */
function fakeRunner(calls: StartChatCall[], lines?: string[]) {
  return {
    output: vi.fn((id: string) => (lines && id === "pm-story-v1:0001" ? { lines } : undefined)),
    // The 5th argument is a prompt *builder* (as in the task PM route), so
    // call it here to assert on the mission the agent would actually receive.
    startChat: vi.fn(
      (
        sessionId: string,
        text: string,
        _agent: unknown,
        context: string,
        mission: (request: string, ctx: string, agent: Agent) => string,
      ) => {
        calls.push({ sessionId, text, context, mission: mission(text, context, PM_AGENT) });
        return { ok: true, pid: 4242 };
      },
    ),
    send: vi.fn(() => ({ ok: true, pid: 4242 })),
    interrupt: vi.fn((id: string) => ({ stopped: true, sessionId: id })),
    stats: vi.fn(() => ({ pid: 4242 })),
  };
}

function context(config: RepoOSConfig, calls: StartChatCall[], lines?: string[]) {
  const runner = fakeRunner(calls, lines);
  return {
    ctx: {
      config,
      index: {
        getTasks: () => [
          {
            id: "0001",
            title: "Wire the list",
            status: "ready",
            story: "Alpha slice",
            body: "",
            needsInput: false,
          },
          // A second tag with no definition file: the tag-only story case.
          {
            id: "0002",
            title: "Tag only work",
            status: "ready",
            story: "Tag only",
            body: "",
            needsInput: false,
          },
        ],
        getTask: () => null,
      },
      runner,
      logger: { task: vi.fn(), system: vi.fn() },
      emitEvent: vi.fn(),
    } as unknown as RouteContext,
    runner,
  };
}

function req(body: unknown): IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
}

function res() {
  const out: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
  const fake = {
    writeHead(status: number) {
      out.status = status;
    },
    end(payload: string) {
      out.body = JSON.parse(payload);
    },
  } as unknown as ServerResponse;
  return { fake, out };
}

const KEY = encodeURIComponent("alpha slice");

describe("story PM chat message route (#0515)", () => {
  it("starts a PM chat keyed by the story's number and hands it the story context", async () => {
    const { config, storyPath } = setup();
    const calls: StartChatCall[] = [];
    const { ctx } = context(config, calls);
    const { fake, out } = res();

    await pmStoryMessage(ctx, req({ text: "Break this down." }), fake, { param1: KEY });

    expect(out.status).toBe(200);
    expect(calls).toHaveLength(1);
    // Same shape as a task PM chat: `pm-task-v2:0042`, here `pm-story-v1:0042`.
    expect(calls[0]!.sessionId).toBe(storyPmSessionId("alpha slice", "0001"));
    expect(calls[0]!.sessionId).toBe("pm-story-v1:0001");
    expect(calls[0]!.text).toBe("Break this down.");
    // The mission is the story PM prompt, and the context names the story, its
    // definition path, its progress and its member tasks.
    expect(calls[0]!.mission).toContain("Product Manager for RepoOS");
    expect(calls[0]!.context).toContain("Story #0001: Alpha slice");
    expect(calls[0]!.context).toContain(storyPath);
    expect(calls[0]!.context).toContain("#0001 · ready · Wire the list");
    // …and the registry lets the agent.exited hook clear the indicator again.
    expect(isStoryPmWorking(storyPath)).toBe(true);
    expect(clearStoryPmChat(calls[0]!.sessionId)).toBe(storyPath);
    expect(isStoryPmWorking(storyPath)).toBe(false);
  });

  it("applies the story PM tab's cli/model override to the agent that runs the turn", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls);
    const { fake, out } = res();

    await pmStoryMessage(
      ctx,
      req({
        text: "Break this down.",
        cliOverride: "opencode",
        modelOverride: "opencode/big-pickle",
      }),
      fake,
      { param1: KEY },
    );

    expect(out.status).toBe(200);
    const agent = runner.startChat.mock.calls[0]![2] as unknown as Agent;
    expect(agent.name).toBe("pm");
    expect(agent.cli).toBe("opencode");
    expect(agent.model).toBe("opencode/big-pickle");
  });

  it("ignores the 'default' model sentinel and keeps the configured pm agent's model", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls);
    const { fake } = res();

    await pmStoryMessage(ctx, req({ text: "Hi.", modelOverride: "default" }), fake, {
      param1: KEY,
    });

    const agent = runner.startChat.mock.calls[0]![2] as unknown as Agent;
    expect(agent.model).not.toBe("default");
  });

  it("refuses antigravity for a story chat (no worktree to run it in)", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls);
    const { fake, out } = res();

    await pmStoryMessage(ctx, req({ text: "Hi.", cliOverride: "antigravity" }), fake, {
      param1: KEY,
    });

    expect(out.status).toBe(400);
    expect(String(out.body.error)).toContain("Antigravity");
    expect(runner.startChat).not.toHaveBeenCalled();
  });

  it("resumes an existing conversation instead of starting a second one", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls, ["earlier turn"]);
    const { fake, out } = res();

    await pmStoryMessage(ctx, req({ text: "And now?" }), fake, { param1: KEY });

    expect(runner.startChat).not.toHaveBeenCalled();
    expect(runner.send).toHaveBeenCalledTimes(1);
    expect(out.status).toBe(200);
  });

  it("rejects an empty message without starting anything", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls);
    const { fake, out } = res();

    await pmStoryMessage(ctx, req({ text: "   " }), fake, { param1: KEY });

    expect(out.status).toBe(400);
    expect(runner.startChat).not.toHaveBeenCalled();
  });

  it("404s an unknown story key rather than opening a phantom conversation", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls);
    const { fake, out } = res();

    await pmStoryMessage(ctx, req({ text: "hi" }), fake, {
      param1: encodeURIComponent("no such story"),
    });

    expect(out.status).toBe(404);
    expect(runner.startChat).not.toHaveBeenCalled();
  });

  it("404s every story route when the feature is off", async () => {
    const { config } = setup(false);
    const calls: StartChatCall[] = [];
    const { ctx } = context(config, calls);
    const { fake, out } = res();

    await pmStoryMessage(ctx, req({ text: "hi" }), fake, { param1: KEY });
    expect(out.status).toBe(404);
  });

  it("reaches a tag-only story, which has a key but no number", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx } = context(config, calls);
    const { fake, out } = res();

    // No definition file carries this key, so the session falls back to a slug
    // of it rather than a number.
    await pmStoryMessage(ctx, req({ text: "hi" }), fake, {
      param1: encodeURIComponent("Tag only"),
    });

    expect(out.status).toBe(200);
    expect(calls[0]!.sessionId).toBe("pm-story-v1:tag-only");
    expect(calls[0]!.context).toContain("not registered (tag-only)");
  });
});

describe("story PM chat output and interrupt routes (#0515)", () => {
  it("returns the retained transcript for the story's own session", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx } = context(config, calls, ["a", "b"]);
    const { fake, out } = res();

    await getStoryPmOutput(ctx, req({}), fake, { param1: KEY });

    expect(out.status).toBe(200);
    expect(out.body.lines).toEqual(["a", "b"]);
  });

  it("interrupts the story's session, not a task's", async () => {
    const { config } = setup();
    const calls: StartChatCall[] = [];
    const { ctx, runner } = context(config, calls);
    const { fake, out } = res();

    await pmStoryInterrupt(ctx, req({}), fake, { param1: KEY });

    expect(out.status).toBe(200);
    expect(runner.interrupt).toHaveBeenCalledWith("pm-story-v1:0001");
  });
});

describe("story PM chat lifecycle (#0515)", () => {
  it("clears one session and reports the story it was about", () => {
    markStoryPmChat("pm-story-v1:0001::a@example.com", "stories/alpha-slice.md");
    expect(isStoryPmWorking("stories/alpha-slice.md")).toBe(true);

    // The exit hook clears unconditionally — the entry is per session, so this
    // cannot disturb a concurrent one — and gets the path back to re-evaluate.
    expect(clearStoryPmChat("pm-story-v1:0001::a@example.com")).toBe("stories/alpha-slice.md");
    expect(isStoryPmWorking("stories/alpha-slice.md")).toBe(false);
    // Idempotent, and unknown sessions are simply not ours.
    expect(clearStoryPmChat("pm-story-v1:0001::a@example.com")).toBeNull();
    expect(clearStoryPmChat("0001")).toBeNull();
    expect(clearStoryPmChat("pm-task-v2:0001")).toBeNull();
  });

  it("does not leak: the map holds exactly the live sessions", () => {
    markStoryPmChat("pm-story-v1:0001::a@example.com", "stories/alpha-slice.md");
    markStoryPmChat("pm-story-v1:0001::b@example.com", "stories/alpha-slice.md");
    clearStoryPmChat("pm-story-v1:0001::a@example.com");
    // The surviving session is still tracked, and clearing it empties the map —
    // the regression this guards: a never-cleared map grew one entry per
    // story/user session for the process lifetime.
    expect(clearStoryPmChat("pm-story-v1:0001::b@example.com")).toBe("stories/alpha-slice.md");
    expect(isStoryPmWorking("stories/alpha-slice.md")).toBe(false);
  });

  it("keeps the indicator up while another session is still running", () => {
    // This is the bug: one user exiting must not hide another user's turn.
    markStoryPmChat("pm-story-v1:0001::a@example.com", "stories/alpha-slice.md");
    markStoryPmChat("pm-story-v1:0001::b@example.com", "stories/alpha-slice.md");

    clearStoryPmChat("pm-story-v1:0001::a@example.com");
    expect(isStoryPmWorking("stories/alpha-slice.md")).toBe(true);

    clearStoryPmChat("pm-story-v1:0001::b@example.com");
    expect(isStoryPmWorking("stories/alpha-slice.md")).toBe(false);
  });

  it("does not let a chat clear a concurrent flesh-out's indicator", () => {
    // The two activities share one visible flag, so they must not share one
    // bit of state either.
    setStoryPmWorking("stories/alpha-slice.md", true);
    markStoryPmChat("pm-story-v1:0001", "stories/alpha-slice.md");

    clearStoryPmChat("pm-story-v1:0001");
    // The chat is gone, but the flesh-out is still live.
    expect(isStoryPmWorking("stories/alpha-slice.md")).toBe(true);
  });
});
