<template>
  <header class="connected-header">
    <button class="header-btn back" @click="goBack" aria-label="Back to server picker">
      ←
    </button>
    <div class="server-info" @click="switchServer">
      <span class="server-name">{{ serverName }}</span>
      <span class="server-status" :class="statusClass">● {{ statusText }}</span>
    </div>
    <button class="header-btn menu" @click="openActionSheet" aria-label="More options">
      ⋯
    </button>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  serverName: string;
  serverStatus: 'online' | 'offline' | 'loading';
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'switch'): void;
  (e: 'openActionSheet'): void;
}>();

const goBack = () => {
  emit('back');
};

const switchServer = () => {
  emit('switch');
};

const openActionSheet = () => {
  emit('openActionSheet');
};

const statusClass = computed(() => ({
  online: props.serverStatus === 'online',
  offline: props.serverStatus === 'offline',
  loading: props.serverStatus === 'loading'
}));

const statusText = computed(() => {
  switch (props.serverStatus) {
    case 'online': return 'Online';
    case 'offline': return 'Offline';
    case 'loading': return 'Connecting';
    default: return 'Unknown';
  }
});
</script>

<style scoped>
.connected-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--panel);
  color: var(--txt);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.server-info {
  flex: 1;
  text-align: center;
  padding: 0 12px;
  cursor: pointer;
}

.server-name {
  font-weight: 600;
  font-size: 16px;
}

.server-status {
  font-size: 12px;
  margin-left: 8px;
}

.server-status.online {
  color: var(--green);
}

.server-status.offline {
  color: var(--red);
}

.server-status.loading {
  color: var(--amber);
}
</style>