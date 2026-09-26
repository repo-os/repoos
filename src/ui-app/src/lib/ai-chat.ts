/**
 * The AI chat standard (#0444) — see docs/ai-chat-standards.md for the prose
 * version. This module is the machine-readable half: the registry of every AI
 * chat surface in the UI, so src/ui-app/tests/ai-chat-standard.test.ts can fail
 * the build the moment a new chat is added without the shared behaviour, or an
 * existing one drifts away from it.
 *
 * Adding a chat? Add it here, use `useChatScroll` + a jump control
 * (`ChatJumpToLatest` or inline `agent-jump`) + `AiChatThinking`, and the
 * test tells you if you missed one.
 */

export interface AiChatSurface {
  /** Human-readable name, used in test failure messages. */
  name: string;
  /** File name under src/ui-app/src/components/. */
  file: string;
  /** The id its remembered scroll position is keyed under. */
  chatId: string;
  /** The chat's own class on the scrolling element (carries `ai-chat-log` too). */
  logClass: string;
}

export const AI_CHAT_SURFACES: readonly AiChatSurface[] = [
  { name: "Ross", file: "RepoGuideChat.vue", chatId: "repoos-guide", logClass: "guide-log" },
  { name: "CTO Board Monitor", file: "CTOPanel.vue", chatId: "cto", logClass: "cto-log" },
  {
    name: "Debugger",
    file: "DebuggerChat.vue",
    chatId: "__repoos-debugger__",
    logClass: "debugger-log",
  },
  {
    name: "Task Debugger",
    file: "TaskDebuggerChat.vue",
    chatId: "debugger:<task id>",
    logClass: "td-log",
  },
  {
    name: "Model Playground",
    file: "ModelPlaygroundPanel.vue",
    chatId: "playground:<run id>",
    logClass: "playground-log",
  },
  {
    name: "Task PM chat",
    file: "TaskDrawer.vue",
    chatId: "pm:<task id>",
    logClass: "pm-log-wrap",
  },
] as const;

/** The shared hooks every chat surface must use. */
export const AI_CHAT_REQUIREMENTS = {
  /** Composable owning scroll-to-newest + position memory + jump state. */
  scroll: "useChatScroll",
  /**
   * Teleported floating "Jump to latest" button. Floating-head panels use the
   * inline `.agent-jump` sibling instead (Radix dialog stacking breaks the
   * teleported control) — see `hasJumpToLatestControl`.
   */
  jumpButton: "ChatJumpToLatest",
  /** Inline jump control used inside floating panels / relative log wraps. */
  jumpButtonInline: "agent-jump",
  /** Pulsing indicator shown only while the model is working. */
  thinking: "AiChatThinking",
  /** Class carrying the shared vertical rhythm between messages. */
  logClass: "ai-chat-log",
  /** Class giving the send button its distinct accent fill. */
  sendClass: "ai-chat-send",
} as const;

/** True when the surface renders either allowed jump-to-latest control. */
export function hasJumpToLatestControl(source: string): boolean {
  return (
    source.includes(AI_CHAT_REQUIREMENTS.jumpButton) ||
    source.includes(AI_CHAT_REQUIREMENTS.jumpButtonInline)
  );
}

/**
 * Text an AI chat must never print: idle/stopped state is conveyed by the
 * absence of `AiChatThinking`, not by a status line (#0444).
 */
export const FORBIDDEN_CHAT_STATUS_TEXT = /-\s*agent stopped\s*-|—\s*agent stopped\s*—/i;

/**
 * Tool-call grouping (#0506), the other half of the standard. A chat that
 * renders an `AgentOutputEntry` stream must run it through `toDisplayRows` and
 * draw a run of tool calls with `<ChatToolCallRow>`. Hand-rolling a row per
 * tool call — or degrading them to `Checked with <tool> · <state>` text, which
 * is what four chats used to do — is the failure this catches.
 */
export const AI_CHAT_TOOL_ROWS = {
  /** The shared grouping transform, applied to the transcript's entries. */
  grouping: "toDisplayRows",
  /** The shared expandable tool-call row. */
  row: "ChatToolCallRow",
  /** The per-entry fallback text grouping replaced: flat, un-outcomed, unexpandable. */
  forbiddenFlattening: /Checked with\s/,
  /**
   * Gating a row's timestamp on its speaker. A `sys` entry is stamped with an
   * `at` like every other entry, so suppressing the time by role hides it from
   * system rows and leaves the task drawer disagreeing with the other chats —
   * both of which #0506 exists to end.
   */
  forbiddenTimeSuppression: /bubbleRole\([^)]*\)\s*!==\s*["']status["']/,
} as const;
