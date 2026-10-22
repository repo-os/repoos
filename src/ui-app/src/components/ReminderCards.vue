<script setup lang="ts">
/**
 * Due-reminder header cards (#0903): one small, brightly outlined card per due
 * reminder, sitting in the top bar immediately left of the alerts bell. Each
 * card shows a short excerpt of the reminder text; dismissing it hides that
 * card from the header only (the reminder is untouched and still rings in the
 * bell), and clicking it opens the Reminders surface focused on that reminder.
 *
 * Only the currently due set appears — the same reminders that feed the bell's
 * notice list — so upcoming ones never leak into the header.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { X } from "lucide-vue-next";
import {
  useRemindersStore,
  REMINDER_CARD_TEST_ID,
  REMINDER_CARD_DISMISS_TEST_ID,
} from "../stores/reminders";

const router = useRouter();
const store = useRemindersStore();

const cards = computed(() => store.dueCards);

/** A one-line excerpt the header can hold — the full text lives on the page. */
function excerpt(text: string, max = 56): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function openCard(id: string): void {
  void router.push(`/agents?tab=reminders&reminder=${id}`);
}
</script>

<template>
  <div v-if="cards.length" class="reminder-cards" role="group" aria-label="Due reminders">
    <div
      v-for="row in cards"
      :key="store.cardKey(row)"
      class="reminder-card"
      :data-test-id="REMINDER_CARD_TEST_ID"
    >
      <button type="button" class="reminder-card-body" @click="openCard(row.id)">
        <span class="reminder-card-title">{{ excerpt(row.text) }}</span>
        <span class="reminder-card-time">{{ store.countdown(row) }}</span>
      </button>
      <button
        type="button"
        class="reminder-card-x"
        :data-test-id="REMINDER_CARD_DISMISS_TEST_ID"
        :aria-label="`Dismiss reminder: ${excerpt(row.text, 40)}`"
        @click="store.dismissCard(row)"
      >
        <X :size="12" :stroke-width="2.4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.reminder-cards {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: min(48vw, 520px);
  overflow: hidden;
}
.reminder-card {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 250px;
  /* Bright outline so a due reminder stands out in light and dark. */
  border: 1px solid var(--amber);
  border-radius: 8px;
  background: linear-gradient(var(--amber-tint), var(--amber-tint)), var(--panel-solid);
  box-shadow: 0 0 0 1px var(--amber-tint);
  padding: 3px 3px 3px 9px;
}
.reminder-card-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: var(--txt);
  text-align: left;
}
.reminder-card-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--txt);
}
.reminder-card-time {
  flex: none;
  font-size: 10px;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  color: var(--amber);
}
.reminder-card-x {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--amber);
  cursor: pointer;
}
.reminder-card-x:hover {
  background: var(--nav-hover-bg);
  color: var(--txt);
}
.reminder-card-body:focus-visible,
.reminder-card-x:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 1px;
}
</style>
