import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import DoneErrorCard from "../src/components/DoneErrorCard.vue";

const original = {
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};

/** jsdom does no layout, so scrollHeight/clientHeight are always 0 — stub them
 *  deterministically where layout matters. */
function stubOverflow(overflowing: boolean): void {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => (overflowing ? 60 : 10),
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 20,
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await nextTick();
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ["scrollHeight", "clientHeight"] as const) {
    const desc = original[key];
    if (desc) Object.defineProperty(HTMLElement.prototype, key, desc);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

describe("DoneErrorCard (card mode — the compact board surface)", () => {
  it("clamps the message and never expands inline", async () => {
    stubOverflow(true);
    const long = "conflict in src/components/ReallyLongComponentName.ts ".repeat(12);
    const wrapper = mount(DoneErrorCard, { props: { message: long } });

    const btn = wrapper.find("button.done-error-toggle");
    expect(btn.exists()).toBe(true);
    // Native button → keyboard operable (Enter/Space).
    expect(btn.element.tagName).toBe("BUTTON");
    // Card mode keeps the message clamped and compact — no inline detail.
    expect(wrapper.find(".done-error-msg").classes()).toContain("clamped");
    expect(wrapper.find(".done-error-detail").exists()).toBe(false);
  });

  it("emits open-panel when the collapsed error is clicked, without expanding", async () => {
    stubOverflow(true);
    const wrapper = mount(DoneErrorCard, {
      props: { message: "conflict in src/a.ts" },
      attrs: { onClick: () => {} },
    });
    await flush();

    const btn = wrapper.find("button.done-error-toggle");
    await btn.trigger("click");
    await flush();

    expect(wrapper.emitted("open-panel")).toHaveLength(1);
    // No inline expansion remains on the card.
    expect(wrapper.find(".done-error-detail").exists()).toBe(false);
    expect(wrapper.find(".done-error-msg").classes()).toContain("clamped");
  });

  it("announces the error as a live alert region", async () => {
    const wrapper = mount(DoneErrorCard, { props: { message: "boom" } });
    await flush();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("renders the fix button at full width of its container", async () => {
    const wrapper = mount(DoneErrorCard, {
      props: { message: "merge conflict: src/a.ts", taskId: "0123", taskTitle: "T" },
    });
    await flush();
    const fix = wrapper.find("button.done-error-fix");
    expect(fix.exists()).toBe(true);
    expect(fix.classes()).toContain("done-error-fix");
    // Card mode: the parent styles the fix button to span the full width.
    expect(wrapper.find(".done-error--card").exists()).toBe(true);
  });

  it("routes Fix to the failing task's own debugger, not the global one (#0356)", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
        });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );

    const wrapper = mount(DoneErrorCard, {
      props: {
        message: "merge conflict: src/a.ts",
        step: "check",
        taskId: "0356",
        taskTitle: "Route it",
      },
    });
    await flush();

    await wrapper.find("button.done-error-fix").trigger("click");
    await flush();

    // Scoped to the task that raised the error — not the global `/api/debugger`.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/tasks/0356/debugger/message");
    expect(String(calls[0].body?.text)).toContain("0356");
    // The parent opens this task's Debug tab; the card just signals it.
    expect(wrapper.emitted("open-debugger")).toHaveLength(1);
  });
});

describe("DoneErrorCard (panel mode — the spacious task panel)", () => {
  it("renders the full detail always, scrollable, without a collapse toggle", async () => {
    const wrapper = mount(DoneErrorCard, {
      props: {
        mode: "panel",
        message: "merge conflict: src/a.ts, src/b.ts",
        step: "check",
        conflicts: ["src/a.ts", "src/b.ts"],
        hint: "Fix the failure in the feature branch's worktree, commit, and retry the close-out.",
        detail: "deletion detected by watcher\n  at tests/x.test.ts:12",
      },
    });
    await flush();

    // No collapse toggle — the detail is always present.
    expect(wrapper.find(".done-error-toggle").exists()).toBe(false);
    // Message is not clamped — the full error is shown.
    expect(wrapper.find(".done-error-msg").classes()).not.toContain("clamped");
    expect(wrapper.find(".done-error-detail").exists()).toBe(true);
    expect(wrapper.text()).toContain("Move to done failed");
    expect(wrapper.text()).toContain("at check");
    expect(wrapper.text()).toContain("Check output");
    expect(wrapper.text()).toContain("tests/x.test.ts:12");
    expect(wrapper.text()).toContain("Conflicting files");
    expect(wrapper.text()).toContain("src/a.ts");
    expect(wrapper.text()).toContain("Fix the failure in the feature branch's worktree");
    expect(wrapper.find(".done-error--panel").exists()).toBe(true);
  });

  it("renders full detail without needing any interaction (0272)", async () => {
    const wrapper = mount(DoneErrorCard, {
      props: { mode: "panel", message: "boom", detail: "long stack trace\nline2" },
    });
    await flush();
    expect(wrapper.find(".done-error-detail").exists()).toBe(true);
    expect(wrapper.text()).toContain("long stack trace");
  });
});

describe("DoneErrorCard (auto-repair in flight — #0385)", () => {
  const retryHint = {
    label: "fixing check failure (retry 1/2)",
    title: "`repoos check` failed right after handoff — the engineer is automatically fixing it",
    cls: "tc-coding",
  };

  it("shows the being-resolved framing instead of a bare dead-end error", async () => {
    const wrapper = mount(DoneErrorCard, {
      props: { mode: "panel", message: "The validation check failed", retryHint },
    });
    await flush();

    const banner = wrapper.find(".done-error-retry");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("fixing check failure (retry 1/2)");
    expect(banner.text()).toContain("automatically fixing it");
  });

  it("relabels Fix so it reads as additional, not the only path", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );
    const wrapper = mount(DoneErrorCard, {
      props: {
        message: "The validation check failed",
        taskId: "0385",
        taskTitle: "T",
        retryHint,
      },
    });
    await flush();

    const fix = wrapper.find("button.done-error-fix");
    expect(fix.text()).toBe("Investigate anyway");
    expect(fix.attributes("title")).toMatch(/already repairing this automatically/i);
    // Card mode leaves the framing to TaskCard's own `.tc-hint` chip — the
    // banner is the drawer's (panel) surface.
    expect(wrapper.find(".done-error-retry").exists()).toBe(false);

    // It still routes to the task's own debugger — it just doesn't pretend
    // to be the only recovery path.
    await fix.trigger("click");
    await flush();
    expect(calls).toEqual(["/api/tasks/0385/debugger/message"]);
    expect(wrapper.emitted("open-debugger")).toHaveLength(1);
  });

  it("keeps the plain dead-end Fix button when no retry is in flight", async () => {
    const wrapper = mount(DoneErrorCard, {
      props: { message: "boom", taskId: "0385", retryHint: null },
    });
    await flush();

    expect(wrapper.find(".done-error-retry").exists()).toBe(false);
    const fix = wrapper.find("button.done-error-fix");
    expect(fix.text()).toBe("Fix");
    expect(fix.attributes("title")).toBeUndefined();
  });
});
