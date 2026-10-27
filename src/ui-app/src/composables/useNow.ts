import { onScopeDispose, readonly, ref } from "vue";

// One timer for cards, drawers and stores. Dispose it with the last consumer.
const now = ref(Date.now());
let consumers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

export function useNow() {
  consumers++;
  now.value = Date.now();
  clearInterval(timer);
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  onScopeDispose(() => {
    if (--consumers === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  return readonly(now);
}
