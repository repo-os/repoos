/**
 * #0903 — due reminders render as bright header cards beside the alerts bell:
 * excerpt, dismiss (header-only), and click-through to the reminders surface.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import ReminderCards from "../src/components/ReminderCards.vue";
import {
  useRemindersStore,
  REMINDER_CARD_TEST_ID,
  REMINDER_CARD_DISMISS_TEST_ID,
} from "../src/stores/reminders";
import type { Reminder } from "../../core/reminders.js";

const DUE_ID = "00000000-0000-4000-8000-000000000001";
const UPCOMING_ID = "00000000-0000-4000-8000-000000000002";

function reminder(over: Partial<Reminder> & Pick<Reminder, "id" | "text" | "fireAt">): Reminder {
  return {
    link: "",
    doneAt: "",
    snoozedAt: "",
    notifiedFireAt: "",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    state: "due",
    ...over,
  };
}

let pinia: Pinia;
let router: Router;

function mountCards(): VueWrapper {
  return mount(ReminderCards, { global: { plugins: [pinia, router] } });
}

beforeEach(async () => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/agents", name: "agents", component: { template: "<div />" } },
      { path: "/", name: "home", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  await router.isReady();
});

afterEach(() => {
  localStorage.clear();
});

describe("due-reminder header cards (#0903)", () => {
  it("shows a card per due reminder and never upcoming ones", async () => {
    const store = useRemindersStore();
    const now = Date.now();
    store.now = now;
    store.reminders = [
      reminder({
        id: DUE_ID,
        text: "Check Cursor credit",
        fireAt: new Date(now - 60_000).toISOString(),
      }),
      reminder({
        id: UPCOMING_ID,
        text: "Check OpenRouter next week",
        fireAt: new Date(now + 86_400_000).toISOString(),
        state: "upcoming",
      }),
    ];

    const wrapper = mountCards();
    await flushPromises();

    const cards = wrapper.findAll(`[data-test-id="${REMINDER_CARD_TEST_ID}"]`);
    expect(cards).toHaveLength(1);
    expect(wrapper.text()).toContain("Check Cursor credit");
    expect(wrapper.text()).not.toContain("Check OpenRouter next week");
  });

  it("excerpts long reminder text instead of showing the whole body", async () => {
    const store = useRemindersStore();
    const now = Date.now();
    store.now = now;
    const long = "Check the provider credit and confirm everything is back online after the window";
    store.reminders = [
      reminder({ id: DUE_ID, text: long, fireAt: new Date(now - 60_000).toISOString() }),
    ];

    const wrapper = mountCards();
    await flushPromises();

    const shown = wrapper.get(".reminder-card-title").text();
    expect(shown.length).toBeLessThan(long.length);
    expect(shown.endsWith("…")).toBe(true);
  });

  it("dismisses a card from the header without deleting the reminder", async () => {
    const store = useRemindersStore();
    const now = Date.now();
    store.now = now;
    store.reminders = [
      reminder({
        id: DUE_ID,
        text: "Check Cursor credit",
        fireAt: new Date(now - 60_000).toISOString(),
      }),
    ];

    const wrapper = mountCards();
    await flushPromises();
    expect(wrapper.find(`[data-test-id="${REMINDER_CARD_TEST_ID}"]`).exists()).toBe(true);

    await wrapper.get(`[data-test-id="${REMINDER_CARD_DISMISS_TEST_ID}"]`).trigger("click");
    await flushPromises();

    expect(wrapper.find(`[data-test-id="${REMINDER_CARD_TEST_ID}"]`).exists()).toBe(false);
    // The reminder itself survives — only the header card was hidden.
    expect(store.reminders).toHaveLength(1);
    expect(store.due).toHaveLength(1);
    expect(store.dueCards).toHaveLength(0);
    expect(localStorage.getItem("repoos.reminders.dismissedCards")).toContain(DUE_ID);
  });

  it("resurfaces the card when a snoozed reminder comes due again", async () => {
    const store = useRemindersStore();
    const now = Date.now();
    store.now = now;
    const firstFire = new Date(now - 60_000).toISOString();
    store.reminders = [reminder({ id: DUE_ID, text: "Check Cursor credit", fireAt: firstFire })];

    const wrapper = mountCards();
    await flushPromises();
    await wrapper.get(`[data-test-id="${REMINDER_CARD_DISMISS_TEST_ID}"]`).trigger("click");
    await flushPromises();
    expect(wrapper.find(`[data-test-id="${REMINDER_CARD_TEST_ID}"]`).exists()).toBe(false);

    // A new fire time is a new due instance, so its card reappears.
    store.reminders = [
      reminder({
        id: DUE_ID,
        text: "Check Cursor credit",
        fireAt: new Date(now - 30_000).toISOString(),
      }),
    ];
    await flushPromises();
    expect(wrapper.find(`[data-test-id="${REMINDER_CARD_TEST_ID}"]`).exists()).toBe(true);
  });

  it("opens the reminders surface focused on the reminder when a card is clicked", async () => {
    const store = useRemindersStore();
    const now = Date.now();
    store.now = now;
    store.reminders = [
      reminder({
        id: DUE_ID,
        text: "Check Cursor credit",
        fireAt: new Date(now - 60_000).toISOString(),
      }),
    ];

    const wrapper = mountCards();
    await flushPromises();
    await wrapper.get(".reminder-card-body").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/agents");
    expect(router.currentRoute.value.query).toMatchObject({
      tab: "reminders",
      reminder: DUE_ID,
    });
  });
});
