import { computed, ref } from "vue";
import { useResponsiveLayout } from "./useResponsiveLayout.js";

const STORAGE_KEY = "repoos-floating-heads-visible";
const stored = ref<boolean | null>(readStored());

function readStored(): boolean | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "true" ? true : value === "false" ? false : null;
}

/** Per-device display preference; the default follows the active composition. */
export function useFloatingHeadsPreference() {
  const { isNarrow } = useResponsiveLayout();
  const visible = computed(() => stored.value ?? !isNarrow.value);
  function setVisible(value: boolean): void {
    stored.value = value;
    localStorage.setItem(STORAGE_KEY, String(value));
  }
  return { visible, setVisible };
}
