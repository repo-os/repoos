<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vitepress";
import {
  type Appearance,
  type DesignThemeId,
  type PickerDesignTheme,
  applyAppearanceToDocument,
  applyDesignThemeToDocument,
  commitThemeChange,
  isPickerDesignTheme,
  pickerLabelForDesign,
  readAppearanceFromDocument,
  readDesignFromDocument,
  syncRepoOrgNavLinks,
} from "./theme-resolve";

const props = defineProps<{
  variant: "bar" | "screen";
}>();

const route = useRoute();
const appearance = ref<Appearance>("dark");
const designTheme = ref<DesignThemeId>("classic");
const pickerOpen = ref(false);

const DESIGN_OPTIONS: { id: PickerDesignTheme; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "gruvbox", label: "Gruvbox" },
];

function applyAppearance(next: Appearance): void {
  appearance.value = next;
  applyAppearanceToDocument(next);
  commitThemeChange(designTheme.value, next);
}

function applyDesignTheme(next: PickerDesignTheme): void {
  designTheme.value = next;
  applyDesignThemeToDocument(next);
  commitThemeChange(next, appearance.value);
}

function toggleAppearance(): void {
  applyAppearance(appearance.value === "dark" ? "light" : "dark");
}

function selectDesignTheme(next: PickerDesignTheme): void {
  applyDesignTheme(next);
  pickerOpen.value = false;
}

function togglePicker(): void {
  pickerOpen.value = !pickerOpen.value;
}

function onDocumentClick(e: MouseEvent): void {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (!target.closest(".docs-theme-picker")) {
    pickerOpen.value = false;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") pickerOpen.value = false;
}

/** Read axes from the DOM (boot script already applied them). No URL rewrite — landing keeps a clean bar until the user uses the switcher. */
function syncFromDocument(): void {
  appearance.value = readAppearanceFromDocument();
  designTheme.value = readDesignFromDocument();
}

/** Patch cross-site nav links only (e.g. repoos.org in the mobile screen). */
function patchCrossSiteNavLinks(): void {
  syncRepoOrgNavLinks(designTheme.value, appearance.value);
}

// Bar + screen instances both mount; listeners are duplicated but harmless. The
// screen picker is torn down when the menu closes, so its mount re-patches
// repoos.org links inside VPNavScreen after the bar instance already ran once.
onMounted(() => {
  syncFromDocument();
  patchCrossSiteNavLinks();
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  window.removeEventListener("keydown", onKeydown);
});

watch(
  () => route.path,
  () => {
    syncRepoOrgNavLinks(designTheme.value, appearance.value);
  },
);

const activeDesignLabel = () => {
  const known = DESIGN_OPTIONS.find((o) => o.id === designTheme.value);
  if (known) return known.label;
  return pickerLabelForDesign(designTheme.value);
};

const showDesignInPicker = (id: DesignThemeId) => (isPickerDesignTheme(id) ? id : "classic");
</script>

<template>
  <div
    class="docs-theme-controls"
    :class="variant === 'screen' ? 'docs-theme-controls--screen' : 'docs-theme-controls--bar'"
  >
    <div v-if="variant === 'screen'" class="docs-theme-screen-label">Theme</div>
    <div class="docs-theme-picker">
      <button
        type="button"
        class="docs-theme-picker-trigger"
        :aria-expanded="pickerOpen"
        aria-haspopup="menu"
        aria-label="Design theme"
        :title="`Design theme: ${activeDesignLabel()}`"
        @click="togglePicker"
      >
        <span>{{ activeDesignLabel() }}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          class="docs-theme-picker-chevron"
          :class="{ open: pickerOpen }"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div v-if="pickerOpen" class="docs-theme-picker-menu" role="menu" aria-label="Design theme">
        <button
          v-for="opt in DESIGN_OPTIONS"
          :key="opt.id"
          type="button"
          role="menuitemradio"
          class="docs-theme-picker-option"
          :aria-checked="showDesignInPicker(designTheme) === opt.id ? 'true' : 'false'"
          :aria-label="`Use ${opt.label} design theme`"
          :title="`Use ${opt.label} design theme`"
          @click="selectDesignTheme(opt.id)"
        >
          <span>{{ opt.label }}</span>
          <span
            v-if="showDesignInPicker(designTheme) === opt.id"
            class="docs-theme-picker-check"
            aria-hidden="true"
            >✓</span
          >
        </button>
      </div>
    </div>
    <button
      type="button"
      class="docs-theme-toggle"
      :aria-label="
        appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'
      "
      :title="appearance === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'"
      @click="toggleAppearance"
    >
      <svg
        v-if="appearance === 'dark'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        class="docs-theme-toggle-icon"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="docs-theme-toggle-icon"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  </div>
</template>
