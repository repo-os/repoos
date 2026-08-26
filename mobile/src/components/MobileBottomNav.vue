<template>
  <nav class="mobile-nav" role="navigation" aria-label="Main navigation">
    <router-link 
      v-for="item in navItems" 
      :key="item.id"
      :to="item.route"
      class="nav-item"
      :class="{ active: isActive(item.id) }"
      :aria-current="isActive(item.id) ? 'page' : undefined"
    >
      <span class="nav-icon" v-html="item.icon"></span>
      <span class="nav-label">{{ item.label }}</span>
    </router-link>
    
    <button 
      class="nav-item more-button"
      @click="openActionSheet"
      aria-label="More options"
    >
      <span class="nav-icon" v-html="moreIcon"></span>
      <span class="nav-label">More</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();

const emit = defineEmits<{
  (e: 'openActionSheet'): void;
}>();

const navItems = [
  {
    id: 'work',
    route: '/work',
    label: 'Work',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
        <rect x="3" y="4" width="4" height="16" rx="1" stroke="currentColor" stroke-width="1.8"/>
        <rect x="10" y="4" width="4" height="11" rx="1" stroke="currentColor" stroke-width="1.8"/>
        <rect x="17" y="4" width="4" height="7" rx="1" stroke="currentColor" stroke-width="1.8"/>
      </svg>
    `
  },
  {
    id: 'search',
    route: '/search',
    label: 'Search',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
        <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.8"/>
        <path d="m15.5 15.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `
  },
  {
    id: 'settings',
    route: '/settings',
    label: 'Settings',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.8"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.12 15a1.65 1.65 0 00-1.51-1H2.5a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 008.6 4.12a1.65 1.65 0 001-1.51V2.5a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21.5a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.8"/>
      </svg>
    `
  }
];

const moreIcon = `
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
    <circle cx="12" cy="12" r="1" fill="currentColor"/>
    <circle cx="12" cy="6" r="1" fill="currentColor"/>
    <circle cx="12" cy="18" r="1" fill="currentColor"/>
  </svg>
`;

const isActive = (id: string) => {
  return route.name === id;
};

const openActionSheet = () => {
  emit('openActionSheet');
};
</script>

<style scoped>
.mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  padding: 8px 6px calc(var(--safe-bot, 0px) + 8px);
  background: var(--tabbar-bg, linear-gradient(180deg, rgba(11, 16, 32, 0.7), rgba(7, 10, 18, 0.95)));
  backdrop-filter: blur(18px);
  border-top: 1px solid var(--border, rgba(120, 140, 200, 0.14));
  z-index: 100;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 5px 0;
  color: var(--txt-faint, #8a96b4);
  cursor: pointer;
  position: relative;
  text-decoration: none;
  border: none;
  background: none;
  font: inherit;
}

.nav-item.active {
  color: var(--cyan, #39e0ff);
}

.nav-item.active::before {
  content: "";
  position: absolute;
  top: 0;
  width: 20px;
  height: 3px;
  border-radius: 3px;
  background: var(--cyan, #39e0ff);
  box-shadow: 0 0 8px var(--cyan, #39e0ff);
}

.nav-icon {
  width: 20px;
  height: 20px;
}

.nav-label {
  font-size: 9px;
  font-weight: 600;
}

.more-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 5px 0;
  color: var(--txt-faint, #8a96b4);
  cursor: pointer;
  position: relative;
  text-decoration: none;
  border: none;
  background: none;
  font: inherit;
}
</style>