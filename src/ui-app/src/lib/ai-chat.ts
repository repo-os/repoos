/**
 * The AI chat standard (#0444) — see docs/ai-chat-standards.md for the prose
 * version. This module is the machine-readable half: the registry of every AI
 * chat surface in the UI, so src/ui-app/tests/ai-chat-standard.test.ts can fail
 * the build the moment a new chat is added without the shared behaviour, or an
 * existing one drifts away from it.
 *
 * Adding a chat? Add it here, use `useChatScroll` + `ChatJumpToLatest` +
 * `AiChatThinking`, and the test tells you if you missed one.
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
  /** Teleported floating "Jump to latest" button. */
  jumpButton: "ChatJumpToLatest",
  /** Pulsing indicator shown only while the model is working. */
  thinking: "AiChatThinking",
  /** Class carrying the shared vertical rhythm between messages. */
  logClass: "ai-chat-log",
  /** Class giving the send button its distinct accent fill. */
  sendClass: "ai-chat-send",
} as const;

/**
 * Text an AI chat must never print: idle/stopped state is conveyed by the
 * absence of `AiChatThinking`, not by a status line (#0444).
 */
export const FORBIDDEN_CHAT_STATUS_TEXT = /-\s*agent stopped\s*-|—\s*agent stopped\s*—/i;
