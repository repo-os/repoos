import { ref, watch, type Ref } from "vue";

/**
 * Track the "queued while busy" state for an AI chat (#0821).
 *
 * A chat stays usable while a turn is running: a send is accepted and the
 * composer shows "Queued — will be read when the current turn ends" until the
 * turn ends. Shared so PM, Debugger, CTO and Ross behave identically.
 *
 * `markQueued()` is called after the server answers `queued: true`; the flag
 * clears when the busy signal falls, i.e. the turn the message was waiting on
 * has ended.
 */
export function useQueuedSend(isBusy: () => boolean): {
  queued: Ref<boolean>;
  markQueued: () => void;
} {
  const queued = ref(false);
  watch(isBusy, (busy, was) => {
    if (was && !busy) queued.value = false;
  });
  return { queued, markQueued: () => (queued.value = true) };
}
