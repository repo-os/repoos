<template>
  <nav class="mobile-tab-bar" role="navigation">
    <router-link to="/work" class="tab-button" :class="{ active: isActive('work') }">
      <div class="tab-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="4" height="16" rx="1" stroke="currentColor" stroke-width="1.8"/>
          <rect x="10" y="4" width="4" height="11" rx="1" stroke="currentColor" stroke-width="1.8"/>
          <rect x="17" y="4" width="4" height="7" rx="1" stroke="currentColor" stroke-width="1.8"/>
        </svg>
      </div>
      <span class="tab-label">Work</span>
    </router-link>

    <router-link to="/search" class="tab-button" :class="{ active: isActive('search') }">
      <div class="tab-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.8"/>
          <path d="m15.5 15.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="tab-label">Search</span>
    </router-link>

    <button class="tab-button" @click="openActionSheet">
      <div class="tab-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="6" r="1" fill="currentColor"/>
          <circle cx="12" cy="18" r="1" fill="currentColor"/>
        </svg>
      </div>
      <span class="tab-label">More</span>
    </button>

    <router-link to="/settings" class="tab-button" :class="{ active: isActive('settings') }">
      <div class="tab-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.8"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.12 15a1.65 1.65 0 00-1.51-1H2.5a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 008.6 4.12a1.65 1.65 0 001-1.51V2.5a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21.5a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.8"/>
        </svg>
      </div>
      <span class="tab-label">Settings</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();

const emit = defineEmits<{
  (e: 'openActionSheet'): void;
}>();

const isActive = (tabName: string) => {
  return route.name === tabName;
};

const openActionSheet = () => {
  emit('openActionSheet');
};
</script>

<style scoped>
.mobile-tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 8px 6px calc(env(safe-area-inset-bottom, 0px) + 8px);
  background: var(--ion-tab-bar-background, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(18px);
  border-top: 1px solid var(--ion-tab-bar-border-color, rgba(0, 0, 0, 0.1));
  z-index: 100;
}

.tab-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 5px 0;
  color: var(--ion-color-medium, #8c8c8c);
  cursor: pointer;
  position: relative;
  text-decoration: none;
  border: none;
  background: none;
  font: inherit;
  flex: 1;
  justify-content: center;
}

.tab-button:hover {
  color: var(--ion-color-primary, #3880ff);
}

.tab-button.active {
  color: var(--ion-color-primary, #3880ff);
}

.tab-button.active::before {
  content: "";
  position: absolute;
  top: 0;
  width: 20px;
  height: 3px;
  border-radius: 3px;
  background: var(--ion-color-primary, #3880ff);
  box-shadow: 0 0 8px var(--ion-color-primary, #3880ff);
}

.tab-icon {
  width: 20px;
  height: 20px;
}

.tab-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
</style>