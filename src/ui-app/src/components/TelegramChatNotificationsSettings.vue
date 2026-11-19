<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { api, JSON_OPTS } from "../api";
import { useConfigStore } from "../stores/config";
import Switch from "./ui/switch.vue";

interface TelegramChatNotificationRow {
  telegramChatId: number;
  chatType: string;
  title: string | null;
  notificationsEnabled: boolean;
}

const config = useConfigStore();
const telegramChats = ref<TelegramChatNotificationRow[]>([]);
const telegramChatsLoading = ref(false);
/** Set when the chat list fails to load, so it is never shown as "no chats". */
const loadError = ref("");
/** Set when a single toggle fails; cleared at the start of the next attempt. */
const toggleError = ref("");

async function loadTelegramChatNotifications(): Promise<void> {
  if (!config.form["telegram.enabled"]) {
    telegramChats.value = [];
    loadError.value = "";
    return;
  }
  telegramChatsLoading.value = true;
  loadError.value = "";
  try {
    const data = await api<{ chats: TelegramChatNotificationRow[] }>("/api/auth/telegram/chats");
    telegramChats.value = data.chats ?? [];
  } catch {
    telegramChats.value = [];
    loadError.value = "Couldn't load your Telegram chats. Check the connection, then try again.";
  } finally {
    telegramChatsLoading.value = false;
  }
}

async function setTelegramChatNotifications(
  chat: TelegramChatNotificationRow,
  enabled: boolean,
): Promise<void> {
  toggleError.value = "";
  try {
    await api(`/api/auth/telegram/chats/${chat.telegramChatId}`, {
      ...JSON_OPTS("PATCH", { notificationsEnabled: enabled }),
    });
    await loadTelegramChatNotifications();
  } catch {
    toggleError.value = `Couldn't turn notifications ${enabled ? "on" : "off"} for ${chatName(chat)}. Try again.`;
  }
}

function chatName(chat: TelegramChatNotificationRow): string {
  return chat.title || `chat ${chat.telegramChatId}`;
}

onMounted(() => {
  void loadTelegramChatNotifications();
});

watch(
  () => config.form["telegram.enabled"],
  () => {
    void loadTelegramChatNotifications();
  },
);
</script>

<template>
  <template v-if="config.form['telegram.enabled']">
    <div v-if="telegramChatsLoading" class="setting-desc" style="padding: 8px 0 12px">
      Loading bound chats…
    </div>
    <div v-else-if="loadError" class="ff-error" style="margin: 8px 0 12px">{{ loadError }}</div>
    <div v-else-if="telegramChats.length === 0" class="setting-desc" style="padding: 8px 0 12px">
      No Telegram chats are connected yet. In the group or private chat you want, send
      <code>/bind</code> followed by a bind code from an administrator. There is no button for bind
      codes yet, so an administrator creates one through the API.
    </div>
    <div v-if="toggleError" class="ff-error" style="margin: 0 0 8px">{{ toggleError }}</div>
    <div
      v-for="chat in telegramChats"
      :key="chat.telegramChatId"
      :id="'setting-telegram.chat.' + chat.telegramChatId + '.notifications'"
      class="setting-row"
    >
      <div class="setting-info">
        <div class="setting-label">{{ chat.title || "Chat " + chat.telegramChatId }}</div>
        <div class="setting-desc">
          {{ chat.chatType }} · id {{ chat.telegramChatId }} · task lifecycle notifications for this
          repository.
        </div>
      </div>
      <div class="setting-input">
        <Switch
          :checked="chat.notificationsEnabled"
          :disabled="config.saving"
          :aria-label="`Task notifications for ${chatName(chat)}`"
          @update:checked="(v) => setTelegramChatNotifications(chat, !!v)"
        />
      </div>
    </div>
  </template>
</template>
