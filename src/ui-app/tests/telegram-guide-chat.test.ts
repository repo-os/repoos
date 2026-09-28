/**
 * Telegram → repository-guide agent turns (#0541).
 *
 * Covers the model decisions the task pins:
 *
 *  - conversation state is per Telegram user (`tg-guide:<id>`), so two users
 *    in one group never share context — asserted by the session keys the
 *    handler drives;
 *  - conversations expire after inactivity, and a stale resume is visibly
 *    fresh (a note, then a brand-new turn); `/new` clears on demand;
 *  - the agent rate-limit refusal reaches the handler as
 *    `{ agentLimited: true }` and is answered with a clear message BEFORE any
 *    runner call (no LLM spend);
 *  - replies are delivered back to the originating chat (private or group),
 *    chunked within Telegram's message-size limit;
 *  - usage recording: a Telegram guide turn lands on the board's "guide"
 *    role row with no taskId (no phantom `tg-guide:` task), driven through
 *    the real AgentRunner + sessions DB — the same harness as
 *    ai-role-tracking.test.ts.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assistantReplyText,
  chunkForTelegram,
  createTelegramGuideTurn,
  stripLeadingBotMention,
  telegramGuideSessionKey,
  telegramGuideTurnHandler,
  type TelegramGuideTurnDeps,
  type TelegramGuideTurnRunner,
} from "../../server/telegram/guide-chat.js";
import type { TelegramAuthorizedMeta } from "../../server/telegram/intake.js";
import type { TelegramUpdate } from "../../server/telegram/types.js";
import type { Agent, AgentOutputEntry, RepoOSConfig } from "../../core/types.js";
import {
  AgentRunner,
  classifySessionType,
  resolveSessionTaskId,
  type StartResult,
} from "../../server/agents.js";
import { RepoOSDb, resetDbInstance } from "../../core/db.js";
import { waitFor } from "./helpers.js";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-tg-guide-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  resetDbInstance();
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {}
  }
  roots.length = 0;
});

const ross: Agent = { name: "Ross", cli: "opencode", model: "test/m", enabled: true };

const configFor = (root: string): RepoOSConfig => ({
  root,
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
  agents: [ross],
});

function messageUpdate(partial: {
  senderId: number;
  chatId: number;
  chatType?: "private" | "group";
  command?: string | null;
  text?: string | null;
}): TelegramUpdate {
  return {
    updateId: 1,
    kind: "message",
    receivedAt: new Date().toISOString(),
    raw: {},
    message: {
      messageId: 42,
      chatId: partial.chatId,
      chatType: partial.chatType ?? "private",
      chatTitle: null,
      senderId: partial.senderId,
      senderUsername: null,
      senderIsBot: false,
      text: partial.text ?? null,
      date: 0,
      command: partial.command ?? null,
      commandArgs: [],
    },
  };
}

const actor = (telegramUserId: number) => ({
  email: "ross@test.com",
  role: "member" as const,
  telegramUserId,
});

function capturingSend(): {
  send: (chatId: number, text: string, opts?: { replyToMessageId?: number }) => Promise<unknown>;
  sent: { chatId: number; text: string; replyToMessageId?: number }[];
} {
  const sent: { chatId: number; text: string; replyToMessageId?: number }[] = [];
  return {
    sent,
    send: async (chatId, text, opts) => {
      sent.push({ chatId, text, ...(opts?.replyToMessageId ? { ...opts } : {}) });
    },
  };
}

/**
 * A minimal stand-in for AgentRunner's chat surface: session creation, a
 * "running" flag the handler polls, and the turn completion it watches for.
 */
class FakeRunner implements TelegramGuideTurnRunner {
  readonly sessions = new Map<string, { lines: AgentOutputEntry[] }>();
  readonly running = new Set<string>();
  readonly turnCalls: { method: string; sessionId: string; text: string }[] = [];
  /** Transcript entries the next started turn will produce. */
  nextReply: AgentOutputEntry[] = [];
  /** False simulates a long-running turn (busy path, capped waiters). */
  autoFinish = true;
  /** Stamp for entries the runner itself writes (expiry uses these). */
  stamp: () => string = () => new Date().toISOString();

  private session(sessionId: string): { lines: AgentOutputEntry[] } {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = { lines: [] };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  private begin(sessionId: string, text: string, method: string): StartResult {
    if (this.running.has(sessionId)) {
      return { ok: false, busy: true, reason: "agent is busy — wait for the current turn" };
    }
    const s = this.session(sessionId);
    s.lines.push({ type: "human", text, at: this.stamp() } as AgentOutputEntry);
    this.turnCalls.push({ method, sessionId, text });
    this.running.add(sessionId);
    if (this.autoFinish) {
      setImmediate(() => {
        s.lines.push(...this.nextReply);
        this.nextReply = [];
        this.running.delete(sessionId);
      });
    }
    return { ok: true };
  }

  startChat(sessionId: string, text: string): StartResult {
    return this.begin(sessionId, text, "startChat");
  }
  send(sessionId: string, text: string): StartResult {
    return this.begin(sessionId, text, "send");
  }
  output(sessionId: string): { lines: AgentOutputEntry[] } | null {
    return this.sessions.get(sessionId) ?? null;
  }
  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }
  queued(): { id: string; queuedAt: string }[] {
    return [];
  }
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

describe("session keys and Tokens-tab attribution", () => {
  it("keys conversations per Telegram user, not per chat", () => {
    expect(telegramGuideSessionKey(101)).toBe("tg-guide:101");
    expect(telegramGuideSessionKey(102)).not.toBe(telegramGuideSessionKey(101));
  });

  it("attribution: a tg-guide session key resolves to no task, and its agent classifies as guide", () => {
    // resolveSessionTaskId/classifySessionType are exactly the two inputs
    // AgentRunner.recordSessionToDb uses when a turn exits — this pins what
    // the Tokens tab will read for a Telegram turn (taskId: null, "guide").
    expect(resolveSessionTaskId(telegramGuideSessionKey(101))).toBeNull();
    expect(classifySessionType(ross.name, telegramGuideSessionKey(101))).toBe("guide");
  });

  it(
    "a real AgentRunner records the turn on a 'guide' row with no taskId",
    { timeout: 30_000 },
    async () => {
      const root = tempRoot();
      const bin = join(root, "bin");
      mkdirSync(bin, { recursive: true });
      // Fake `opencode` on PATH: one step_finish with usage and one text part,
      // mirroring the fake driver in ai-role-tracking.test.ts.
      writeFileSync(
        join(bin, "opencode"),
        `#!/usr/bin/env node
process.stdout.write(JSON.stringify({type:"step_start",sessionID:"tg-sess-1"}) + "\\n");
process.stdout.write(JSON.stringify({type:"step_finish",sessionID:"tg-sess-1",part:{type:"step-finish",tokens:{total:1500,input:1200,output:300},cost:0.021}}) + "\\n");
process.stdout.write(JSON.stringify({type:"text",sessionID:"tg-sess-1",part:{type:"text",text:"Nothing to report."}}) + "\\n");
`,
        { mode: 0o755 },
      );
      const oldPath = process.env.PATH;
      process.env.PATH = `${bin}:${oldPath ?? ""}`;
      try {
        const config = configFor(root);
        const runner = new AgentRunner(config, () => {});
        const captures = capturingSend();
        const handler = createTelegramGuideTurn(config, runner, {
          getTasks: () => [],
          send: captures.send,
          pollIntervalMs: 25,
          maxTurnWaitMs: 10_000,
        });
        await handler(
          messageUpdate({ senderId: 777, chatId: 777, text: "what is this repo?" }),
          actor(777),
          undefined,
        );
        await waitFor(
          () => captures.sent.some((s) => s.text.includes("Nothing to report.")),
          "telegram reply delivered",
        );
        expect(runner.isRunning(telegramGuideSessionKey(777))).toBe(false);

        const db = new RepoOSDb(root);
        try {
          const guide = db.getSessionTypeStats().find((r) => r.sessionType === "guide");
          expect(guide).toBeDefined();
          expect(guide!.totalTokens).toBe(1500);
          expect(guide!.totalCostUsd ?? 0).toBeCloseTo(0.021, 10);
          // Repository-level conversation: never a phantom `tg-guide:` task.
          expect(db.getTaskStats(telegramGuideSessionKey(777))).toBeNull();
        } finally {
          db.close();
        }
        runner.dispose();
      } finally {
        process.env.PATH = oldPath;
      }
    },
  );
});

describe("telegramGuideTurnHandler — conversation flow", () => {
  function setup(overrides: Partial<Parameters<typeof telegramGuideTurnHandler>[0]> = {}): {
    runner: FakeRunner;
    sent: { chatId: number; text: string; replyToMessageId?: number }[];
    handle: (
      update: TelegramUpdate,
      telegramUserId?: number,
      meta?: TelegramAuthorizedMeta,
    ) => Promise<void>;
  } {
    const runner = new FakeRunner();
    const sent: { chatId: number; text: string; replyToMessageId?: number }[] = [];
    const handler = telegramGuideTurnHandler({
      runner,
      resolveAgent: () => ross,
      repositoryContext: () => "Context: tasks & docs (fresh)",
      resolveBotUsername: () => "repoos_project_bot",
      pollIntervalMs: 5,
      maxTurnWaitMs: 250,
      send: async (chatId, text, opts) => {
        sent.push({ chatId, text, ...(opts?.replyToMessageId ? { ...opts } : {}) });
      },
      ...overrides,
    });
    return {
      runner,
      sent,
      handle: async (update, telegramUserId = update.message?.senderId ?? 1, meta) => {
        await handler(update, actor(telegramUserId), meta);
      },
    };
  }

  it("starts a first turn via startChat and delivers the assistant reply to the chat", async () => {
    const t = setup();
    t.runner.nextReply = [
      { type: "text", text: "Here is the answer.", at: t.runner.stamp() } as AgentOutputEntry,
    ];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "question" }));
    await waitFor(() => t.sent.some((s) => s.text === "Here is the answer."), "reply");
    expect(t.runner.turnCalls[0]).toMatchObject({
      method: "startChat",
      sessionId: "tg-guide:5",
      text: "question",
    });
    expect(t.sent[0]).toMatchObject({ chatId: 500, replyToMessageId: 42 });

    // A follow-up continues the SAME per-user session via send() with an
    // updated repository context — exactly like the board guide chat.
    t.runner.nextReply = [{ type: "text", text: "Second answer." } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "follow-up" }));
    await waitFor(() => t.sent.some((s) => s.text === "Second answer."), "second reply");
    expect(t.runner.turnCalls[1]).toMatchObject({ method: "send", sessionId: "tg-guide:5" });
    expect(t.runner.turnCalls.length).toBe(2);
  });

  it("keeps two users in one group on separate per-user sessions", async () => {
    const t = setup();
    t.runner.nextReply = [{ type: "text", text: "For A." } as AgentOutputEntry];
    await t.handle(
      messageUpdate({ senderId: 11, chatId: 900, chatType: "group", text: "from Alice" }),
      11,
    );
    await waitFor(() => t.sent.some((s) => s.text === "For A."), "alice reply");

    t.runner.nextReply = [{ type: "text", text: "For B." } as AgentOutputEntry];
    await t.handle(
      messageUpdate({ senderId: 22, chatId: 900, chatType: "group", text: "from Bob" }),
      22,
    );
    await waitFor(() => t.sent.some((s) => s.text === "For B."), "bob reply");

    expect(t.runner.turnCalls.map((c) => c.method)).toEqual(["startChat", "startChat"]);
    expect(t.runner.turnCalls.map((c) => c.sessionId)).toEqual(["tg-guide:11", "tg-guide:22"]);
    // Both replies go back to the SAME chat, but each turn exists only in its
    // owner's session — Bob's question is not in Alice's transcript.
    expect(
      t.runner
        .output("tg-guide:11")!
        .lines.some((l) => "type" in l && l.type === "human" && l.text === "from Bob"),
    ).toBe(false);
  });

  it("replies to the triggering message in a group so turns stay visually attributable", async () => {
    const t = setup();
    t.runner.nextReply = [{ type: "text", text: "answer" } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 11, chatId: 900, chatType: "group", text: "q" }), 11);
    await waitFor(() => t.sent.length > 0, "group reply");
    expect(t.sent[0]?.replyToMessageId).toBe(42);
  });

  it("strips a leading @mention of the bot before starting the run", async () => {
    const t = setup();
    t.runner.nextReply = [{ type: "text", text: "answer" } as AgentOutputEntry];
    await t.handle(
      messageUpdate({
        senderId: 11,
        chatId: 900,
        chatType: "group",
        text: "@repoos_project_bot what does this do?",
      }),
      11,
    );
    await waitFor(() => t.runner.turnCalls.length > 0, "turn started");
    expect(t.runner.turnCalls[0].text).toBe("what does this do?");
  });

  it("drops a bare @mention ping without starting a run", async () => {
    const t = setup();
    await t.handle(
      messageUpdate({ senderId: 11, chatId: 900, chatType: "group", text: "@repoos_project_bot" }),
      11,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(t.runner.turnCalls.length).toBe(0);
    expect(t.sent.length).toBe(0);
  });

  it("answers the rate-limit refusal with a clear message and never calls the runner", async () => {
    const t = setup();
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "question" }), 5, {
      agentLimited: true,
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(t.runner.turnCalls.length).toBe(0);
    expect(t.sent.length).toBe(1);
    expect(t.sent[0].text).toContain("agent limit");
    expect(t.sent[0].replyToMessageId).toBe(42);
  });

  it("clears an expired conversation and visibly starts fresh on the next message", async () => {
    const t = setup({ expiryMs: 1000, now: () => Date.parse("2026-09-28T03:00:00.000Z") });
    const threeDaysOld = Date.parse("2026-09-26T00:00:00.000Z");
    // A conversation whose last entry is two days before the frozen "now".
    t.runner.sessions.set("tg-guide:5", {
      lines: [
        {
          type: "human",
          text: "old",
          at: new Date(threeDaysOld).toISOString(),
        } as AgentOutputEntry,
      ],
    });
    t.runner.nextReply = [{ type: "text", text: "fresh answer" } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "back" }), 5);
    await waitFor(() => t.sent.some((s) => s.text.includes("fresh answer")), "fresh turn reply");

    expect(t.runner.turnCalls[0]).toMatchObject({ method: "startChat", text: "back" });
    expect(t.sent.some((s) => s.text.includes("Started a fresh conversation"))).toBe(true);
  });

  it("continues a recent conversation without the fresh-start note", async () => {
    const t = setup();
    t.runner.nextReply = [{ type: "text", text: "answer" } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "one" }), 5);
    await waitFor(() => t.runner.turnCalls.length === 1, "first turn");
    await waitFor(() => t.sent.length > 0, "first reply");
    expect(t.sent.some((s) => s.text.startsWith("Started a fresh conversation"))).toBe(false);
  });

  it("/new clears the conversation on demand without starting a run", async () => {
    const t = setup();
    t.runner.nextReply = [{ type: "text", text: "answer" } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "one" }), 5);
    await waitFor(() => t.runner.turnCalls.length === 1 && t.sent.length > 0, "first turn");
    expect(t.runner.output("tg-guide:5")).not.toBeNull();

    await t.handle(messageUpdate({ senderId: 5, chatId: 500, command: "new", text: "/new" }), 5);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.runner.output("tg-guide:5")).toBeNull();
    expect(t.sent.at(-1)?.text).toBe("Started a fresh conversation.");
    expect(t.runner.turnCalls.length).toBe(1); // no second run

    // The next message starts a brand-new conversation.
    t.runner.nextReply = [{ type: "text", text: "re-run" } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "again" }), 5);
    await waitFor(() => t.runner.turnCalls.length === 2, "second turn");
    expect(t.runner.turnCalls[1]).toMatchObject({ method: "startChat" });
  });

  it("says so when Ross is disabled, without starting a run", async () => {
    const t = setup({ resolveAgent: () => null });
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "question" }), 5);
    await waitFor(
      () => t.sent.length > 0 && t.sent[0].text.includes("Ross is disabled"),
      "disabled",
    );
    expect(t.runner.turnCalls.length).toBe(0);
  });

  it("replies honestly when a turn is already running (busy)", async () => {
    const t = setup();
    t.runner.autoFinish = false; // keep turn 1 "running" for the busy check
    t.runner.nextReply = [{ type: "text", text: "slow answer" } as AgentOutputEntry];
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "first" }), 5);
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "second" }), 5);
    await waitFor(
      () => t.sent.some((s) => s.text.startsWith("Ross is still working")),
      "busy note",
    );
    expect(t.runner.turnCalls.length).toBe(1);
  });

  it("reports honestly when the turn produced no assistant text", async () => {
    const t = setup();
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, text: "question" }), 5);
    await waitFor(() => t.sent.some((s) => s.text.includes("without a reply")), "honest no-reply");
    expect(t.sent.length).toBe(1);
  });

  it("other commands flow past without starting a run", async () => {
    const t = setup();
    await t.handle(messageUpdate({ senderId: 5, chatId: 500, command: "help", text: "/help" }), 5);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.runner.turnCalls.length).toBe(0);
    expect(t.sent.length).toBe(0);
  });

  it("edits do not re-fire an agent run (paid turns only on new messages)", async () => {
    const t = setup();
    const edited = messageUpdate({ senderId: 5, chatId: 500, text: "edited text" });
    (edited as { kind?: string }).kind = "edited_message";
    await t.handle(edited, 5);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.runner.turnCalls.length).toBe(0);
    expect(t.sent.length).toBe(0);
  });
});

describe("reply shaping", () => {
  it("chunks long answers within Telegram's message limit", () => {
    const long = Array.from({ length: 300 }, (_, i) => `line ${i} — text`).join("\n");
    const chunks = chunkForTelegram(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(3800);
    // Nothing lost or reordered: the chunks reconstruct the original.
    expect(chunks.join("\n")).toBe(long);

    // A single over-long line is hard-split, still within the limit.
    const oneLine = "x".repeat(9000);
    const split = chunkForTelegram(oneLine);
    expect(split.length).toBe(3);
    expect(split.join("")).toBe(oneLine);

    expect(chunkForTelegram("short")).toEqual(["short"]);
  });

  it("joins a turn's assistant text entries from the transcript slice", () => {
    const at = new Date().toISOString();
    expect(
      assistantReplyText([
        { type: "tool", tool: "bash" } as AgentOutputEntry,
        { type: "text", text: "part one", at } as AgentOutputEntry,
        { type: "text", text: "part two", at } as AgentOutputEntry,
      ]),
    ).toBe("part one\n\npart two");
    expect(assistantReplyText([{ type: "sys", d: "error" } as AgentOutputEntry])).toBe("");
  });

  it("only strips the connected bot's own @mention", () => {
    expect(stripLeadingBotMention("@repoos_project_bot hello", "repoos_project_bot")).toBe("hello");
    expect(stripLeadingBotMention("@other_bot hello", "repoos_project_bot")).toBe(
      "@other_bot hello",
    );
    expect(stripLeadingBotMention("hello", null)).toBe("hello");
  });
});
