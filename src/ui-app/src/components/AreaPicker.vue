<script setup lang="ts">
/**
 * Multi-select area picker (#0583).
 *
 * The area picker for the task drawer (edit form) and the New task panel: a
 * custom floating dropdown in the same visual vocabulary as `ui/select/*`
 * (never a native `<select>`), with a checked row per selected area and a
 * free-text entry at the bottom, because a declared vocabulary is advisory —
 * newly typed areas are always allowed.
 *
 * The panel is a hand-rolled `<Teleport to="body">` floating layer, so it
 * carries `data-overlay-layer="floating"` (#0575): while the task drawer's
 * dialog is open, Radix puts `pointer-events: none` on `<body>`, and an
 * unmarked teleported layer would be click-transparent.
 *
 * The dialog's Radix focus trap listens for `focusin` and `focusout` on
 * `document` and yanks focus back into the drawer when it lands outside it —
 * which is exactly where this teleported panel (and its free-text input)
 * lives. While the panel is open it mounts its own radix `FocusScope`, whose
 * guard PAUSES the drawer's trap on radix's shared guard stack (the same
 * mechanism that makes nested dialogs work) — no event is suppressed, so
 * document-level focus listeners (the global tooltip handler, #0638 round 2)
 * keep seeing every transition. The scope deliberately does not trap: it only
 * borrows the pause, and autofocus on mount/unmount is prevented so
 * opening/closing the panel never moves focus by itself.
 *
 * With no vocabulary configured (`options` empty) the picker degrades to the
 * free-text entry only — the shared multi-select degrades, it never blocks.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown, Check, Plus } from "lucide-vue-next";
import { FocusScope } from "radix-vue";
import { cn } from "@/lib/utils";

export interface AreaOption {
  name: string;
  description?: string;
}

const props = defineProps<{
  /** Selected area names (canonical list; `v-model`). */
  modelValue: string[];
  /** The repo's effective vocabulary. Empty means free-text only. */
  options: AreaOption[];
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  /** Accessible label for the trigger button. */
  id?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
  /**
   * The free-text entry created an area outside the vocabulary and the user
   * offered it to the repo ("add to areas"). The parent decides whether to
   * persist it (PATCH config) — the picker never writes config itself.
   */
  (e: "addToVocabulary", name: string): void;
}>();

const open = ref(false);
const triggerEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const typed = ref("");

const selected = computed(() => props.modelValue.map((s) => s.trim()).filter(Boolean));

/** Vocabulary names lowercased, for membership tests. */
const knownNames = computed(() => new Set(props.options.map((o) => o.name.trim().toLowerCase())));

const label = computed(() => selected.value.join(", "));

function toggle(name: string): void {
  const key = name.trim().toLowerCase();
  const next = selected.value.some((s) => s.trim().toLowerCase() === key)
    ? selected.value.filter((s) => s.trim().toLowerCase() !== key)
    : [...selected.value, name.trim()];
  emit("update:modelValue", next);
}

/** Position under the trigger. Recomputed on each open. */
const pos = ref({ top: 0, left: 0, minWidth: 0 });

function place(): void {
  const el = triggerEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  pos.value = {
    top: r.bottom + 6,
    left: r.left,
    minWidth: Math.max(r.width, 220),
  };
}

function openPanel(): void {
  open.value = true;
  typed.value = "";
  // Place on the next tick so the ref exists after mount.
  requestAnimationFrame(place);
}

function close(): void {
  open.value = false;
}

function onDocPointerDown(ev: MouseEvent): void {
  if (!open.value) return;
  const t = ev.target as Node;
  if (triggerEl.value?.contains(t) || panelEl.value?.contains(t)) return;
  close();
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape" && open.value) {
    ev.stopPropagation();
    close();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onDocPointerDown, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", close);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocPointerDown, true);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", close);
});

watch(open, (isOpen) => {
  if (isOpen) place();
});

/** What the free-text entry resolves to right now (trimmed). */
const typedValue = computed(() => typed.value.trim());

/**
 * The picker's rows: every vocabulary area, plus any selected value that fell
 * outside it — a task whose frontmatter predates the vocabulary must keep
 * displaying (and un-checking) its own value, not silently lose it.
 */
const rows = computed(() => {
  const out = props.options.map((o) => ({
    name: o.name,
    description: o.description,
    inVocab: true,
  }));
  for (const s of selected.value) {
    if (knownNames.value.has(s.toLowerCase())) continue;
    out.push({ name: s, description: undefined, inVocab: false });
  }
  return out;
});

/** Commit the free-text entry: toggle it into the selection and clear the field. */
function commitTyped(): void {
  const v = typedValue.value;
  if (!v) return;
  toggle(v);
  typed.value = "";
}

/**
 * Selected areas that sit outside the vocabulary, so the picker can offer
 * each one upstream ("add 'x' to areas") instead of silently letting it
 * drift. Deduped case-insensitively.
 */
const unregisteredSelections = computed(() =>
  selected.value.filter((s) => !knownNames.value.has(s.toLowerCase())),
);

const triggerClasses = cn(
  "flex h-10 w-full items-center justify-between gap-2 whitespace-nowrap rounded-[10px] border border-[var(--border)] bg-[var(--panel-solid)] px-3 py-2 text-[13px] text-[var(--txt)] hover:border-[var(--border-bright)] focus-visible:border-[var(--border-bright)] focus-visible:outline-none cursor-pointer",
);
</script>

<template>
  <div ref="triggerEl" class="relative">
    <button
      :id="id"
      type="button"
      :class="triggerClasses"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open ? close() : openPanel()"
    >
      <span class="truncate" :class="selected.length ? '' : 'opacity-50'">
        {{ selected.length ? label : (placeholder ?? "area") }}
      </span>
      <ChevronDown class="size-4 shrink-0 opacity-60" />
    </button>

    <Teleport to="body">
      <!-- While open, the panel is its own (non-trapping) radix FocusScope:
           its guard pauses the drawer's focus trap on radix's shared guard
           stack, so the free-text input can hold the caret — and no focus
           event is suppressed, so document-level listeners (the global
           tooltip handler) keep working (#0638). -->
      <FocusScope v-if="open" as-child @mount-auto-focus.prevent @unmount-auto-focus.prevent>
        <div
          ref="panelEl"
          data-overlay-layer="floating"
          role="listbox"
          aria-multiselectable="true"
          class="fixed z-[130] max-h-80 overflow-auto rounded-[10px] border border-[var(--border)] bg-[var(--popover)] text-[var(--txt)] shadow-[0_18px_40px_rgba(0,0,0,.45)] py-1"
          :style="{ top: `${pos.top}px`, left: `${pos.left}px`, minWidth: `${pos.minWidth}px` }"
        >
          <button
            v-for="row in rows"
            :key="row.name"
            type="button"
            role="option"
            :aria-selected="selected.some((s) => s.toLowerCase() === row.name.toLowerCase())"
            class="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-[8px] py-[7px] pl-2 pr-8 text-[13px] text-[var(--txt)] outline-none hover:bg-[var(--cyan-dim)] focus:bg-[var(--cyan-dim)]"
            @click="toggle(row.name)"
          >
            <span
              class="absolute right-2 flex size-3.5 items-center justify-center"
              :class="
                selected.some((s) => s.toLowerCase() === row.name.toLowerCase())
                  ? 'opacity-100'
                  : 'opacity-0'
              "
            >
              <Check class="size-4 text-[var(--cyan)]" />
            </span>
            <span class="flex items-center gap-2 truncate">
              {{ row.name }}
              <span v-if="row.description" class="truncate text-[11px] text-[var(--txt-faint)]">{{
                row.description
              }}</span>
            </span>
          </button>

          <div class="mx-1 my-1 border-t border-[var(--border)]" style="opacity: 0.4"></div>

          <div
            class="relative mx-1 mb-1 flex items-center gap-2 rounded-[8px] px-2 py-1 focus-within:ring-1 focus-within:ring-[var(--cyan)]"
          >
            <Plus class="size-3.5 shrink-0 opacity-50" />
            <input
              v-model="typed"
              type="text"
              class="w-full bg-transparent text-[13px] text-[var(--txt)] outline-none placeholder:opacity-50"
              placeholder="type an area, Enter to add"
              aria-label="Add a custom area"
              @keydown.enter.prevent="commitTyped"
            />
          </div>
          <button
            v-for="name in unregisteredSelections"
            :key="'add-' + name.toLowerCase()"
            type="button"
            class="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-[8px] px-2 py-[6px] text-left text-[12px] text-[var(--txt-dim)] hover:bg-[var(--cyan-dim)] hover:text-[var(--txt)]"
            :title="'Add ' + name + ' to the declared areas in repoos.toml'"
            @click="emit('addToVocabulary', name)"
          >
            <Plus class="size-3.5 text-[var(--cyan)]" />
            <span class="truncate">add "{{ name }}" to repoos areas</span>
          </button>
        </div>
      </FocusScope>
    </Teleport>
  </div>
</template>
