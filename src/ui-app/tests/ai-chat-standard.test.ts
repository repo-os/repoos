/**
 * The AI chat standard (#0444) — spec: docs/ai-chat-standards.md.
 *
 * Two halves, and both matter:
 *
 *  1. The behaviour tests drive the shared `useChatScroll` + `ChatJumpToLatest`
 *     + `AiChatThinking` trio through a harness, so the rules (open at the
 *     newest message, remember the reader's position, follow only when already
 *     at the bottom, offer a teleported jump back down, pulse while working and
 *     render nothing when idle) are verified once, for everyone.
 *
 *  2. The conformance tests read every registered chat surface's source. This
 *     is the part that stops the wheel being reinvented: a new AI chat that
 *     renders bubbles but forgets `useChatScroll`, skips the jump button, prints
 *     an "agent stopped" status line, sets its own message spacing, or leaves
 *     the send button on the washed-out default fill fails the build here —
 *     not in a review three tasks later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import AiChatThinking from "../src/components/AiChatThinking.vue";
import ChatJumpToLatest from "../src/components/ChatJumpToLatest.vue";
import { useChatScroll } from "../src/composables/useChatScroll";
import {
  AI_CHAT_REQUIREMENTS,
  AI_CHAT_SURFACES,
  AI_CHAT_TOOL_ROWS,
  FORBIDDEN_CHAT_STATUS_TEXT,
  hasJumpToLatestControl,
} from "../src/lib/ai-chat";

const COMPONENTS_DIR = resolve(__dirname, "../src/components");
const SRC_DIR = resolve(__dirname, "../src");
const CSS_PATH = resolve(__dirname, "../src/style.css");

function readSurface(file: string): string {
  return readFileSync(resolve(COMPONENTS_DIR, file), "utf8");
}

/** Just the `<style scoped>` block, for rules the shared classes must own. */
function styleBlock(source: string): string {
  const start = source.lastIndexOf("<style");
  if (start === -1) return "";
  const open = source.indexOf(">", start) + 1;
  const close = source.indexOf("</style>", open);
  return source.slice(open, close === -1 ? undefined : close);
}

/** The declarations of the rule(s) whose selector mentions `selector`. */
function rules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

function ruleBody(css: string, selector: string): string {
  return rules(css)
    .filter((rule) => rule.selector.includes(selector))
    .map((rule) => rule.body)
    .join("\n");
}

/** The base `<x>-compose button` rule — no extra class, no pseudo. */
function baseComposeButtonRules(css: string): { selector: string; body: string }[] {
  return rules(css).filter((rule) =>
    rule.selector.split(",").some((part) => /^\.[a-z-]*-compose\s+button$/.test(part.trim())),
  );
}

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every component source in the app, for the whole-file conformance scans. */
const sources = readdirSync(SRC_DIR)
  .flatMap((entry) => {
    if (!entry.endsWith(".vue")) return [];
    const text = readFileSync(resolve(SRC_DIR, entry), "utf8");
    return [[entry, text] as const];
  })
  .concat(
    readdirSync(COMPONENTS_DIR)
      .filter((entry) => entry.endsWith(".vue"))
      .map((entry) => [entry, readSurface(entry)] as const),
  );

// ── the harness ────────────────────────────────────────────────────────────

const LOG_HEIGHT = 200;
let scrollHeight = 1000;

function fakeLayout(el: HTMLElement): void {
  // jsdom has no layout: scrollHeight/clientHeight are 0 and scrollTop is a
  // plain settable property. Give the log a real geometry to reason about.
  Object.defineProperty(el, "clientHeight", { value: LOG_HEIGHT, configurable: true });
  Object.defineProperty(el, "scrollHeight", {
    get: () => scrollHeight,
    configurable: true,
  });
}

const Harness = defineComponent({
  props: {
    chatId: { type: String, required: true },
    size: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    busy: { type: Boolean, default: false },
    behavior: { type: String, default: "auto" },
  },
  setup(props) {
    const log = ref<HTMLElement | null>(null);
    const { showJumpToLatest, onScroll, scrollToLatest } = useChatScroll(log, {
      chatId: () => props.chatId,
      contentSize: () => props.size,
      active: () => props.active,
    });
    // Render function (not a template) so the test bundle needs no compiler.
    return () => [
      h("div", { ref: log, class: "ai-chat-log", onScroll: onScroll }),
      h(AiChatThinking, { active: props.busy, label: "Assistant is working" }),
      h(ChatJumpToLatest, {
        visible: showJumpToLatest.value,
        anchor: log.value,
        onClick: () => scrollToLatest(props.behavior as ScrollBehavior),
      }),
    ];
  },
});

function logEl(wrapper: VueWrapper): HTMLElement {
  return wrapper.find(".ai-chat-log").element as HTMLElement;
}

function jumpButton(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-testid="chat-jump-latest"]');
}

interface HarnessProps {
  chatId: string;
  size?: number;
  active?: boolean;
  busy?: boolean;
  behavior?: string;
}

async function mountHarness(props: HarnessProps): Promise<VueWrapper> {
  const wrapper = mount(Harness, { props, attachTo: document.body });
  fakeLayout(logEl(wrapper));
  await nextTick();
  await nextTick();
  return wrapper;
}

function scrollTo(wrapper: VueWrapper, top: number): void {
  const el = logEl(wrapper);
  el.scrollTop = top;
  el.dispatchEvent(new Event("scroll"));
}

let chatSeq = 0;
function nextChatId(): string {
  return `test-chat-${++chatSeq}`;
}

beforeEach(() => {
  scrollHeight = 1000;
  window.localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("AI chat scroll behaviour", () => {
  it("opens on the newest message", async () => {
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4 });
    expect(logEl(wrapper).scrollTop).toBe(scrollHeight);
  });

  it("shows a jump-to-latest button once the reader scrolls away from the bottom", async () => {
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4 });
    expect(jumpButton()).toBeNull();

    scrollTo(wrapper, 200);
    await nextTick();

    expect(jumpButton()).not.toBeNull();
    expect(jumpButton()?.textContent).toContain("Jump to latest");
  });

  it("teleports the button out of the chat's own DOM", async () => {
    // A `position: fixed` child of a drawer/floating panel is trapped in its
    // stacking context — unclickable. The button must live in <body>.
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4 });
    scrollTo(wrapper, 200);
    await nextTick();

    const button = jumpButton();
    expect(button).not.toBeNull();
    expect(wrapper.element.contains(button)).toBe(false);
    expect(button?.parentElement).toBe(document.body);
  });

  it("scrolls back to the newest message on click and then hides itself", async () => {
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4 });
    scrollTo(wrapper, 200);
    await nextTick();

    jumpButton()?.click();
    await nextTick();

    expect(logEl(wrapper).scrollTop).toBe(scrollHeight);
    expect(jumpButton()).toBeNull();
  });

  it("remembers the reader's position per conversation", async () => {
    const chatId = nextChatId();
    const first = await mountHarness({ chatId, size: 4 });
    scrollTo(first, 400);
    await nextTick();
    first.unmount();

    const second = await mountHarness({ chatId, size: 4 });
    // 400px from the bottom of a 1000px log in a 200px viewport.
    expect(logEl(second).scrollTop).toBe(scrollHeight - LOG_HEIGHT - 400);
  });

  it("does not leak one conversation's position into another", async () => {
    const first = await mountHarness({ chatId: nextChatId(), size: 4 });
    scrollTo(first, 400);
    await nextTick();
    first.unmount();

    const other = await mountHarness({ chatId: nextChatId(), size: 4 });
    expect(logEl(other).scrollTop).toBe(scrollHeight);
  });

  it("chatId switch with a pending save does not corrupt the new conversation's position", async () => {
    const idA = nextChatId();
    const idB = nextChatId();
    const wrapper = await mountHarness({ chatId: idA, size: 4 });
    // Scroll up in conversation A — queues a debounced save under idA.
    scrollTo(wrapper, 300);
    await nextTick();
    // Switch to conversation B before the debounce fires.
    await wrapper.setProps({ chatId: idB });
    await nextTick();
    // Conversation B has no saved position, so it should open at the bottom.
    expect(logEl(wrapper).scrollTop).toBe(scrollHeight);
    // Conversation A's position must be saved under idA, not idB.
    const savedA = window.localStorage.getItem(`repoos.chat-scroll.${idA}`);
    const savedB = window.localStorage.getItem(`repoos.chat-scroll.${idB}`);
    expect(Number(savedA)).toBeGreaterThan(0); // A's scroll-up was saved
    expect(savedB).toBeNull(); // B was never scrolled
  });

  it("follows new output for a reader who is already at the bottom", async () => {
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4 });
    scrollHeight = 1600;
    await wrapper.setProps({ size: 5 });
    await nextTick();
    await nextTick();

    expect(logEl(wrapper).scrollTop).toBe(1600);
  });

  it("leaves a reader who scrolled up alone when new output arrives", async () => {
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4 });
    scrollTo(wrapper, 200);
    await nextTick();

    scrollHeight = 1600;
    await wrapper.setProps({ size: 5 });
    await nextTick();
    await nextTick();

    expect(logEl(wrapper).scrollTop).toBe(200);
    expect(jumpButton()).not.toBeNull();
  });

  it("jumps smoothly when the browser supports it, and instantly when asked", async () => {
    const wrapper = await mountHarness({
      chatId: nextChatId(),
      size: 4,
      behavior: "smooth",
    });
    const el = logEl(wrapper);
    const scrollToSpy = vi.fn();
    Object.defineProperty(el, "scrollTo", { value: scrollToSpy, configurable: true });

    scrollTo(wrapper, 200);
    await nextTick();
    jumpButton()?.click();
    await nextTick();

    expect(scrollToSpy).toHaveBeenCalledWith({ top: scrollHeight, behavior: "smooth" });
  });

  it("lets a reader take back control mid-animation", async () => {
    // The settle window suppresses the button so it can't flash during a smooth
    // jump — but it must not out-vote a reader who scrolls up meanwhile.
    const wrapper = await mountHarness({
      chatId: nextChatId(),
      size: 4,
      behavior: "smooth",
    });
    const el = logEl(wrapper);
    Object.defineProperty(el, "scrollTo", { value: () => {}, configurable: true });

    scrollTo(wrapper, 200);
    await nextTick();
    jumpButton()?.click();
    await nextTick();
    expect(jumpButton(), "hidden while the smooth jump runs").toBeNull();

    // Scroll further up: distance grows, so the reader wins immediately.
    scrollTo(wrapper, 100);
    await nextTick();

    expect(jumpButton()).not.toBeNull();
  });

  it("holds a remembered position through an async hydration", async () => {
    // The task PM chat loads its transcript after the tab opens, so a restored
    // distance is first computed against partial content. It has to be
    // re-applied when the rest arrives, not left wherever the short log put it.
    const chatId = nextChatId();
    const reader = await mountHarness({ chatId, size: 4 });
    scrollTo(reader, 400);
    await nextTick();
    reader.unmount();

    // Reopen onto a log that has only partially hydrated (300px, not 1000px).
    scrollHeight = 300;
    const partial = await mountHarness({ chatId, size: 1 });
    expect(logEl(partial).scrollTop, "clamped by the short log").toBe(0);

    // The rest of the conversation lands.
    scrollHeight = 1000;
    await partial.setProps({ size: 4 });
    await nextTick();
    await nextTick();

    expect(logEl(partial).scrollTop).toBe(scrollHeight - LOG_HEIGHT - 400);
    // The interim distance must never have been written over the remembered one.
    partial.unmount();
    expect(window.localStorage.getItem(`repoos.chat-scroll.${chatId}`)).toBe("400");
  });

  it("never clobbers a remembered position from a log with no layout box", async () => {
    const chatId = nextChatId();
    const first = await mountHarness({ chatId, size: 4 });
    scrollTo(first, 400);
    await nextTick();
    // Writes are coalesced across a scroll, so nothing is stored yet…
    expect(window.localStorage.getItem(`repoos.chat-scroll.${chatId}`)).toBeNull();
    // …and unmounting flushes the last one.
    first.unmount();
    expect(window.localStorage.getItem(`repoos.chat-scroll.${chatId}`)).toBe("400");

    // A `v-show`-hidden panel reports clientHeight 0. Restoring against that
    // would compute distance 0 and overwrite the entry above with "at bottom".
    const hidden = mount(Harness, {
      props: { chatId, size: 4, active: false },
      attachTo: document.body,
    });
    await hidden.setProps({ active: true });
    await flushPromises();
    await nextTick();
    expect(window.localStorage.getItem(`repoos.chat-scroll.${chatId}`)).toBe("400");
    hidden.unmount();

    // With geometry again, the position that survived is the one we land on.
    const back = await mountHarness({ chatId, size: 4 });
    expect(logEl(back).scrollTop).toBe(scrollHeight - LOG_HEIGHT - 400);
  });

  it("holds the remembered position while the surface is closed", async () => {
    const wrapper = await mountHarness({ chatId: nextChatId(), size: 4, active: false });
    // A closed panel has no geometry to restore into; nothing should throw.
    expect(logEl(wrapper).scrollTop).toBe(0);

    await wrapper.setProps({ active: true });
    await flushPromises();
    expect(logEl(wrapper).scrollTop).toBe(scrollHeight);
  });
});

describe("AI chat working indicator", () => {
  it("pulses while the model is working", () => {
    const wrapper = mount(AiChatThinking, { props: { active: true, label: "Ross is thinking" } });
    const el = wrapper.find('[data-testid="ai-chat-thinking"]');
    expect(el.exists()).toBe(true);
    expect(el.attributes("aria-label")).toBe("Ross is thinking");
    expect(el.findAll("span")).toHaveLength(3);
  });

  it("renders nothing at all when the model is idle", () => {
    const wrapper = mount(AiChatThinking, { props: { active: false } });
    expect(wrapper.find('[data-testid="ai-chat-thinking"]').exists()).toBe(false);
    // Not merely hidden — the standard is "nothing at all when idle".
    expect(wrapper.html()).not.toContain("ai-chat-thinking");
  });
});

describe("every AI chat surface follows the standard", () => {
  const css = readFileSync(CSS_PATH, "utf8");

  it("defines the avatar-offset modifier the indicator used to carry per-chat", () => {
    expect(ruleBody(css, ".ai-chat-thinking.ai-chat-avatar-offset")).toMatch(/margin-left:/);
  });

  it("ships the shared classes this whole standard hangs off", () => {
    for (const cls of [".ai-chat-log", ".ai-chat-thinking", ".ai-chat-send", ".chat-jump-latest"]) {
      expect(css, `${cls} missing from style.css`).toContain(cls);
    }
    // The send button's distinct fill is a token pair, defined per theme scope.
    expect(css).toContain("--ai-chat-send-bg");
    expect(css).toContain("--ai-chat-send-color");
  });

  it("spaces messages from one place, not six", () => {
    expect(ruleBody(css, ".ai-chat-log")).toMatch(/gap:\s*\d/);
  });

  for (const surface of AI_CHAT_SURFACES) {
    describe(surface.name, () => {
      const source = readSurface(surface.file);

      it("uses the shared scroll composable", () => {
        expect(source).toContain(AI_CHAT_REQUIREMENTS.scroll);
      });

      it("renders the shared jump-to-latest button", () => {
        expect(
          hasJumpToLatestControl(source),
          `${surface.file} must render ${AI_CHAT_REQUIREMENTS.jumpButton} or .${AI_CHAT_REQUIREMENTS.jumpButtonInline}`,
        ).toBe(true);
      });

      it("renders the shared working indicator", () => {
        expect(source).toContain(AI_CHAT_REQUIREMENTS.thinking);
      });

      it("carries the shared log class on its scrolling element", () => {
        expect(source).toContain(AI_CHAT_REQUIREMENTS.logClass);
        expect(source).toContain(`${surface.logClass} ${AI_CHAT_REQUIREMENTS.logClass}`);
      });

      it("gives the send button the shared accent fill", () => {
        // On the class attribute, not merely in a comment.
        expect(source).toMatch(new RegExp(`class="[^"]*\\b${AI_CHAT_REQUIREMENTS.sendClass}\\b`));
      });

      it("does not out-specify that fill from its own scoped styles", () => {
        // Regression: a scoped `.x-compose button { background/color }` beats
        // the global `.ai-chat-send` on specificity, so the send button
        // rendered transparent — less visible than the fill it replaced.
        for (const rule of baseComposeButtonRules(styleBlock(source))) {
          expect(rule.body, `${surface.file}: ${rule.selector} must not set a fill`).not.toMatch(
            /(^|;|\s)(background|color)\s*:/,
          );
        }
      });

      it("does not override the shared message spacing", () => {
        // A scoped `gap` on the log beats the global class on specificity.
        expect(ruleBody(styleBlock(source), `.${surface.logClass}`)).not.toMatch(/gap:/);
      });

      it("prints no helper line under the compose box", () => {
        expect(source).not.toMatch(/class="[a-z-]*footnote"/);
      });

      it("conveys a stopped agent visually, never in text", () => {
        expect(source).not.toMatch(FORBIDDEN_CHAT_STATUS_TEXT);
      });

      it("groups tool calls through the shared transform and row (#0506)", () => {
        // A chat that renders an AgentOutputEntry stream has to run it through
        // `toDisplayRows` and draw a run of tool calls with the shared
        // `<ChatToolCallRow>`. The Model Playground is exempt by construction:
        // it is a raw model call with its own `{role, text}` messages and no
        // tool events at all.
        if (source.includes("AgentOutputEntry")) {
          expect(source, `${surface.file} must use ${AI_CHAT_TOOL_ROWS.grouping}`).toContain(
            AI_CHAT_TOOL_ROWS.grouping,
          );
          expect(source, `${surface.file} must render <${AI_CHAT_TOOL_ROWS.row}>`).toContain(
            AI_CHAT_TOOL_ROWS.row,
          );
        }
      });

      it("never degrades a tool call to a flat text line", () => {
        // The four chats that used to print `Checked with bash · completed` per
        // call. That rendering has no count, no outcome, and nothing to expand.
        expect(stripComments(source), `${surface.file} flattens tool calls to text`).not.toMatch(
          AI_CHAT_TOOL_ROWS.forbiddenFlattening,
        );
      });

      it("timestamps every row, system rows included", () => {
        // A `sys` entry carries an `at` like any other, so the time is shown
        // whenever the row has one. Gating it on the speaker would leave system
        // rows un-timestamped here while the task drawer showed theirs.
        expect(
          stripComments(source),
          `${surface.file} hides a row's timestamp by its speaker`,
        ).not.toMatch(AI_CHAT_TOOL_ROWS.forbiddenTimeSuppression);
      });
    });
  }
});

describe("no chat ships an animation it never defined", () => {
  const sharedCss = readFileSync(CSS_PATH, "utf8");

  it("every `animation:` name in a component resolves to a @keyframes block", () => {
    // Regression: pruning the per-chat thinking keyframes during the #0444
    // refactor took the Playground's unrelated `playground-shimmer` with them,
    // silently freezing its loading skeleton.
    for (const [file, text] of sources) {
      const style = styleBlock(text);
      const used = new Set(
        [...style.matchAll(/animation(?:-name)?:\s*([a-zA-Z][\w-]*)/g)]
          .map((m) => m[1])
          .filter((name) => name !== "none" && name !== "inherit" && name !== "initial"),
      );
      for (const name of used) {
        const defined =
          new RegExp(`@keyframes\\s+${name}\\b`).test(text) ||
          new RegExp(`@keyframes\\s+${name}\\b`).test(sharedCss);
        expect(defined, `${file} animates with ${name} but never defines it`).toBe(true);
      }
    }
  });
});

describe("no AI chat reinvents the wheel", () => {
  /** Anything that renders an AI conversation, however it's written. */
  function looksLikeAiChat(text: string): boolean {
    return (
      text.includes('role="log"') ||
      text.includes("AiChatThinking") ||
      /class="[a-z-]*-compose"/.test(text)
    );
  }

  const chatLike = sources.filter(([, text]) => looksLikeAiChat(text)).map(([file]) => file);
  const registered = new Set(AI_CHAT_SURFACES.map((s) => s.file));

  it("finds the registered surfaces by scanning, so the registry can't go stale", () => {
    for (const file of registered) {
      expect(chatLike, `${file} is registered but no longer looks like an AI chat`).toContain(file);
    }
  });

  it("holds every chat-like component to the same three hooks", () => {
    for (const [file, text] of sources) {
      if (!looksLikeAiChat(text)) continue;
      const label = registered.has(file) ? `${file} (registered)` : `${file} (unregistered)`;
      expect(text, `${label} must use ${AI_CHAT_REQUIREMENTS.scroll}`).toContain(
        AI_CHAT_REQUIREMENTS.scroll,
      );
      expect(
        hasJumpToLatestControl(text),
        `${label} must render ${AI_CHAT_REQUIREMENTS.jumpButton} or .${AI_CHAT_REQUIREMENTS.jumpButtonInline}`,
      ).toBe(true);
      expect(text, `${label} must render ${AI_CHAT_REQUIREMENTS.thinking}`).toContain(
        AI_CHAT_REQUIREMENTS.thinking,
      );
    }
  });

  it("never prints an 'agent stopped' status line anywhere in the UI", () => {
    for (const [file, text] of sources) {
      // Comments are stripped: this test's own rule is documented in the shared
      // indicator's docblock, and that must not read as a violation.
      expect(stripComments(text), `${file} still prints a stopped-agent status line`).not.toMatch(
        FORBIDDEN_CHAT_STATUS_TEXT,
      );
    }
  });
});
