<template>
  <div class="connected-shell">
    <ConnectedHeader 
      :server-name="serverName"
      :server-status="serverStatus"
      @back="goBack"
      @switch="switchServer"
      @open-action-sheet="openActionSheet"
    />
    
    <main class="main-content">
      <router-view />
    </main>
    
    <MobileBottomNav @open-action-sheet="openActionSheet" />
    
    <ActionSheet 
      v-if="showActionSheet"
      :items="actionSheetItems"
      @close="closeActionSheet"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import ConnectedHeader from '../components/ConnectedHeader.vue';
import MobileBottomNav from '../components/MobileBottomNav.vue';
import ActionSheet from '../components/ActionSheet.vue';
import { closeServer } from '../browser';
import { selected } from '../app-state';

const router = useRouter();
const showActionSheet = ref(false);

// Mock server data - in a real implementation this would come from app state
const serverName = computed(() => selected.value?.name || 'Server');
const serverStatus = ref<'online' | 'offline' | 'loading'>('online');

const goBack = () => {
  // Go back to the server picker
  router.push('/');
};

const switchServer = () => {
  // Close the current server and go back to picker
  closeServer();
  router.push('/');
};

const openActionSheet = () => {
  showActionSheet.value = true;
};

const closeActionSheet = () => {
  showActionSheet.value = false;
};

const actionSheetItems = [
  {
    id: 'agents',
    label: 'Agents',
    action: () => router.push('/agents')
  },
  {
    id: 'context',
    label: 'Context',
    action: () => router.push('/context')
  },
  {
    id: 'activity',
    label: 'Activity',
    action: () => router.push('/activity')
  },
  {
    id: 'servers',
    label: 'Server Connections',
    action: switchServer
  }
];
</script>

<style scoped>
.connected-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding-top: calc(env(safe-area-inset-top, 0px) + 56px); /* Header height */
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 60px); /* Nav height estimate */
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 18px 16px;
}

/* Hide desktop components when in mobile shell */
.topbar, .sidebar, .integration-panel {
  display: none !important;
}
</style>