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

async function loadTelegramChatNotifications(): Promise<void> {
  if (!config.form["telegram.enabled"]) {
    telegramChats.value = [];
    return;
  }
  telegramChatsLoading.value = true;
  try {
    const data = await api<{ chats: TelegramChatNotificationRow[] }>("/api/auth/telegram/chats");
    telegramChats.value = data.chats ?? [];
  } catch {
    telegramChats.value = [];
  } finally {
    telegramChatsLoading.value = false;
  }
}

async function setTelegramChatNotifications(chatId: number, enabled: boolean): Promise<void> {
  await api(`/api/auth/telegram/chats/${chatId}`, {
    ...JSON_OPTS,
    method: "PATCH",
    body: JSON.stringify({ notificationsEnabled: enabled }),
  });
  await loadTelegramChatNotifications();
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
      Loading bound chats...
    </div>
    <div v-else-if="telegramChats.length === 0" class="setting-desc" style="padding: 8px 0 12px">
      No Telegram chats are bound yet. Bind a group or private chat from the admin API before task
      notifications can be delivered there.
    </div>
    <div
      v-for="chat in telegramChats"
      :key="chat.telegramChatId"
      :id="'setting-telegram.chat.' + chat.telegramChatId + '.notifications'"
      class="setting-row"
    >
      <div class="setting-info">
        <div class="setting-label">{{ chat.title || "Chat " + chat.telegramChatId }}</div>
        <div class="setting-desc">
          {{ chat.chatType }} · id {{ chat.telegramChatId }} - task lifecycle notifications for this
          repository.
        </div>
      </div>
      <div class="setting-input">
        <Switch
          :checked="chat.notificationsEnabled"
          :disabled="config.saving"
          @update:checked="(v) => setTelegramChatNotifications(chat.telegramChatId, !!v)"
        />
      </div>
    </div>
  </template>
</template>
