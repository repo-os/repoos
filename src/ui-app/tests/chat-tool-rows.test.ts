/**
 * Grouped tool-call rows (#0506).
 *
 * The grouping is a pure view-layer transform, so most of this is plain
 * function testing: which entries become which rows, what the counts are, and
 * which timestamp a row claims. The component half covers the parts a reader
 * actually touches — the count badges, expanding a row, and the guarantee that
 * a row survives a live run streaming more calls into it.
 *
 * The cross-agent cases are the point of "implemented once": grouping happens
 * after normalization, so opencode's and Copilot's parsers have to produce the
 * same rows from their own event shapes. That is asserted against the real
 * parsers, not against hand-written entries.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import ChatToolCallRow from "../src/components/ChatToolCallRow.vue";
import {
  bubbleRole,
  isFailedState,
  latestAt,
  toDisplayRows,
  toolCallCountLabel,
  type DisplayRow,
  type ToolCallRow,
} from "../src/lib/chat-rows";
import { AGENT_CLIS } from "../../core/config";
import {
  parseAntigravityEvent,
  parseClaudeEvent,
  parseCodexEvent,
  parseCopilotEvent,
  parseCursorEvent,
  parseJsonEvent,
  parseQwenEvent,
} from "../../server/agents";
import type { AgentOutputEntry } from "../src/types";

const AT_0 = "2026-09-26T14:32:01.000Z";
const AT_1 = "2026-09-26T14:32:04.000Z";
const AT_2 = "2026-09-26T14:32:07.000Z";

function tool(tool: string, state: string, at: string, input?: string, output?: string) {
  return { type: "tool", tool, state, at, input, output } as AgentOutputEntry;
}

function text(value: string, at?: string): AgentOutputEntry {
  return { type: "text", text: value, at };
}

function step(kind: "start" | "finish", reason?: string, at?: string): AgentOutputEntry {
  return { type: "step", kind, reason, at };
}

/** The `tools` rows in a row list, in order. */
function groups(rows: DisplayRow[]) {
  return rows.filter((row): row is Extract<DisplayRow, { kind: "tools" }> => row.kind === "tools");
}

/** The non-tool rows in a row list, in order. */
function messages(rows: DisplayRow[]) {
  return rows.filter((row): row is Exclude<DisplayRow, { kind: "tools" }> => row.kind !== "tools");
}

describe("toDisplayRows — run splitting", () => {
  it("collapses a maximal run of adjacent tool calls into one row", () => {
    const rows = toDisplayRows([tool("bash", "completed", AT_0), tool("read", "completed", AT_1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("tools");
    expect(groups(rows)[0].total).toBe(2);
  });

  it("splits two tool runs when a text entry separates them", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      tool("bash", "completed", AT_1),
      text("Now I will edit the file.", AT_1),
      tool("edit", "completed", AT_2),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["tools", "text", "tools"]);
    expect(groups(rows).map((row) => row.total)).toEqual([2, 1]);
  });

  it("splits two tool runs when a human entry separates them", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      { type: "human", text: "also run the tests", at: AT_1 },
      tool("bash", "completed", AT_2),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["tools", "human", "tools"]);
  });

  it("splits two tool runs when a system line separates them", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      { type: "sys", d: "rate limited", at: AT_1 },
      tool("bash", "completed", AT_2),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["tools", "sys", "tools"]);
  });

  it("splits two tool runs when a legacy plain line separates them", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      { s: "out", d: "building…" },
      tool("bash", "completed", AT_2),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["tools", "line", "tools"]);
  });

  it("merges consecutive assistant text parts into one message", () => {
    const rows = toDisplayRows([text("First part.", AT_0), text("Second part.", AT_1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("text");
    expect(messages(rows)[0].text).toBe("First part.\n\nSecond part.");
  });

  it("drops an empty text entry rather than drawing an empty bubble", () => {
    const rows = toDisplayRows([text("", AT_0), text("Real content.", AT_1)]);
    expect(rows).toHaveLength(1);
    expect(messages(rows)[0].text).toBe("Real content.");
  });

  it("strips ANSI escapes from row text and tool input", () => {
    const rows = toDisplayRows([
      text("[31mred[0m text", AT_0),
      tool("bash", "completed", AT_1, "[32mls -la[0m", "out"),
    ]);
    expect(messages(rows)[0].text).toBe("red text");
    expect(groups(rows)[0].calls[0].input).toBe("ls -la");
  });
});

describe("toDisplayRows — step markers draw no row", () => {
  it("drops both step start and step finish entries", () => {
    const rows = toDisplayRows([
      text("Working on it.", AT_0),
      step("start", "thinking", AT_0),
      tool("bash", "completed", AT_1),
      step("finish", "tool calls", AT_2),
      text("Done.", AT_2),
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["text", "tools", "text"]);
  });

  it("never renders the 'continue' chip a step-finish marker used to produce", () => {
    const rows = toDisplayRows([step("finish", "tool calls", AT_0)]);
    expect(rows).toEqual([]);
  });

  it("does not let a step boundary split a run of tool calls", () => {
    // The end of a batch is already marked by the grouped row's own timestamp,
    // so a boundary there adds nothing and would only fragment the row.
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      step("finish", "tool calls", AT_1),
      tool("read", "completed", AT_2),
    ]);
    expect(rows).toHaveLength(1);
    expect(groups(rows)[0].total).toBe(2);
  });

  it("leaves step entries in the transcript untouched", () => {
    // Grouping is a view transform: the caller still holds the raw entries, so
    // the debugger endpoints and report extraction keep reading them.
    const entries: AgentOutputEntry[] = [
      step("start", "thinking", AT_0),
      tool("bash", "completed", AT_1),
      step("finish", "tool calls", AT_2),
    ];
    toDisplayRows(entries);
    expect(entries.filter((entry) => "type" in entry && entry.type === "step")).toHaveLength(2);
  });
});

describe("toDisplayRows — counts split by outcome", () => {
  it("counts successes and failures separately", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      tool("bash", "error", AT_1),
      tool("read", "completed", AT_1),
      tool("edit", "error", AT_2),
    ]);
    expect(groups(rows)[0]).toMatchObject({ total: 4, ok: 2, failed: 2 });
  });

  it("treats an unknown state as a success, never a failure", () => {
    // Absence of `state` means the driver did not report one — not an error.
    const rows = toDisplayRows([{ type: "tool", tool: "bash", at: AT_0 }]);
    expect(groups(rows)[0]).toMatchObject({ total: 1, ok: 1, failed: 0 });
  });

  it("counts Codex's `failed` spelling as a failure too", () => {
    // Codex's parser passes `item.status` through verbatim and its JSONL says
    // "failed", not "error". Matching only "error" would show a failed codex
    // command in the green success count.
    const rows = toDisplayRows([tool("shell", "completed", AT_0), tool("shell", "failed", AT_1)]);
    expect(groups(rows)[0]).toMatchObject({ total: 2, ok: 1, failed: 1 });
  });

  it("does not mistake an unrelated state for a failure", () => {
    // An exact set, not a substring test: a future state the drivers invent
    // must not be silently counted either way.
    expect(isFailedState("error")).toBe(true);
    expect(isFailedState("failed")).toBe(true);
    expect(isFailedState("completed")).toBe(false);
    expect(isFailedState("running")).toBe(false);
    expect(isFailedState("errored")).toBe(false);
    expect(isFailedState(undefined)).toBe(false);
  });

  it("does not call a call a failure just because its output mentions an error", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0, "cat log", "ERROR: could not open file"),
    ]);
    expect(groups(rows)[0]).toMatchObject({ ok: 1, failed: 0 });
  });

  it("keeps a single-call run rendering through the same code path", () => {
    const rows = toDisplayRows([tool("bash", "error", AT_0)]);
    expect(groups(rows)[0]).toMatchObject({ total: 1, ok: 0, failed: 1 });
  });
});

describe("toDisplayRows — timestamps come from the newest entry", () => {
  it("takes the latest `at` across the calls a row groups", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", AT_0),
      tool("read", "completed", AT_1),
      tool("edit", "completed", AT_2),
    ]);
    expect(groups(rows)[0].at).toBe(AT_2);
  });

  it("takes the latest `at` for a merged text row", () => {
    const rows = toDisplayRows([text("one", AT_2), text("two", AT_0)]);
    expect(rows[0].at).toBe(AT_2);
  });

  it("carries a system line's own timestamp", () => {
    const rows = toDisplayRows([{ type: "sys", d: "stopped", at: AT_1 }]);
    expect(rows[0].at).toBe(AT_1);
  });

  it("reports no timestamp rather than a fabricated one when none is known", () => {
    expect(toDisplayRows([tool("bash", "completed", "")])[0].at).toBeUndefined();
    expect(toDisplayRows([{ s: "out", d: "legacy" }])[0].at).toBeUndefined();
  });

  it("ignores an unparseable timestamp when another entry has a real one", () => {
    const rows = toDisplayRows([
      tool("bash", "completed", "not-a-date"),
      tool("read", "completed", AT_1),
    ]);
    expect(groups(rows)[0].at).toBe(AT_1);
  });

  it("latestAt picks the newest across a plain set of entries", () => {
    expect(latestAt([{ at: AT_0 }, { at: AT_2 }, { at: AT_1 }])).toBe(AT_2);
    expect(latestAt([{ at: undefined }, {}])).toBeUndefined();
  });
});

describe("toDisplayRows — identity is stable while a run streams", () => {
  it("keeps the same row key as calls are appended to a run", () => {
    // Streaming stability is what lets the row keep its expand state and not
    // reset the reader's scroll position mid-run.
    let rows = toDisplayRows([tool("bash", "completed", AT_0)]);
    const key = rows[0].key;
    rows = toDisplayRows([tool("bash", "completed", AT_0), tool("read", "completed", AT_1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(key);
    expect(rows[0].at).toBe(AT_1);
  });

  it("gives every row a distinct key", () => {
    const rows = toDisplayRows([
      text("a", AT_0),
      tool("bash", "completed", AT_0),
      { type: "sys", d: "note", at: AT_1 },
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe("bubbleRole — which rows are speech bubbles", () => {
  it("maps each row kind to a speaker, and no role to a tool run", () => {
    expect(bubbleRole(toDisplayRows([{ type: "human", text: "hi" }])[0])).toBe("human");
    expect(bubbleRole(toDisplayRows([text("yo")])[0])).toBe("assistant");
    expect(bubbleRole(toDisplayRows([{ s: "out", d: "x" }])[0])).toBe("assistant");
    expect(bubbleRole(toDisplayRows([{ s: "err", d: "x" }])[0])).toBe("status");
    expect(bubbleRole(toDisplayRows([{ type: "sys", d: "x" }])[0])).toBe("status");
    expect(bubbleRole(toDisplayRows([tool("bash", "completed", AT_0)])[0])).toBeNull();
  });
});

describe("toolCallCountLabel", () => {
  it("reads as a sentence for one call and a count for many", () => {
    expect(toolCallCountLabel(1)).toBe("1 tool call");
    expect(toolCallCountLabel(6)).toBe("6 tool calls");
  });
});

describe("the shared tool-call row component", () => {
  const calls = [
    {
      tool: "bash",
      state: "completed",
      input: "ls -la",
      output: "total 0",
      at: AT_0,
      error: false,
    },
    { tool: "read", state: "error", input: "a.ts", output: "ENOENT", at: AT_2, error: true },
  ];

  function mountRow(props: { calls: typeof calls; at?: string }) {
    return mount(ChatToolCallRow, { props });
  }

  it("shows the total count and splits it by outcome", () => {
    const wrapper = mountRow({ calls, at: AT_2 });
    expect(wrapper.get('[data-testid="chat-tool-total"]').text()).toBe("2 tool calls");
    expect(wrapper.get('[data-testid="chat-tool-ok"]').text()).toBe("1 ok");
    expect(wrapper.get('[data-testid="chat-tool-failed"]').text()).toBe("1 failed");
  });

  it("hides the failure count when nothing failed", () => {
    const wrapper = mountRow({
      calls: [{ ...calls[0] }],
      at: AT_0,
    });
    expect(wrapper.get('[data-testid="chat-tool-ok"]').text()).toBe("1 ok");
    expect(wrapper.find('[data-testid="chat-tool-failed"]').exists()).toBe(false);
  });

  it("starts collapsed and reveals each call's input and result when opened", async () => {
    const wrapper = mountRow({ calls, at: AT_2 });
    const details = wrapper.get("details");
    expect(details.attributes("open")).toBeUndefined();

    // `<details>` is the whole expand mechanism, so toggling the attribute is
    // exactly what clicking the summary does.
    details.element.open = true;
    await nextTick();

    expect(wrapper.text()).toContain("bash");
    expect(wrapper.text()).toContain("ls -la");
    expect(wrapper.text()).toContain("read");
    expect(wrapper.text()).toContain("ENOENT");
  });

  it("keeps each call in its original order", async () => {
    const wrapper = mountRow({ calls, at: AT_2 });
    wrapper.get("details").element.open = true;
    await nextTick();
    const names = wrapper.findAll(".agent-tool-call-name").map((el) => el.text());
    expect(names).toEqual(["bash", "read"]);
  });

  it("is labelled for assistive tech, where two coloured counts say little", () => {
    const wrapper = mountRow({ calls, at: AT_2 });
    expect(wrapper.get("summary").attributes("aria-label")).toBe("2 tool calls, 1 ok, 1 failed");
  });

  it("marks the row as errored only when something in the run failed", () => {
    expect(mountRow({ calls, at: AT_2 }).get("details").classes()).toContain("error");
    expect(
      mountRow({ calls: [calls[0]], at: AT_0 })
        .get("details")
        .classes(),
    ).not.toContain("error");
  });

  it("survives a live run streaming more calls into the same row", async () => {
    // A host whose props come from refs, so the update path is the real one:
    // SSE appends an entry, the store grows, this row re-renders.
    const live = ref<ToolCallRow[]>([calls[0]]);
    const at = ref(AT_0);
    const wrapper = mount(
      defineComponent({
        // A render function, not a template: the test bundle has no compiler.
        setup: () => () => h(ChatToolCallRow, { calls: live.value, at: at.value }),
      }),
      { attachTo: document.body },
    );
    const details = wrapper.get("details");
    details.element.open = true;
    await nextTick();

    live.value = [...live.value, calls[1]];
    at.value = AT_2;
    await nextTick();
    await nextTick();

    expect(details.element.open, "must not collapse under the reader mid-run").toBe(true);
    expect(wrapper.get('[data-testid="chat-tool-total"]').text()).toBe("2 tool calls");
    expect(wrapper.get(".agent-tool-time").text()).not.toBe("");
  });
});

/**
 * Grouping is a view-layer transform over the *normalized* entry stream, so it
 * must not care which driver produced the entries. These cases drive each CLI's
 * real parser over its real event lines and check that the rows come out
 * identical — that is the whole claim, tested against every engine in the
 * agent-kind union rather than opencode alone.
 */

/** One line of a CLI's structured event stream, as its own parser expects it. */
type EventLine = Record<string, unknown>;

/** The driver event lines behind the same conversation, per CLI in AGENT_CLIS. */
const AGENT_STREAMS: Record<string, EventLine[]> = {
  // text → tool_use (completed) → tool_use (error) → step_finish
  opencode: [
    { type: "text", part: { text: "Checking the repository." } },
    {
      type: "tool_use",
      part: {
        tool: "bash",
        state: { status: "completed", input: { command: "ls" }, output: "ok" },
      },
    },
    {
      type: "tool_use",
      part: {
        tool: "read",
        state: { status: "error", input: { filePath: "a.ts" }, error: "ENOENT" },
      },
    },
    { type: "step_finish", part: { reason: "tool calls" } },
  ],
  // assistant → tool_use block → tool_use block → user tool_result
  "claude code": [
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "Checking the repository." }] },
    },
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }],
      },
    },
    {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
    },
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t2", name: "Read", input: { filePath: "a.ts" } }],
      },
    },
    {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t2", content: "ENOENT", is_error: true }],
      },
    },
    { type: "system", subtype: "post_turn_summary" },
  ],
  // Same claude-shaped dialect, Qwen's own type names.
  "qwen code": [
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "Checking the repository." }] },
    },
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "t1", name: "shell", input: { command: "ls" } }],
      },
    },
    {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
    },
    {
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "t2", name: "read", input: { path: "a.ts" } }] },
    },
    {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t2", content: "ENOENT", is_error: true }],
      },
    },
  ],
  // item.completed agent_message → command_execution → command_execution
  codex: [
    { type: "item.updated", item: { type: "agent_message", text: "Checking the repository." } },
    {
      type: "item.updated",
      item: {
        type: "command_execution",
        command: "ls",
        status: "completed",
        aggregated_output: "ok",
      },
    },
    {
      type: "item.updated",
      item: {
        type: "command_execution",
        command: "cat a.ts",
        status: "failed",
        aggregated_output: "ENOENT",
      },
    },
  ],
  // assistant.message → tool.execution_start/complete pairs
  "github copilot": [
    { type: "assistant.message", data: { content: "Checking the repository." } },
    {
      type: "tool.execution_start",
      data: { toolCallId: "c1", toolName: "shell", arguments: { command: "ls" } },
    },
    {
      type: "tool.execution_complete",
      data: { toolCallId: "c1", toolName: "shell", arguments: { command: "ls" }, result: "ok" },
    },
    {
      type: "tool.execution_start",
      data: { toolCallId: "c2", toolName: "view", arguments: { path: "a.ts" } },
    },
    {
      type: "tool.execution_complete",
      data: {
        toolCallId: "c2",
        toolName: "view",
        arguments: { path: "a.ts" },
        error: "ENOENT",
      },
    },
  ],
  // tool_call started/completed pairs keyed by call_id, each naming its own
  // tool kind (Cursor spells them `<kind>ToolCall`).
  cursor: [
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "Checking the repository." }] },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "x1",
      tool_call: { shellToolCall: { args: { command: "ls" } } },
    },
    {
      type: "tool_call",
      subtype: "completed",
      call_id: "x1",
      tool_call: { shellToolCall: { result: { success: { content: "ok" } } } },
    },
    {
      type: "tool_call",
      subtype: "started",
      call_id: "x2",
      tool_call: { readToolCall: { args: { path: "a.ts" } } },
    },
    {
      type: "tool_call",
      subtype: "completed",
      call_id: "x2",
      tool_call: { readToolCall: { result: { error: "ENOENT" } } },
    },
  ],
  // step_update with step_type "agent_response" then "tool"
  antigravity: [
    {
      event: "step_update",
      step_update: { step_type: "agent_response", text_delta: "Checking the repository." },
    },
    {
      event: "step_update",
      step_update: {
        step_type: "tool",
        tool_name: "run_command",
        tool_info: { name: "run_command", parameters: { command: "ls" }, output: "ok" },
      },
    },
    {
      event: "step_update",
      step_update: {
        step_type: "tool",
        tool_name: "read_file",
        tool_info: {
          name: "read_file",
          parameters: { path: "a.ts" },
          error: { message: "ENOENT" },
        },
      },
    },
    // The turn's closing step. Not `step_type: "tool"`: the parser tests the
    // tool branch before the DONE branch, so a DONE step labelled "tool" is
    // emitted as a phantom contentless tool call. That is a pre-existing driver
    // quirk and out of scope here; this stream stays faithful to a plain DONE.
    { event: "step_update", step_update: { state: "DONE", step_type: "final" } },
  ],
  // Kiro has no structured-event parser of its own — its stream lands as legacy
  // plain lines, so there are no tool entries for grouping to act on. The chat
  // still has to render what the transcript does contain, which is all this
  // case checks.
  kiro: [{ status: "COMPLETED", response: "Checking the repository." }],
};

interface PendingTool {
  id: string;
  tool: string;
  input?: string;
}

/**
 * The entries `AgentRunner` records for a CLI's event lines: each line through
 * that CLI's own parser, plus the same pending-tool merge the runner performs —
 * a start buffers, a matching completion emits one finished `tool` entry. This
 * mirrors the server on purpose: grouping is specified against the normalized
 * stream, and the normalization is what makes the stream agent-agnostic.
 */
function normalizedEntries(cli: string, lines: EventLine[]): AgentOutputEntry[] {
  const entries: AgentOutputEntry[] = [];
  let pending: PendingTool | undefined;
  const raw = (line: EventLine) => JSON.stringify(line);

  for (const line of lines) {
    let entry: AgentOutputEntry | undefined;
    let started: PendingTool | undefined;
    let finished: { id: string; output?: string; error: boolean } | undefined;

    if (cli === "opencode") {
      entry = parseJsonEvent(raw(line))?.entry;
    } else if (cli === "claude code" || cli === "qwen code") {
      // The claude-shaped dialects name a pending call `name` and its result
      // `content`; the merge below is what folds both spellings into one entry.
      const parsed =
        cli === "claude code" ? parseClaudeEvent(raw(line)) : parseQwenEvent(raw(line));
      entry = parsed?.entry;
      if (parsed?.pendingTool) {
        started = {
          id: parsed.pendingTool.id,
          tool: parsed.pendingTool.name,
          input: parsed.pendingTool.input,
        };
      }
      if (parsed?.toolResult) {
        finished = {
          id: parsed.toolResult.id,
          output: parsed.toolResult.content,
          error: parsed.toolResult.isError === true,
        };
      }
    } else if (cli === "github copilot") {
      const parsed = parseCopilotEvent(raw(line));
      entry = parsed?.entry;
      const event = parsed?.toolEvent;
      if (event?.phase === "start") {
        started = { id: event.id, tool: event.tool ?? "tool", input: event.input };
      } else if (event?.phase === "complete") {
        finished = { id: event.id, output: event.output, error: event.error === true };
      }
    } else if (cli === "codex") {
      entry = parseCodexEvent(raw(line))?.entry;
    } else if (cli === "cursor") {
      const parsed = parseCursorEvent(raw(line));
      entry = parsed?.entry;
      if (parsed?.pendingTool) {
        started = {
          id: parsed.pendingTool.id,
          tool: parsed.pendingTool.name,
          input: parsed.pendingTool.input,
        };
      }
      if (parsed?.toolResult) {
        finished = {
          id: parsed.toolResult.id,
          output: parsed.toolResult.output,
          error: parsed.toolResult.isError === true,
        };
      }
    } else if (cli === "antigravity") {
      // Antigravity's tool steps are self-contained — no pending buffer.
      entry = parseAntigravityEvent(raw(line))?.entry;
    } else {
      // Kiro has no structured-event parser: the runner's fall-through records
      // every line as a legacy plain entry, so there is nothing to normalize
      // and nothing for grouping to act on.
      entry = { s: "out", d: raw(line) };
    }

    if (started) {
      // A stale buffered call is flushed before a new one replaces it.
      if (pending) entries.push(toolEntry(pending));
      pending = started;
      continue;
    }
    if (finished) {
      if (pending?.id === finished.id) {
        entries.push(toolEntry(pending, finished.output, finished.error));
        pending = undefined;
      }
      continue;
    }
    if (entry) entries.push(entry);
  }
  if (pending) entries.push(toolEntry(pending));
  return entries;
}

function toolEntry(pending: PendingTool, output?: string, error = false): AgentOutputEntry {
  return {
    type: "tool",
    tool: pending.tool,
    ...(pending.input ? { input: pending.input } : {}),
    ...(output !== undefined ? { output } : {}),
    state: error ? "error" : "completed",
  };
}

/** The row list reduced to what a reader sees: kinds, counts and times. */
function rowShape(entries: AgentOutputEntry[]): unknown {
  return toDisplayRows(entries).map((row) =>
    row.kind === "tools"
      ? { kind: row.kind, total: row.total, ok: row.ok, failed: row.failed }
      : { kind: row.kind, text: row.text },
  );
}

describe("grouping is identical for every agent", () => {
  it("has an event stream for every CLI in the agent-kind union", () => {
    expect(Object.keys(AGENT_STREAMS).sort()).toEqual([...AGENT_CLIS].sort());
  });

  it("drives each CLI's real parser into the same two rows", () => {
    for (const cli of AGENT_CLIS) {
      const rows = toDisplayRows(normalizedEntries(cli, AGENT_STREAMS[cli]));
      if (cli === "kiro") {
        // A plain line, not a text bubble: the one case where a driver's
        // transcript carries no structured entries at all.
        expect(
          rows.map((row) => row.kind),
          cli,
        ).toEqual(["line"]);
        continue;
      }
      // One assistant message, then one row for the batch of tool calls. The
      // count and the success/failure split match across every driver, which is
      // the part that would drift if a driver's normalized state differed.
      expect(
        rows.map((row) => row.kind),
        cli,
      ).toEqual(["text", "tools"]);
      expect(rows[1], cli).toMatchObject({ total: 2, ok: 1, failed: 1 });
    }
  });

  it("produces byte-identical rows for opencode and Claude Code", () => {
    // Two agents, two completely different event dialects, one rendering.
    expect(rowShape(normalizedEntries("opencode", AGENT_STREAMS["opencode"]))).toEqual(
      rowShape(normalizedEntries("claude code", AGENT_STREAMS["claude code"])),
    );
  });

  it("produces byte-identical rows for opencode and GitHub Copilot", () => {
    expect(rowShape(normalizedEntries("opencode", AGENT_STREAMS["opencode"]))).toEqual(
      rowShape(normalizedEntries("github copilot", AGENT_STREAMS["github copilot"])),
    );
  });

  it("never lets a driver's step markers become a row", () => {
    // opencode's step_finish, Claude's post_turn_summary and Antigravity's DONE
    // are three spellings of the same boundary; none may draw a "continue" row.
    for (const cli of ["opencode", "claude code", "antigravity"]) {
      const rows = toDisplayRows(normalizedEntries(cli, AGENT_STREAMS[cli]));
      expect(
        rows.some((row) => row.kind === "sys" || row.kind === "line"),
        cli,
      ).toBe(false);
    }
  });
});
