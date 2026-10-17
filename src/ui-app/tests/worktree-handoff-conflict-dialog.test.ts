/**
 * The "Worktree changed after handoff" modal now lists every file changed
 * since handoff with its +N / -M counts (#0810). jsdom neither loads nor
 * applies style.css, so the 60%-height constraint is asserted against the
 * source rule directly (mirroring done-error-placement / shot-input-visibility)
 * while the list/buttons structure is asserted on the mounted component.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WorktreeHandoffConflictDialog from "../src/components/WorktreeHandoffConflictDialog.vue";

// Button pulls in radix-vue + cva; a plain button keeps the click wiring.
const ButtonStub = defineComponent({
  name: "Button",
  inheritAttrs: false,
  setup(_props, { slots, attrs }) {
    return () => h("button", attrs, slots.default?.() as never);
  },
});

function mountDialog(props: Record<string, unknown>) {
  return mount(WorktreeHandoffConflictDialog, {
    props: { task: { id: "0810" }, message: "HEAD moved 11111111 → 22222222", ...props },
    global: { stubs: { teleport: true, Button: ButtonStub } },
  });
}

const files = [
  { path: "src/a.ts", added: 12, removed: 3, taskFile: false },
  { path: "src/b.ts", added: 1, removed: 0, taskFile: false },
  { path: "repoos.toml", added: 4, removed: 4, taskFile: false },
];

describe("WorktreeHandoffConflictDialog file list (#0810)", () => {
  it("shows each changed file with its +N / -M counts", () => {
    const w = mountDialog({ files });
    const rows = w.findAll(".dirty-list .dirty-file");
    expect(rows).toHaveLength(3);
    for (const f of files) {
      const row = rows.find((r) => r.text().includes(f.path));
      expect(row, `${f.path} must be listed`).toBeTruthy();
      expect(row!.text()).toContain(`+${f.added}`);
      expect(row!.text()).toContain(`-${f.removed}`);
    }
    // The three actions are unchanged.
    expect(w.text()).toContain("Cancel");
    expect(w.text()).toContain("Send back to engineer");
    expect(w.text()).toContain("Discard post-handoff edits");
  });

  it("groups task files after the source changes", () => {
    const w = mountDialog({
      files: [
        { path: "src/a.ts", added: 1, removed: 0, taskFile: false },
        { path: "work/0810-x.md", added: 5, removed: 2, taskFile: true },
      ],
    });
    const text = w.find(".dirty-list").text();
    expect(text.indexOf("src/a.ts")).toBeLessThan(text.indexOf("work/0810-x.md"));
    expect(w.find(".dirty-file-group").text()).toContain("task files");
  });

  it("keeps a 60-file list at or below 60% height and scrolls, buttons visible", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      path: `src/f${i}.ts`,
      added: i,
      removed: i + 1,
      taskFile: false,
    }));
    const w = mountDialog({ files: many });

    // Every file is in the list (the list scrolls instead of the card growing).
    expect(w.findAll(".dirty-list .dirty-file")).toHaveLength(60);
    const list = w.find(".dirty-list");
    expect(list.exists()).toBe(true);
    // Focusable so the keyboard (arrows / PageDown) scrolls it.
    expect(list.attributes("tabindex")).toBe("0");

    // The card caps its own height at 60% of the viewport; the list is the
    // scrollable flex child, and the actions sit outside it so they never
    // scroll away.
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
    const cap = css.match(/\.dirty-card--conflict\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cap).toMatch(/max-height:\s*60vh/);
    expect(w.find(".dirty-card").classes()).toContain("dirty-card--conflict");
    const listRule = css.match(/\.dirty-list\s*\{[^}]*\}/)?.[0] ?? "";
    expect(listRule).toMatch(/overflow-y:\s*auto/);
    expect(listRule).toMatch(/flex:\s*1/);
    expect(listRule).toMatch(/min-height:\s*0/);

    const actions = w.find(".dirty-actions");
    expect(list.element.contains(actions.element)).toBe(false);
    expect(actions.findAll("button")).toHaveLength(3);
  });

  it("shows the reason and an unavailable note when the diff cannot be computed", () => {
    const w = mountDialog({ files: undefined, filesUnavailable: true });
    // The explanation text and the reason stay.
    expect(w.text()).toContain("Task #0810's feature worktree no longer matches");
    expect(w.text()).toContain("HEAD moved 11111111 → 22222222");
    // No file rows, but a clear note instead.
    expect(w.find(".dirty-list").exists()).toBe(false);
    expect(w.find(".dirty-unavailable").text().toLowerCase()).toContain("file list is unavailable");
    // The three buttons are still there.
    expect(w.find(".dirty-actions").findAll("button")).toHaveLength(3);
  });
});
