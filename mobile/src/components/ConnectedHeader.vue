<template>
  <header class="connected-header">
    <div class="header-content">
      <button class="back-button" @click="goBack">
        ← Picker
      </button>
      
      <div class="server-info" @click="switchServer">
        <div class="server-header">
          <span class="server-name">{{ serverName }}</span>
          <span 
            class="server-status"
            :class="statusClass"
          >
            {{ statusText }}
          </span>
        </div>
      </div>
      
      <button class="menu-button" @click="openActionSheet">
        ⋯
      </button>
    </div>
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
  'status-online': props.serverStatus === 'online',
  'status-offline': props.serverStatus === 'offline',
  'status-loading': props.serverStatus === 'loading'
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
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--ion-toolbar-background, #f8f9fa);
  border-bottom: 1px solid var(--ion-toolbar-border-color, #e0e0e0);
  padding: env(safe-area-inset-top, 0) 0 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  min-height: 56px;
}

.back-button {
  background: none;
  border: none;
  color: var(--ion-color-primary, #3880ff);
  font-size: 14px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.back-button:hover {
  background: var(--ion-background-color-hover, rgba(0, 0, 0, 0.05));
}

.server-info {
  flex: 1;
  text-align: center;
  cursor: pointer;
  padding: 0 16px;
}

.server-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.server-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--ion-text-color, #000000);
}

.server-status {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.status-online {
  background: var(--ion-color-success-tint, rgba(38, 196, 95, 0.15));
  color: var(--ion-color-success, #26c45f);
}

.status-offline {
  background: var(--ion-color-danger-tint, rgba(255, 93, 93, 0.15));
  color: var(--ion-color-danger, #ff5d5d);
}

.status-loading {
  background: var(--ion-color-warning-tint, rgba(255, 193, 7, 0.15));
  color: var(--ion-color-warning, #ffc107);
}

.menu-button {
  background: none;
  border: none;
  color: var(--ion-text-color, #000000);
  font-size: 20px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.menu-button:hover {
  background: var(--ion-background-color-hover, rgba(0, 0, 0, 0.05));
}
</style>