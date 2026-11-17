<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { LogOut, Moon, RefreshCw, RotateCcw, Sun, User } from "lucide-vue-next";
import { useRepoStore } from "../stores/repo";
import { useConfigStore } from "../stores/config";
import { useAuthStore } from "../stores/auth";
import SearchBar from "./SearchBar.vue";
import NoticeBell from "./NoticeBell.vue";
import ReminderCards from "./ReminderCards.vue";
import RepoLogoMark from "./RepoLogoMark.vue";
import { readRepoColor, writeRepoColor } from "../repo-color";
import { readHubShellSession, returnToHubServerPicker } from "../lib/hub-shell";
import { useResponsiveLayout } from "../composables/useResponsiveLayout";

const repo = useRepoStore();
const config = useConfigStore();
const auth = useAuthStore();
const { isNarrow } = useResponsiveLayout();
const { health, streamDown, loading, newVersion, restarting } = storeToRefs(repo);
const { repoName, branch } = storeToRefs(repo);

/**
 * The native Hub adds a one-time token to the server URL (#1152). When it is
 * present (or remembered across a login redirect), the logo becomes the
 * one-action route back to the native server picker. A normal browser never
 * has it, so the logo stays decorative there.
 */
const hubSession = readHubShellSession();

function onLogoActivate(): void {
  if (!hubSession) return;
  returnToHubServerPicker(hubSession);
}

const isDark = computed(() => config.effectiveTheme === "dark");
const isPreviewBuild = computed(() => health.value?.isPreviewBuild ?? false);

/** Truncate a branch name to a max length, showing the start and end with an ellipsis. */
function truncateBranch(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  const keep = Math.floor((maxLen - 1) / 2);
  return name.slice(0, keep + 1) + "\u2026" + name.slice(-keep);
}

/** The text shown in the repo pill: "repo" or "repo × branch" when in a worktree. */
const pillText = computed(() => {
  if (!repoName.value) return "";
  // A phone's top bar has room for the project name, not the worktree branch.
  // The narrow layout keeps the name visible and ellipsizes long values in CSS;
  // desktop keeps the branch affordance.
  if (isNarrow.value) return repoName.value;
  if (!branch.value) return repoName.value;
  return `${repoName.value} \u00d7 ${truncateBranch(branch.value, 20)}`;
});

const connState = computed<"loading" | "live" | "offline">(() => {
  if (loading.value) return "loading";
  // `streamDown` is the debounced signal (see repo store): the initial
  // connect window and sub-3s auto-reconnects don't count as offline, so the
  // red dot no longer flashes on every page load.
  return streamDown.value ? "offline" : "live";
});

function toggleTheme(): void {
  void config.setTheme(isDark.value ? "light" : "dark");
}

const PALETTE = ["#FFB3BA", "#FFFFBA", "#BAFFC9", "#BAE1FF", "#D4BAFF", "#BAFFED"];

// Dark-mode pastels, paired by hue with the light palette above. The six hue
// families are intentionally spaced apart so the picker remains easy to scan.
const DARK_PALETTE = ["#E07A8A", "#E4C86B", "#7FD9A0", "#6FB3E0", "#9E8FD0", "#6FD4C4"];

const ALL_COLORS = [...PALETTE, ...DARK_PALETTE];

const popoverOpen = ref(false);
const savedColor = ref<string | null>(null);

function loadSavedColor(): void {
  if (!repoName.value) return;
  savedColor.value = readRepoColor(repoName.value);
  applyColorCues(savedColor.value);
}

/**
 * Build a data-URI SVG favicon tinted with the chosen repo color: a rounded
 * square in that color with the RepoOS diamond mark as a black outline — the
 * same geometry as the default `/favicon.svg`, so switching repos gives an
 * at-a-glance color cue in the tab bar.
 */
function faviconDataUri(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">` +
    `<rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="${color}" stroke="rgba(255,255,255,0.7)" stroke-width="0.8"/>` +
    `<path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="#000000" stroke-width="1.8" stroke-linejoin="round" fill="none" opacity="0.95"/>` +
    `<path d="M12 7v10M8 9.5v5M16 9.5v5" stroke="#000000" stroke-width="1.3" stroke-linecap="round" fill="none" opacity="0.7"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Point the browser tab icon at the chosen color (or the default when cleared). */
function applyFavicon(color: string | null): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.type = "image/svg+xml";
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = color ? faviconDataUri(color) : "/favicon.svg";
}

/**
 * Point the PWA manifest at a color-aware variant so the installed-app /
 * homescreen icon matches the tab favicon. The server renders the icon in the
 * requested color from the `c` query param (`/icons/icon-*.png?c=...`).
 */
function applyManifestColor(color: string | null): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = color
    ? `/manifest.webmanifest?c=${encodeURIComponent(color)}`
    : "/manifest.webmanifest";
}

/**
 * Point the iOS home-screen icon at a color-aware variant too (#1139). iOS
 * reads the `<link rel="apple-touch-icon">` tag, not the manifest, so keeping
 * it in sync is what makes the installed icon match the tab favicon.
 */
function applyAppleTouchIcon(color: string | null): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "apple-touch-icon";
    link.sizes = "180x180";
    document.head.appendChild(link);
  }
  link.href = color
    ? `/apple-touch-icon.png?c=${encodeURIComponent(color)}`
    : "/apple-touch-icon.png";
}

/** Apply the chosen color to the favicon + PWA manifest (null clears both). */
function applyColorCues(color: string | null): void {
  applyFavicon(color);
  applyManifestColor(color);
  applyAppleTouchIcon(color);
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
  const next = savedColor.value === color ? null : color;
  writeRepoColor(repoName.value, next);
  savedColor.value = next;
  applyColorCues(savedColor.value);
  popoverOpen.value = false;
}

function clearColor(): void {
  if (!repoName.value) return;
  writeRepoColor(repoName.value, null);
  savedColor.value = null;
  applyColorCues(null);
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

function trapTabKey(e: KeyboardEvent, popover: HTMLElement | null): void {
  if (e.key !== "Tab" || !popover) return;
  const focusable = popover.querySelectorAll<HTMLElement>(
    "button, [href], [tabindex]:not([tabindex='-1'])",
  );
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

function onUserMenuKeyDown(e: KeyboardEvent): void {
  trapTabKey(e, userMenuPopover.value);
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

/**
 * Help menu in the top bar. Deliberately NOT a `nav.ts` entry — this is a
 * persistent header affordance on every route, not a page. The first link
 * takes people to the in-app guided support/reporting flow; the rest are
 * external destinations (published docs + GitHub), so those URLs live in one place.
 */
const HELP_LINKS: { label: string; href: string }[] = [
  { label: "Docs", href: "https://docs.repoos.org" },
  { label: "GitHub Discussions", href: "https://github.com/repo-os/repoos/discussions" },
];

const helpMenuOpen = ref(false);
const helpMenuTrigger = ref<InstanceType<typeof HTMLButtonElement> | null>(null);
const helpMenuPopover = ref<InstanceType<typeof HTMLDivElement> | null>(null);

function toggleHelpMenu(): void {
  helpMenuOpen.value = !helpMenuOpen.value;
}

function closeHelpMenuAndFocusTrigger(): void {
  helpMenuOpen.value = false;
  nextTick(() => {
    helpMenuTrigger.value?.focus();
  });
}

function onHelpMenuKeyDown(e: KeyboardEvent): void {
  trapTabKey(e, helpMenuPopover.value);
}

watch(helpMenuOpen, (open) => {
  if (open) {
    nextTick(() => {
      helpMenuPopover.value?.querySelector<HTMLElement>("a, button")?.focus();
    });
  }
});

function onDocumentMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  if (!target.closest(".help-menu-wrapper")) helpMenuOpen.value = false;
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
    if (helpMenuOpen.value) {
      closeHelpMenuAndFocusTrigger();
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
    <button
      v-if="hubSession"
      type="button"
      class="logo-trigger"
      aria-label="Return to RepoOS Hub server picker"
      data-testid="hub-return-to-picker"
      @click="onLogoActivate"
    >
      <span class="logo-mark" aria-hidden="true"><RepoLogoMark /></span>
    </button>
    <div v-else class="logo-mark" aria-hidden="true"><RepoLogoMark /></div>
    <div class="brand hidden sm:inline">
      RepoOS
      <!-- <small>repo is the os</small> -->
    </div>
    <div v-if="health" class="repo-pill-wrapper">
      <button
        class="repo-pill"
        type="button"
        :aria-expanded="popoverOpen"
        :aria-label="`Repo colour${pillText ? ' · ' + pillText : ''}`"
        :style="pillStyle"
        @click="togglePopover"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 3v12a3 3 0 003 3h6M6 3a2 2 0 100 4 2 2 0 000-4zM18 18a2 2 0 100-4 2 2 0 000 4z"
            stroke="currentColor"
            stroke-width="1.8"
          />
        </svg>
        <span class="mono repo-pill-text" :style="pillTextStyle">{{ pillText }}</span>
      </button>
      <div v-if="popoverOpen" class="repo-color-popover">
        <div class="repo-color-grid">
          <button
            v-for="color in ALL_COLORS"
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
        <button type="button" class="repo-color-default" @click="clearColor">Default</button>
      </div>
    </div>
    <SearchBar />
    <div class="spacer"></div>
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
    <ReminderCards />
    <NoticeBell />
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
    <div class="help-menu-wrapper">
      <button
        ref="helpMenuTrigger"
        class="help-menu-trigger"
        type="button"
        aria-label="Help and support"
        aria-haspopup="menu"
        :aria-expanded="helpMenuOpen"
        title="Help and support"
        @click="toggleHelpMenu"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
          <path
            d="M9.4 9.2a2.7 2.7 0 015.1 1c0 1.8-2.5 2.1-2.5 3.6"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="12" cy="17.2" r="1" fill="currentColor" />
        </svg>
      </button>
      <div
        v-if="helpMenuOpen"
        ref="helpMenuPopover"
        class="help-menu-popover"
        role="menu"
        tabindex="-1"
        @keydown="onHelpMenuKeyDown"
      >
        <a
          class="help-menu-link"
          href="/settings?tab=support"
          role="menuitem"
          @click="helpMenuOpen = false"
          >Get help or report a bug</a
        >
        <a
          v-for="link in HELP_LINKS"
          :key="link.href"
          class="help-menu-link"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          @click="helpMenuOpen = false"
          >{{ link.label }}</a
        >
      </div>
    </div>
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
      <div
        v-if="userMenuOpen"
        ref="userMenuPopover"
        class="user-menu-popover"
        role="menu"
        tabindex="-1"
        @keydown="onUserMenuKeyDown"
      >
        <span class="user-menu-email mono" role="menuitem" :title="auth.email ?? undefined">{{
          auth.email
        }}</span>
        <button class="user-menu-logout" type="button" role="menuitem" @click="auth.logout()">
          <LogOut :size="13" :stroke-width="1.8" />
          <span>Log out</span>
        </button>
      </div>
    </div>
    <div
      v-if="connState === 'offline'"
      class="conn offline"
      role="status"
      aria-label="Server is disconnected"
      title="Server is disconnected"
    >
      <span class="dot"></span><span class="conn-text">offline</span>
    </div>
  </div>
</template>

<style scoped>
.repo-pill-wrapper {
  position: relative;
}
.logo-trigger {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.logo-trigger .logo-mark {
  width: 30px;
  height: 30px;
}
.logo-trigger:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.repo-color-popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 6px;
  background: var(--panel-solid);
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
  transition:
    border-color 0.15s,
    transform 0.1s;
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
.help-menu-wrapper {
  position: relative;
  flex-shrink: 0;
}
.help-menu-trigger {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--border-bright);
  background: var(--panel-solid);
  color: var(--txt);
  cursor: pointer;
  transition: 0.15s;
}
.help-menu-trigger:hover {
  color: var(--txt);
  border-color: var(--border-bright);
  background: var(--panel-solid);
}
.help-menu-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  background: var(--panel-solid);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  width: max-content;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.help-menu-link {
  display: block;
  padding: 7px 9px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--txt-dim);
  text-decoration: none;
  white-space: nowrap;
  transition: 0.15s;
}
.help-menu-link:hover {
  color: var(--txt);
  background: var(--panel-solid);
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
  border: 1px solid var(--border-bright);
  background: var(--panel-solid);
  color: var(--txt);
  cursor: pointer;
  transition: 0.15s;
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
  background: var(--panel-solid);
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
  color: var(--red);
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: 0.15s;
}
.user-menu-logout:hover {
  background: var(--red-tint);
  color: var(--txt);
  border-color: transparent;
}

/* Touch sizing (#1139): header controls and popover rows reach 44x44 on phone
   layouts, including landscape phones and small tablets where the compact
   shell runs but the top bar is still a pointer-sized row. */
@media (max-width: 900px) {
  /* The mark stays 30px visually, but the button's hit area is 44x44. The
     negative inline margins keep the original 30px layout width so the bar
     does not spend space on the padding. */
  .logo-trigger {
    width: 44px;
    height: 44px;
    margin-inline: -7px;
  }
  .help-menu-trigger,
  .user-menu-trigger {
    width: 44px;
    height: 44px;
  }
  .help-menu-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 10px 12px;
  }
  .user-menu-logout {
    min-height: 44px;
  }
}
@media (max-width: 719.98px) {
  /* The project chip keeps the current project name readable (#1152): it
     grows into the space the compact search button frees, and every title
     is ellipsized rather than pushing the bar wider than the viewport. The
     colour picker behind the chip is unchanged. */
  .repo-pill-wrapper {
    flex: 1 1 auto;
    min-width: 0;
  }
  .repo-pill {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0 8px;
    justify-content: flex-start;
    overflow: hidden;
  }
  /* The branch icon is decorative; dropping it on a phone gives the name the
     few pixels that make a long project title legible. */
  .repo-pill > svg {
    display: none;
  }
  .repo-pill-text {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .repo-color-grid {
    grid-template-columns: repeat(3, 44px);
    gap: 8px;
  }
  .repo-color-swatch {
    width: 44px;
    height: 44px;
  }
  .repo-color-default {
    min-height: 44px;
    padding: 10px 0;
  }
}
</style>
