<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { LogOut, Moon, RefreshCw, RotateCcw, Sun, User } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useAuthStore } from "../stores/auth";
import SearchBar from "./SearchBar.vue";

const repo = useRepoStore();
const config = useConfigStore();
const auth = useAuthStore();
const { health, connected, loading, newVersion, restarting } = storeToRefs(repo);
const { repoName } = storeToRefs(repo);

const isDark = computed(() => config.effectiveTheme === "dark");
const isPreviewBuild = computed(() => health.value?.isPreviewBuild ?? false);

const connState = computed<"loading" | "live" | "offline">(() => {
  if (loading.value) return "loading";
  return connected.value ? "live" : "offline";
});

function toggleTheme(): void {
  void config.setTheme(isDark.value ? "light" : "dark");
}

const PALETTE = [
  "#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9",
  "#BAE1FF", "#D4BAFF", "#FFBAE1", "#BAFFED",
  "#FFC8BA", "#E8BAFF", "#BAF2FF", "#C9FFBA",
];

const COLOR_KEY_PREFIX = "repoos.repoColor.";

const popoverOpen = ref(false);
const savedColor = ref<string | null>(null);

function localStorageKey(name: string): string {
  return COLOR_KEY_PREFIX + name.toLowerCase().replace(/\//g, "-");
}

function loadSavedColor(): void {
  if (!repoName.value) return;
  savedColor.value = localStorage.getItem(localStorageKey(repoName.value));
}

function textColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#1a1a2e" : "#fff";
}

const pillStyle = computed(() => {
  if (!savedColor.value) return {};
  return {
    backgroundColor: savedColor.value,
    color: textColorFor(savedColor.value),
    borderColor: "transparent",
  };
});

const pillTextStyle = computed(() => {
  if (!savedColor.value) return {};
  return { color: textColorFor(savedColor.value) };
});

function togglePopover(): void {
  popoverOpen.value = !popoverOpen.value;
}

function selectColor(color: string): void {
  if (!repoName.value) return;
  const key = localStorageKey(repoName.value);
  if (savedColor.value === color) {
    localStorage.removeItem(key);
    savedColor.value = null;
  } else {
    localStorage.setItem(key, color);
    savedColor.value = color;
  }
  popoverOpen.value = false;
}

function clearColor(): void {
  if (!repoName.value) return;
  localStorage.removeItem(localStorageKey(repoName.value));
  savedColor.value = null;
  popoverOpen.value = false;
}

const userMenuOpen = ref(false);
const userMenuTrigger = ref<InstanceType<typeof HTMLButtonElement> | null>(null);
const userMenuPopover = ref<InstanceType<typeof HTMLDivElement> | null>(null);

function toggleUserMenu(): void {
  userMenuOpen.value = !userMenuOpen.value;
}

function closeAndFocusTrigger(): void {
  userMenuOpen.value = false;
  nextTick(() => {
    userMenuTrigger.value?.focus();
  });
}

function onUserMenuKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  const popover = userMenuPopover.value;
  if (!popover) return;
  const focusable = popover.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

watch(userMenuOpen, (open) => {
  if (open) {
    nextTick(() => {
      const popover = userMenuPopover.value;
      if (!popover) return;
      const first = popover.querySelector<HTMLElement>("button");
      first?.focus();
    });
  }
});

function onDocumentMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (target.closest(".repo-pill-wrapper")) return;
  popoverOpen.value = false;
  if (target.closest(".user-menu-wrapper")) return;
  userMenuOpen.value = false;
}

function onDocumentKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    popoverOpen.value = false;
    if (userMenuOpen.value) {
      closeAndFocusTrigger();
    }
  }
}

onMounted(() => {
  loadSavedColor();
  document.addEventListener("mousedown", onDocumentMouseDown);
  document.addEventListener("keydown", onDocumentKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDocumentMouseDown);
  document.removeEventListener("keydown", onDocumentKeyDown);
});

watch(repoName, () => {
  loadSavedColor();
});
</script>

<template>
  <div class="topbar">
    <span v-if="isPreviewBuild" class="preview-build-banner">Preview Build</span>
    <div class="logo-mark">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="var(--cyan)" stroke-width="2" stroke-linejoin="round" />
        <path d="M12 7v10M8 9.5v5M16 9.5v5" stroke="var(--violet)" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </div>
    <div class="brand hidden sm:inline">RepoOS<small>repo is the os</small></div>
    <div v-if="health" class="repo-pill-wrapper">
      <button class="repo-pill" type="button" :aria-expanded="popoverOpen" :style="pillStyle" @click="togglePopover">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M6 3v12a3 3 0 003 3h6M6 3a2 2 0 100 4 2 2 0 000-4zM18 18a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.8" />
        </svg>
        <span class="mono" :style="pillTextStyle">{{ repoName }}</span>
      </button>
      <div v-if="popoverOpen" class="repo-color-popover">
        <div class="repo-color-grid">
          <button
            v-for="color in PALETTE"
            :key="color"
            type="button"
            class="repo-color-swatch"
            :class="{ selected: savedColor === color }"
            :style="{ backgroundColor: color }"
            :aria-label="`Set color ${color}`"
            :aria-pressed="savedColor === color"
            :title="color"
            @click="selectColor(color)"
          />
        </div>
        <button type="button" class="repo-color-default" @click="clearColor">
          Default
        </button>
      </div>
    </div>
    <div class="spacer"></div>
    <SearchBar />
    <button
      v-if="newVersion"
      type="button"
      class="version-notice"
      :disabled="restarting"
      @click="repo.restartServer()"
    >
      <RefreshCw v-if="restarting" class="size-[13px] icon-spin" />
      <RotateCcw v-else class="size-[13px]" />
      <span>{{ restarting ? "Restarting…" : "New version available" }}</span>
    </button>
    <div class="spacer"></div>
    <button
      class="theme-toggle"
      type="button"
      :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Moon v-if="isDark" :size="15" :stroke-width="1.8" />
      <Sun v-else :size="15" :stroke-width="1.8" />
    </button>
    <div v-if="auth.authEnabled && auth.authenticated" class="user-menu-wrapper">
      <button
        class="user-menu-trigger"
        type="button"
        aria-label="User menu"
        aria-haspopup="menu"
        :aria-expanded="userMenuOpen"
        @click="toggleUserMenu"
      >
        <User :size="15" :stroke-width="1.8" />
      </button>
      <div v-if="userMenuOpen" ref="userMenuPopover" class="user-menu-popover" role="menu" tabindex="-1" @keydown="onUserMenuKeyDown">
        <span class="user-menu-email mono" role="menuitem" :title="auth.email ?? undefined">{{ auth.email }}</span>
        <button class="user-menu-logout" type="button" role="menuitem" @click="auth.logout()">
          <LogOut :size="13" :stroke-width="1.8" />
          <span>Log out</span>
        </button>
      </div>
    </div>
    <div
      class="conn"
      :class="connState"
      :aria-label="`Server connection: ${connState}`"
      :title="`Server connection: ${connState}`"
    >
      <span class="dot"></span><span class="conn-text">{{ connState }}</span>
    </div>
  </div>
</template>

<style scoped>
.repo-pill-wrapper {
  position: relative;
}
.repo-color-popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  width: max-content;
  max-width: 200px;
}
.repo-color-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.repo-color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.15s, transform 0.1s;
}
.repo-color-swatch:hover {
  transform: scale(1.15);
}
.repo-color-swatch.selected {
  border-color: var(--txt);
}
.repo-color-default {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 4px 0;
  font-size: 11px;
  color: var(--txt-dim);
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
}
.repo-color-default:hover {
  color: var(--txt);
  border-color: var(--txt-dim);
}
.user-menu-wrapper {
  position: relative;
}
.user-menu-trigger {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--txt-dim);
  cursor: pointer;
  transition: .15s;
}
.user-menu-trigger:hover {
  color: var(--txt);
  border-color: var(--border-bright);
  background: var(--panel-solid);
}
.user-menu-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  width: max-content;
  min-width: 160px;
  max-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-menu-email {
  display: block;
  font-size: 12px;
  color: var(--txt-dim);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
}
.user-menu-logout {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--red-tint);
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: .15s;
}
.user-menu-logout:hover {
  background: var(--red-tint);
  color: var(--txt);
  border-color: transparent;
}
</style>
