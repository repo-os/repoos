import { onMounted, onUnmounted, readonly, ref } from "vue";

function readIsNarrow(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 719.98px)").matches;
  }
  return window.innerWidth < 720;
}

/** The phone shell follows available CSS width, including resize and rotation. */
export function useResponsiveLayout() {
  // Resolve the initial viewport synchronously: immediate route watchers need
  // the correct layout before onMounted runs (notably /work?task=<id> links).
  const isNarrow = ref(readIsNarrow());
  let query: MediaQueryList | undefined;

  const sync = (): void => {
    isNarrow.value = query?.matches ?? window.innerWidth < 720;
  };
  const onResize = (): void => {
    isNarrow.value = window.innerWidth < 720;
  };

  onMounted(() => {
    if (typeof window.matchMedia === "function") {
      query = window.matchMedia("(max-width: 719.98px)");
      sync();
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", sync);
      } else {
        query.addListener?.(sync);
      }
    } else {
      onResize();
      window.addEventListener("resize", onResize);
    }
  });
  onUnmounted(() => {
    if (query && typeof query.removeEventListener === "function") {
      query.removeEventListener("change", sync);
    } else {
      query?.removeListener?.(sync);
    }
    window.removeEventListener("resize", onResize);
  });

  return { isNarrow: readonly(isNarrow) };
}
