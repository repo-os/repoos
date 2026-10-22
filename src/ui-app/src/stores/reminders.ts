import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api, JSON_OPTS } from "../api";
import type { Reminder, ReminderInput, ReminderLink } from "../../../core/reminders.js";

/**
 * Header-card dismissals (#0903): due reminders show as bright cards in the top
 * bar. Dismissing one hides only that card — the reminder itself is untouched
 * and still rings in the bell. The key is `id:fireAt` so snoozing a reminder
 * and having it come due again surfaces a fresh card.
 */
const DISMISSED_CARDS_KEY = "repoos.reminders.dismissedCards";
/** Cap the persisted set so a long-lived tab can never fill localStorage. */
const MAX_DISMISSED_CARDS = 100;

/** Stable test ids for the due-reminder header cards (test + review shot). */
export const REMINDER_CARD_TEST_ID = "reminder-card";
export const REMINDER_CARD_DISMISS_TEST_ID = "reminder-card-dismiss";

function readDismissedCards(): Record<string, true> {
  try {
    const raw = localStorage.getItem(DISMISSED_CARDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, true>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export const useRemindersStore = defineStore("reminders", () => {
  const reminders = ref<Reminder[]>([]);
  const links = ref<ReminderLink[]>([]);
  const now = ref(Date.now());
  const error = ref("");
  const loading = ref(false);
  // Preview-only shot data must not be replaced by an empty server snapshot.
  const fixturePinned = ref(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  let requestVersion = 0;
  const due = computed(() =>
    reminders.value.filter((r) => !r.doneAt && Date.parse(r.fireAt) <= now.value),
  );
  /** Dismissed header-card keys (`id:fireAt`) — persisted across reloads. */
  const dismissedCards = ref<Record<string, true>>(readDismissedCards());
  /** Stable per-due-instance key: a new fire time (snooze) gets a new card. */
  const cardKey = (row: Reminder): string => `${row.id}:${row.fireAt}`;
  const isCardDismissed = (row: Reminder): boolean => !!dismissedCards.value[cardKey(row)];
  /** Due reminders still shown as header cards (dismissed ones filtered out). */
  const dueCards = computed(() => due.value.filter((r) => !isCardDismissed(r)));

  function persistDismissedCards(): void {
    try {
      const keys = Object.keys(dismissedCards.value);
      if (keys.length > MAX_DISMISSED_CARDS) {
        dismissedCards.value = Object.fromEntries(
          keys.slice(keys.length - MAX_DISMISSED_CARDS).map((k) => [k, true as const]),
        );
      }
      localStorage.setItem(DISMISSED_CARDS_KEY, JSON.stringify(dismissedCards.value));
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }

  /** Hide one due reminder's header card; the reminder is not touched. */
  function dismissCard(row: Reminder): void {
    dismissedCards.value = { ...dismissedCards.value, [cardKey(row)]: true };
    persistDismissedCards();
  }

  const sorted = computed(() =>
    [...reminders.value].sort((a, b) => a.fireAt.localeCompare(b.fireAt)),
  );
  async function refresh(): Promise<void> {
    if (fixturePinned.value) return;
    const version = ++requestVersion;
    loading.value = true;
    try {
      const data = await api<{ reminders: Reminder[]; links: ReminderLink[] }>("/api/reminders");
      if (version !== requestVersion || fixturePinned.value) return;
      reminders.value = data.reminders;
      links.value = data.links;
      now.value = Date.now();
      error.value = "";
    } catch (e) {
      if (version === requestVersion) error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  }
  async function mutate(method: string, path: string, body?: unknown): Promise<void> {
    await api(path, {
      ...JSON_OPTS,
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    await refresh();
  }
  const add = (input: ReminderInput) => mutate("POST", "/api/reminders", input);
  const edit = (id: string, input: ReminderInput) => mutate("PATCH", `/api/reminders/${id}`, input);
  const done = (id: string) => mutate("POST", `/api/reminders/${id}/done`);
  const snooze = (id: string, fireAt: string) =>
    mutate("POST", `/api/reminders/${id}/snooze`, { fireAt });
  const remove = (id: string) => mutate("DELETE", `/api/reminders/${id}`);
  function start(): void {
    if (timer) return;
    void refresh();
    timer = setInterval(() => {
      now.value = Date.now();
      void refresh();
    }, 30_000);
  }
  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  function state(row: Reminder): Reminder["state"] {
    if (row.doneAt) return "done";
    const elapsed = now.value - Date.parse(row.fireAt);
    if (elapsed >= 86_400_000) return "overdue";
    if (elapsed >= 0) return "due";
    return row.snoozedAt ? "snoozed" : "upcoming";
  }
  function countdown(row: Reminder): string {
    if (row.doneAt) return "Completed";
    const diff = Date.parse(row.fireAt) - now.value;
    const minutes = Math.max(1, Math.ceil(Math.abs(diff) / 60_000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const duration = days
      ? `${days}d ${hours}h`
      : hours
        ? `${hours}h ${minutes % 60}m`
        : `${minutes}m`;
    return diff > 0 ? `in ${duration}` : `${duration} ago`;
  }
  return {
    reminders,
    links,
    now,
    error,
    loading,
    fixturePinned,
    due,
    dueCards,
    dismissedCards,
    cardKey,
    isCardDismissed,
    dismissCard,
    sorted,
    refresh,
    add,
    edit,
    done,
    snooze,
    remove,
    start,
    stop,
    state,
    countdown,
  };
});
