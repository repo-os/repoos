<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Search } from "lucide-vue-next";

export interface SelectSearchOption {
  value: string;
  label: string;
  disabled: boolean;
}

const props = defineProps<{ options: SelectSearchOption[] }>();

const query = ref("");
const rootEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

const filteredOptions = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.options;
  return props.options.filter((m) => m.value === "default" || m.label.toLowerCase().includes(q));
});

function listboxEl(): HTMLElement | null {
  return rootEl.value?.closest('[role="listbox"]') ?? null;
}

function visibleItems(): HTMLElement[] {
  const box = listboxEl();
  if (!box) return [];
  return Array.from(box.querySelectorAll<HTMLElement>('[role="option"]'));
}

function firstEnabled(items: HTMLElement[]): HTMLElement | undefined {
  return items.find((el) => el.getAttribute("aria-disabled") !== "true");
}

function isDefaultItem(el: HTMLElement): boolean {
  return /^default(\s|$)/i.test(el.textContent?.trim() ?? "");
}

/**
 * Pick what Enter selects from the search field. With a query typed, the
 * user is looking for a concrete model — prefer the first match that isn't
 * the always-visible "Default" fallback, then fall back to "Default".
 * With no query, behave like a plain select and pick the first item.
 */
function selectFirstMatch(): void {
  const items = firstEnabled(visibleItems());
  if (!items) return;
  const target = query.value.trim()
    ? (visibleItems().find(
        (el) => el.getAttribute("aria-disabled") !== "true" && !isDefaultItem(el),
      ) ?? items)
    : items;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function moveFocus(forward: boolean): void {
  const items = visibleItems();
  const ordered = forward ? items : items.slice().reverse();
  firstEnabled(ordered)?.focus({ preventScroll: true });
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" || e.key === "Tab") return;
  e.stopPropagation();
  if (e.key === "Enter") {
    e.preventDefault();
    selectFirstMatch();
  } else if (e.key === "ArrowDown" || e.key === "Home") {
    e.preventDefault();
    moveFocus(true);
  } else if (e.key === "ArrowUp" || e.key === "End") {
    e.preventDefault();
    moveFocus(false);
  }
}

onMounted(() => {
  const el = inputEl.value;
  if (!el) return;
  let frames = 0;
  const grabFocus = (): void => {
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    if (++frames < 10) requestAnimationFrame(grabFocus);
  };
  requestAnimationFrame(grabFocus);
});
</script>

<template>
  <div ref="rootEl" class="shrink-0 px-1.5 pb-1 pt-1.5">
    <div class="relative">
      <Search
        class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--txt-faint)]"
      />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        role="combobox"
        aria-label="Search models"
        placeholder="Search models…"
        class="w-full rounded-[8px] border border-[var(--border)] bg-[var(--panel-solid)] py-[7px] pl-7 pr-2.5 text-[12.5px] text-[var(--txt)] placeholder:text-[var(--txt-faint)] outline-none transition-colors focus:border-[var(--border-bright)]"
        @keydown="onKeydown"
      />
    </div>
  </div>
  <slot :options="filteredOptions" />
</template>
