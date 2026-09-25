<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfigStore, DESIGN_THEMES } from "../stores/config";
import { useUiStore } from "../stores/ui";
import { useRepoStore } from "../stores/repo";
import {
  useNotificationsStore,
  NOTIFICATION_TYPE_LABELS,
  PUSH_AVAILABILITY_HELP,
  type NotificationType,
} from "../stores/notifications";
import { api, JSON_OPTS } from "../api";
import { highlightToml } from "../lib/toml-highlight";
import Button from "../components/ui/button.vue";
import Card from "../components/ui/card.vue";
import Input from "../components/ui/input.vue";
import Switch from "../components/ui/switch.vue";
import AuthSettingsPanel from "../components/AuthSettingsPanel.vue";
import ServiceSettings from "../components/ServiceSettings.vue";
import Select from "../components/ui/select/root.vue";
import SelectContent from "../components/ui/select/content.vue";
import SelectItem from "../components/ui/select/item.vue";
import SelectTrigger from "../components/ui/select/trigger.vue";
import SelectValue from "../components/ui/select/value.vue";
import SelectViewport from "../components/ui/select/viewport.vue";

const config = useConfigStore();
const ui = useUiStore();
const repo = useRepoStore();
const notifications = useNotificationsStore();
const notificationTypes = ["review", "paused", "stuck", "needsInput"] as NotificationType[];
const route = useRoute();
const router = useRouter();

// ---- Tab navigation ----

type TabId = "general" | "notifications" | "security" | "advanced" | "support" | "toml";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "advanced", label: "Advanced" },
  { id: "support", label: "Support" },
  { id: "toml", label: "repoos.toml" },
];

/** Which settings fields live on which tab (for ?focus= routing) */
const FIELD_TAB: Record<string, TabId> = {
  // General tab
  tunnelEnabled: "general",
  "remoteValidation.enabled": "general",
  // Notifications tab
  ntfyEnabled: "notifications",
  ntfyTopic: "notifications",
  // Security tab
  "auth.enabled": "security",
  "auth.sessionMaxAge": "security",
};

const activeTab = computed<TabId>(() => {
  const q = route.query.tab;
  if (
    q === "notifications" ||
    q === "security" ||
    q === "advanced" ||
    q === "support" ||
    q === "toml"
  ) {
    return q;
  }
  return "general";
});

function setTab(id: TabId): void {
  void router.replace({ name: "settings", query: { ...route.query, tab: id } });
}

// Keyboard navigation across tabs (arrow keys, Home, End)
const tablistRef = ref<HTMLElement | null>(null);

function onTabKeydown(e: KeyboardEvent, idx: number): void {
  let next = idx;
  if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
  else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = TABS.length - 1;
  else return;
  e.preventDefault();
  setTab(TABS[next].id);
  // Move focus to the newly activated tab button
  const btns = tablistRef.value?.querySelectorAll<HTMLElement>("[role='tab']");
  btns?.[next]?.focus();
}

// --- Attention (browser) notifications diagnostics (#0316) ---
const testSending = ref(false);
async function runTestNotification(): Promise<void> {
  testSending.value = true;
  try {
    await notifications.sendTestPush();
  } finally {
    testSending.value = false;
  }
}
const pushStatus = computed(() => {
  const a = notifications.availability;
  const map = {
    granted: { label: "granted", color: "var(--green)", tone: "ok" as const },
    default: { label: "not requested", color: "var(--txt-dim)", tone: "ok" as const },
    denied: { label: "blocked", color: "var(--red)", tone: "error" as const },
    insecure: {
      label: "unavailable (insecure origin)",
      color: "var(--red)",
      tone: "error" as const,
    },
    unsupported: { label: "unsupported browser", color: "var(--red)", tone: "error" as const },
  }[a];
  return {
    ...map,
    // Hide the "just turn it on" hint once permission is already granted.
    help: a === "granted" && notifications.pushEnabled ? "" : PUSH_AVAILABILITY_HELP[a],
  };
});
const tunnelReadiness = ref<Record<string, any> | null>(null);
const tunnelStatus = computed(() => {
  if (!tunnelReadiness.value?.configured?.tunnelId) return "Not configured";
  if (tunnelReadiness.value.running) return "Running";
  return tunnelReadiness.value.originCertificate?.usable
    ? "Configured but stopped"
    : "Needs attention";
});
const rvStatus = ref<Record<string, any> | null>(null);
const rvStatusLabel = computed(() => {
  const s = rvStatus.value;
  if (!s || !s.enabled) return "Disabled";
  if (!s.hasApiToken || !s.hasSshKey || !s.snapshotConfigured) return "Needs setup";
  if (!s.running) return "Enabled — restart to apply";
  if (s.activeServer) return `Runner up · ${s.activeServer.ageMinutes}m`;
  return "Ready";
});
async function refreshRvStatus(): Promise<void> {
  try {
    rvStatus.value = await api("/api/remote-validation/status");
  } catch {
    rvStatus.value = null;
  }
}

// ---- Support bundle (#0453) ----
// Builds a redacted diagnostic artifact locally. The preview is fetched first
// so the user sees exactly which categories are included and where the archive
// will be written before anything is created; nothing is ever uploaded.
interface SupportPreview {
  ok: boolean;
  dryRun: boolean;
  path: string;
  warning?: string | null;
  manifest: {
    schemaVersion: number;
    redactionVersion: number;
    files: Array<{ path: string; category: string; bytes: number; description: string }>;
    omitted: Array<{ category: string; reason: string }>;
  };
}
const supportPreview = ref<SupportPreview | null>(null);
const supportLoading = ref(false);
const supportCreating = ref(false);
const supportOpening = ref(false);
const supportError = ref("");
const supportResult = ref<{ path: string; bytes: number } | null>(null);

async function refreshSupportPreview(): Promise<void> {
  supportLoading.value = true;
  supportError.value = "";
  try {
    supportPreview.value = (await api("/api/support/bundle")) as SupportPreview;
  } catch (e) {
    supportPreview.value = null;
    supportError.value = (e as Error).message;
  } finally {
    supportLoading.value = false;
  }
}

async function createSupportBundle(): Promise<void> {
  supportCreating.value = true;
  supportError.value = "";
  try {
    const res = (await api("/api/support/bundle", { method: "POST" })) as {
      path: string;
      bytes: number;
      warning?: string | null;
      manifest: SupportPreview["manifest"];
    };
    supportResult.value = { path: res.path, bytes: res.bytes };
    supportPreview.value = {
      ok: true,
      dryRun: false,
      path: res.path,
      warning: res.warning,
      manifest: res.manifest,
    };
  } catch (e) {
    supportError.value = (e as Error).message;
  } finally {
    supportCreating.value = false;
  }
}

async function openSupportBundle(): Promise<void> {
  if (!supportResult.value) return;
  supportOpening.value = true;
  supportError.value = "";
  try {
    await api("/api/support/bundle/open", JSON_OPTS("POST", { path: supportResult.value.path }));
  } catch (e) {
    supportError.value = (e as Error).message;
  } finally {
    supportOpening.value = false;
  }
}

// ---- Guided AI report composer (#0463) ----
type SupportReportType = "bug" | "feature";
const bugReportType = ref<SupportReportType>("bug");
const bugReportText = ref("");
const bugReportPending = ref(false);
const bugReportError = ref("");
const bugReportHint = ref("");
const bugReportTitle = ref("");
const bugReportBody = ref("");
const bugReportDraftOpen = ref(false);
const bugReportCopied = ref<"title" | "body" | null>(null);
const bugReportScreenshots = ref<{ name: string; mime: string; size: number; dataUrl: string }[]>(
  [],
);
const bugReportAttachmentHint = ref("");
const MAX_BUG_REPORT_SCREENSHOTS = 5;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

function selectBugReportType(type: SupportReportType): void {
  if (type === bugReportType.value) return;
  if (bugReportDraftOpen.value) {
    bugReportHint.value = "Finish or reload this draft before changing its report type.";
    return;
  }
  bugReportType.value = type;
}

function beginManualBugReport(): void {
  bugReportError.value = "";
  bugReportHint.value = "";
  bugReportDraftOpen.value = true;
  if (!bugReportTitle.value) {
    bugReportTitle.value = bugReportText.value.trim().split("\n")[0]?.slice(0, 80) ?? "";
  }
  if (!bugReportBody.value && bugReportText.value.trim()) {
    bugReportBody.value = bugReportText.value.trim();
  }
}

function addBugReportScreenshots(event: Event): void {
  const files = Array.from((event.target as HTMLInputElement).files ?? []);
  const images = files.filter((file) => file.type.startsWith("image/"));
  const remaining = MAX_BUG_REPORT_SCREENSHOTS - bugReportScreenshots.value.length;
  bugReportAttachmentHint.value = "";
  if (files.length !== images.length) {
    bugReportAttachmentHint.value = "Only image files can be added to a report.";
  }
  if (remaining <= 0) {
    bugReportAttachmentHint.value = `You can add up to ${MAX_BUG_REPORT_SCREENSHOTS} screenshots.`;
  } else if (images.length > remaining) {
    bugReportAttachmentHint.value = `Added the first ${remaining} screenshot${remaining === 1 ? "" : "s"}.`;
  }
  for (const file of images.slice(0, Math.max(0, remaining))) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      bugReportScreenshots.value.push({
        name: file.name,
        mime: file.type,
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  }
  (event.target as HTMLInputElement).value = "";
}

function removeBugReportScreenshot(index: number): void {
  bugReportScreenshots.value.splice(index, 1);
  bugReportAttachmentHint.value = "";
}

async function generateBugReport(): Promise<void> {
  const text = bugReportText.value.trim();
  if (!text || bugReportPending.value) return;
  bugReportPending.value = true;
  bugReportError.value = "";
  bugReportHint.value = "";
  try {
    const res = (await api(
      "/api/support/bug-report",
      JSON_OPTS("POST", { text, type: bugReportType.value }),
    )) as {
      ok: boolean;
      title?: string;
      body?: string;
      error?: string;
      hint?: string;
    };
    if (res.ok && res.title && res.body) {
      bugReportTitle.value = res.title;
      bugReportBody.value = res.body;
      bugReportDraftOpen.value = true;
    } else {
      bugReportError.value = res.error ?? "generation-failed";
      bugReportHint.value = res.hint ?? "";
    }
  } catch (e) {
    bugReportError.value = (e as Error).message;
  } finally {
    bugReportPending.value = false;
  }
}

function copyBugReport(field: "title" | "body"): void {
  const text = field === "title" ? bugReportTitle.value : bugReportBody.value;
  void navigator.clipboard.writeText(text);
  bugReportCopied.value = field;
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    bugReportCopied.value = null;
  }, 2000);
}

const bugReportGitHubUrl = computed(() => {
  const params = new URLSearchParams();
  if (bugReportTitle.value) params.set("title", bugReportTitle.value);
  if (bugReportBody.value) params.set("body", bugReportBody.value);
  const template = bugReportType.value === "feature" ? "feature_request.yml" : "bug_report.yml";
  return `https://github.com/repo-os/repoos/issues/new?template=${template}&${params.toString()}`;
});

onMounted(async () => {
  notifications.refreshAvailability();
  try {
    tunnelReadiness.value = await api("/api/tunnel/readiness?port=7171");
  } catch {
    /* status remains safe default */
  }
  void refreshRvStatus();
  // The store is app-scoped, so a dirty raw draft survives navigating away and
  // back; only (re)load when there's nothing local to lose.
  if (!config.rawLoaded || !config.rawDirty) void config.loadRaw();
});

// ---- Raw repoos.toml editor (#0375) ----
// The highlighted layer sits exactly under a transparent textarea; it must
// scroll with the textarea or the two drift apart.
const rawPre = ref<HTMLElement | null>(null);
const rawTextarea = ref<HTMLTextAreaElement | null>(null);
const highlightedRaw = computed(() => highlightToml(config.rawDraft));

function syncRawScroll(): void {
  const ta = rawTextarea.value;
  const pre = rawPre.value;
  if (!ta || !pre) return;
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
}

function reloadRaw(): void {
  if (
    config.rawDirty &&
    !window.confirm("Discard your unsaved repoos.toml changes and reload from disk?")
  ) {
    return;
  }
  void config.loadRaw();
}

function saveRaw(): void {
  void config.saveRaw();
}

const testState = ref<"idle" | "sending" | "sent" | "failed">("idle");
let testStateTimer: ReturnType<typeof setTimeout> | undefined;

async function sendTestNotification(): Promise<void> {
  testState.value = "sending";
  clearTimeout(testStateTimer);
  try {
    await api("/api/ntfy/test", { method: "POST" });
    testState.value = "sent";
  } catch {
    testState.value = "failed";
  }
  testStateTimer = setTimeout(() => {
    testState.value = "idle";
  }, 2000);
}

const generalFields = computed(() =>
  config.visibleFields.filter(
    (field) =>
      field.key !== "tunnelEnabled" &&
      field.key !== "ntfyEnabled" &&
      field.key !== "ntfyTopic" &&
      field.key !== "auth.enabled" &&
      field.key !== "auth.sessionMaxAge" &&
      !field.key.startsWith("remoteValidation.") &&
      !field.key.startsWith("board.columns."),
  ),
);

const BOARD_COLUMN_STATUSES = ["draft", "inbox", "ready", "active", "review", "done"] as const;

const boardColumnFields = computed(() => {
  const order = new Map(BOARD_COLUMN_STATUSES.map((s, i) => [`board.columns.${s}`, i]));
  return config.visibleFields
    .filter((f) => f.key.startsWith("board.columns."))
    .slice()
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
});

function effectiveBoardColumnLabel(status: (typeof BOARD_COLUMN_STATUSES)[number]): string {
  const key = `board.columns.${status}`;
  const field = config.schema.find((f) => f.key === key);
  const fallback = typeof field?.default === "string" ? field.default : "";
  const raw = form[key];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || fallback;
}

function boardColumnFieldError(status: (typeof BOARD_COLUMN_STATUSES)[number]): string | null {
  const key = `board.columns.${status}`;
  const raw = form[key];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  if (trimmed.length > 40) return "Label must be 40 characters or fewer.";
  const lower = trimmed.toLowerCase();
  for (const other of BOARD_COLUMN_STATUSES) {
    if (other === status) continue;
    if (effectiveBoardColumnLabel(other).toLowerCase() === lower) {
      const otherLabel = other.charAt(0).toUpperCase() + other.slice(1);
      return `This label is already used by the ${otherLabel} column.`;
    }
  }
  return null;
}

function hasBoardColumnErrors(): boolean {
  return BOARD_COLUMN_STATUSES.some((s) => boardColumnFieldError(s) !== null);
}

function boardColumnErrorForKey(key: string): string | null {
  const status = key.slice("board.columns.".length);
  if (!(BOARD_COLUMN_STATUSES as readonly string[]).includes(status)) return null;
  return boardColumnFieldError(status as (typeof BOARD_COLUMN_STATUSES)[number]);
}

/**
 * auth.sessionMaxAge is stored and sent to the server as seconds (it backs a
 * cookie Max-Age / session-expiry check — see routes/auth.ts), but "how long
 * should a login last" is naturally a day count for a human to set. This
 * converts for display/edit only; the underlying config key, its string
 * storage, and the server's >= 300s validation are untouched.
 */
const sessionMaxAgeDays = computed<number>({
  get: () => {
    const seconds = Number(form["auth.sessionMaxAge"]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round((seconds / 86400) * 100) / 100 : 30;
  },
  set: (days: number) => {
    if (!Number.isFinite(days) || days <= 0) return;
    form["auth.sessionMaxAge"] = String(Math.round(days * 86400));
  },
});

function focusSetting(key: string): void {
  const el = document.getElementById(`setting-${key}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 2000);
  const input = el.querySelector<HTMLElement>("input, select, [role='combobox']");
  if (input) input.focus();
}

// ---- Design themes (#0255) ----

// Swatch colors mirror each theme's CSS variables (style.css) so the
// Settings list previews a theme without applying it. [accent, secondary].
const THEME_SWATCHES: Record<string, { bg: string; a: string; b: string }> = {
  classic: { bg: "#0b1020", a: "#39e0ff", b: "#9d7bff" },
  clear: { bg: "#161b23", a: "#5fb8e6", b: "#9f8cf2" },
  "gen z": { bg: "#241a3d", a: "#ff5df0", b: "#b58cff" },
  jelly: { bg: "#1a2a44", a: "#33e6c4", b: "#ff5eb4" },
};
function swatchFor(id: string): { bg: string; a: string; b: string } {
  return THEME_SWATCHES[id] ?? { bg: "var(--panel-solid)", a: "var(--cyan)", b: "var(--violet)" };
}

/** Clicking a theme row applies it live; the star button toggles favorite. */
function toggleThemeFavorite(id: string): void {
  config.toggleThemeFavorite(id);
}

// ── #0345 ?setting= is an alias of the existing ?focus= deep-link — both
// scroll to and focus a specific setting row. ?setting= wins when both are
// present. The original ?focus= behavior (SearchBar navigates here with
// focus=<key>) is unchanged.
// When a focus key targets a setting on a specific tab, switch to that tab first.
const focusKey = computed(() => (route.query.setting ?? route.query.focus) as string | undefined);
watch(
  focusKey,
  (key) => {
    if (!key) return;
    // Switch to the tab that owns this setting key, if known.
    // Capture the resolved tab now so the async cleanup replace below uses
    // the *target* tab, not the stale activeTab.value (router.replace is
    // async; activeTab won't reflect the new tab until the navigation settles).
    const targetTab = key
      ? (FIELD_TAB[key] ?? (key.startsWith("board.columns.") ? "advanced" : undefined))
      : undefined;
    const resolvedTab: TabId = targetTab ?? activeTab.value;
    if (targetTab && activeTab.value !== targetTab) {
      void router.replace({
        name: "settings",
        query: { ...route.query, tab: targetTab },
      });
    }
    const tryFocus = (attempt = 0): void => {
      if (config.loaded && document.getElementById(`setting-${key}`)) {
        focusSetting(key);
        // Strip the focus/setting query param; use resolvedTab (not activeTab.value)
        // to avoid undoing the tab switch above before the navigation has settled.
        void router.replace({
          name: "settings",
          query: { tab: resolvedTab },
        });
      } else if (attempt < 20) {
        window.setTimeout(() => tryFocus(attempt + 1), 100);
      }
    };
    tryFocus();
  },
  { immediate: true },
);

// ---- Auto-save settings (mirrors the Agents page implementation) ----

const form = reactive<Record<string, unknown>>({});
let syncing = false;
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let saveInFlight = false;
let savePending = false;

function sync(): void {
  syncing = true;
  for (const key of Object.keys(config.form)) {
    form[key] = config.form[key];
  }
  syncing = false;
}

watch(
  () => config.loaded,
  (loaded) => {
    if (loaded) sync();
  },
  { immediate: true },
);

// Load the support-bundle preview lazily, the first time its tab is opened.
watch(
  activeTab,
  (tab) => {
    if (tab === "support" && !supportPreview.value && !supportLoading.value) {
      void refreshSupportPreview();
    }
  },
  { immediate: true },
);

function buildBody(): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of config.schema) {
    let val = form[f.key];
    if (f.key.startsWith("board.columns.")) {
      const trimmed = typeof val === "string" ? val.trim() : String(val ?? "").trim();
      body[f.key] = trimmed || f.default;
      continue;
    }
    if (f.type === "array" && typeof val === "string") {
      val = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    body[f.key] = val;
  }
  return body;
}

async function autoSave(): Promise<void> {
  if (saveInFlight) {
    savePending = true;
    return;
  }
  saveInFlight = true;
  savePending = false;
  let saved = false;
  try {
    await config.save(buildBody());
    saved = true;
  } catch {
    // The store exposes the error inline; keep edits in place for the next retry.
  } finally {
    saveInFlight = false;
    if (savePending) {
      // New edits arrived while the save was in flight — save again, keeping
      // whatever the user typed (possibly a fresh secret).
      scheduleAutoSave(0);
    } else if (saved) {
      // The save succeeded and nothing is pending, so the local form is a
      // stale copy of what was just saved. Re-sync from the store so
      // server-redacted values (e.g. the voice transcription API key) never
      // linger plaintext in the local form. On a failed save we keep edits.
      sync();
    }
  }
}

function scheduleAutoSave(delay = 450): void {
  clearTimeout(autoSaveTimer);
  if (hasBoardColumnErrors()) return;
  autoSaveTimer = setTimeout(() => void autoSave(), delay);
}

watch(
  form,
  () => {
    if (syncing || !config.loaded) return;
    config.msg = "";
    config.error = "";
    if (saveInFlight) savePending = true;
    scheduleAutoSave();
  },
  { deep: true, flush: "sync" },
);

onUnmounted(() => {
  clearTimeout(autoSaveTimer);
  clearTimeout(testStateTimer);
});
</script>

<template>
  <div class="settings-page" :class="{ 'settings-page--fill': activeTab === 'toml' }">
    <header class="page-header">
      <div>
        <div class="page-title">Settings</div>
        <div class="page-desc">
          RepoOS configuration · <span class="mono" style="color: var(--cyan)">repoos.toml</span>
          <span v-if="config.saving"> · Saving…</span>
          <span v-else-if="config.error" class="save-msg err"> · {{ config.error }}</span>
          <span v-else-if="config.msg" class="save-msg ok"> · {{ config.msg }}</span>
        </div>
      </div>
      <div class="page-header-actions">
        <a
          class="page-help-link"
          href="https://docs.repoos.org/configuration"
          target="_blank"
          rel="noreferrer"
          >Configuration reference ↗</a
        >
      </div>
    </header>

    <!-- Tab strip -->
    <div ref="tablistRef" class="settings-tabs" role="tablist" aria-label="Settings sections">
      <button
        v-for="(tab, idx) in TABS"
        :key="tab.id"
        :id="`settings-tab-${tab.id}`"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`settings-panel-${tab.id}`"
        :tabindex="activeTab === tab.id ? 0 : -1"
        class="settings-tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="setTab(tab.id)"
        @keydown="onTabKeydown($event, idx)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="!config.loaded" class="spin"></div>

    <div v-else class="settings-panels">
      <!-- ─── General tab ─────────────────────────────────── -->
      <div
        id="settings-panel-general"
        role="tabpanel"
        :aria-labelledby="`settings-tab-general`"
        v-show="activeTab === 'general'"
      >
        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>General
            </div>
            <div
              v-for="f in generalFields"
              :key="f.key"
              :id="`setting-${f.key}`"
              class="setting-row"
            >
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">{{ f.description }}</div>
              </div>
              <div class="setting-input">
                <Select
                  v-if="f.type === 'select'"
                  :model-value="String(form[f.key])"
                  :disabled="config.saving"
                  @update:model-value="(v) => (form[f.key] = v)"
                >
                  <SelectTrigger class="h-[34px] w-[200px] rounded-[9px] px-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="o in f.options" :key="o.value" :value="o.value">{{
                        o.label
                      }}</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
                <Switch
                  v-else-if="f.type === 'boolean'"
                  :checked="!!form[f.key]"
                  :disabled="config.saving"
                  @update:checked="(v: boolean) => (form[f.key] = v)"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </Card>

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Themes
            </div>
            <div class="theme-list">
              <div
                v-for="t in DESIGN_THEMES"
                :key="t.id"
                class="theme-row"
                :class="{ current: config.uiTheme === t.id }"
                role="button"
                tabindex="0"
                :aria-pressed="config.uiTheme === t.id"
                :aria-label="`Use the ${t.label} theme`"
                @click="config.setUiTheme(t.id)"
                @keydown.enter.prevent="config.setUiTheme(t.id)"
              >
                <span
                  class="theme-swatch"
                  :style="{
                    background: swatchFor(t.id).bg,
                    '--sw-a': swatchFor(t.id).a,
                    '--sw-b': swatchFor(t.id).b,
                  }"
                  aria-hidden="true"
                >
                  <i></i><i></i>
                </span>
                <span class="theme-name">
                  {{ t.label }}
                  <span v-if="config.uiTheme === t.id" class="theme-active-badge">active</span>
                </span>
                <button
                  type="button"
                  class="theme-star"
                  :class="{ on: config.isThemeFavorite(t.id) }"
                  :aria-pressed="config.isThemeFavorite(t.id)"
                  :aria-label="
                    config.isThemeFavorite(t.id)
                      ? `Remove ${t.label} from favorites`
                      : `Add ${t.label} to favorites`
                  "
                  :title="
                    config.isThemeFavorite(t.id) ? 'Remove from favorites' : 'Add to favorites'
                  "
                  @click.stop="toggleThemeFavorite(t.id)"
                >
                  {{ config.isThemeFavorite(t.id) ? "★" : "☆" }}
                </button>
              </div>
            </div>
            <div v-if="config.themeFavoritesNotice" class="theme-fav-note" role="status">
              {{ config.themeFavoritesNotice }}
            </div>
            <div class="setting-desc" style="padding: 4px 0 10px">
              Star up to 3 favorites — starred themes appear in the sidebar quick switcher. Click a
              theme to apply it.
            </div>
          </div>
        </Card>

        <ServiceSettings />

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Publishing
            </div>
            <div id="setting-tunnelEnabled" class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Cloudflare publishing</div>
                <div class="setting-desc">
                  Configure a protected public hostname for a local RepoOS service. This card
                  reports status; it does not start or stop cloudflared.
                </div>
              </div>
              <div class="setting-input tunnel-setting-actions">
                <span class="tunnel-status-chip">{{ tunnelStatus }}</span>
                <Button variant="outline" size="sm" @click="ui.openTunnel()"
                  >Configure publishing</Button
                >
              </div>
            </div>
          </div>
        </Card>

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Remote validation
            </div>
            <div id="setting-remoteValidation.enabled" class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Remote validation runner</div>
                <div class="setting-desc">
                  Run the close-out build + test suite on a disposable Hetzner VM instead of this
                  machine, so MTD isn't blocked by local memory pressure. Off by default; enabling
                  sends repo contents to Hetzner.
                </div>
              </div>
              <div class="setting-input tunnel-setting-actions">
                <span class="tunnel-status-chip">{{ rvStatusLabel }}</span>
                <Button variant="outline" size="sm" @click="ui.openRemoteValidation()">
                  Configure runner
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Board
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Glide animations</div>
                <div class="setting-desc">
                  When a card changes state, animate it gliding between columns to show where it
                  came from and where it went. Off by default; when off, cards change state
                  instantly as before.
                </div>
              </div>
              <div class="setting-input">
                <Switch :checked="ui.glideAnimations" @update:checked="ui.setGlideAnimations" />
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Keyboard navigation</div>
                <div class="setting-desc">
                  Power-user shortcut mode: move around the board with the keyboard —
                  <span class="mono">j</span>/<span class="mono">k</span> (
                  <span class="mono">h</span>/<span class="mono">l</span> between columns),
                  <span class="mono">Enter</span> to open, <span class="mono">Esc</span> to close or
                  clear. Off by default; when off the board behaves exactly as before.
                </div>
              </div>
              <div class="setting-input">
                <Switch
                  :checked="ui.keyboardNavEnabled"
                  @update:checked="ui.setKeyboardNavEnabled"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- ─── Notifications tab ───────────────────────────── -->
      <div
        id="settings-panel-notifications"
        role="tabpanel"
        :aria-labelledby="`settings-tab-notifications`"
        v-show="activeTab === 'notifications'"
      >
        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>ntfy Notifications
            </div>
            <div class="ntfy-layout">
              <div class="ntfy-controls">
                <div id="setting-ntfyEnabled" class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Enable ntfy notifications</div>
                    <div class="setting-desc">
                      When on, RepoOS publishes a message to your topic on task lifecycle events
                      (moved to review, approved, or returned with issues).
                    </div>
                  </div>
                  <div class="setting-input">
                    <Switch
                      :checked="!!form.ntfyEnabled"
                      :disabled="config.saving"
                      @update:checked="(v: boolean) => (form.ntfyEnabled = v)"
                    />
                  </div>
                </div>
                <div id="setting-ntfyTopic" class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">Subscription topic</div>
                    <div class="setting-desc">
                      The ntfy topic RepoOS publishes events to, e.g. <code>repoos_myproject</code>.
                      Leave empty to never send.
                    </div>
                  </div>
                  <div class="setting-input" style="display: flex; gap: 8px; align-items: center">
                    <Input
                      :model-value="String(form.ntfyTopic ?? '')"
                      type="text"
                      placeholder="repoos_myproject"
                      @update:model-value="(v) => (form.ntfyTopic = v)"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      :disabled="!form.ntfyEnabled || !String(form.ntfyTopic ?? '').trim()"
                      @click="sendTestNotification"
                    >
                      {{
                        testState === "sent"
                          ? "✓ Sent!"
                          : testState === "failed"
                            ? "✗ Failed"
                            : "Send test"
                      }}
                    </Button>
                  </div>
                </div>
              </div>
              <aside class="ntfy-info">
                <h3>About ntfy</h3>
                <p>
                  ntfy is a free, open-source push notification service. Install the ntfy app on
                  your phone from the App Store or Google Play, subscribe to a unique topic (e.g.
                  <code>repoos_myproject</code>), and enter that topic below.
                </p>
                <p>
                  Notifications are sent to <code>ntfy.sh</code> by default. Self-hosted ntfy
                  instances work too — set the <code>NTFY_BASE_URL</code> environment variable (or
                  the <code>ntfyBaseUrl</code> config key in <code>repoos.toml</code>).
                </p>
                <a href="https://ntfy.sh/docs/subscribe/phone/" target="_blank" rel="noreferrer">
                  ntfy install + subscribe guide →
                </a>
              </aside>
            </div>
          </div>
        </Card>

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Attention Notifications
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Sound notifications</div>
                <div class="setting-desc">
                  Play a bell sound on your computer when a task moves into a state that needs you.
                  Off by default.
                </div>
              </div>
              <div class="setting-input">
                <Switch
                  :checked="notifications.soundEnabled"
                  @update:checked="notifications.setSoundEnabled"
                />
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Push notifications</div>
                <div class="setting-desc">
                  Send a notification through your computer's notification system when a task moves
                  into a state that needs you. Turning this on will ask for permission. Requires a
                  RepoOS tab to stay open — there's no background service worker.
                </div>
              </div>
              <div class="setting-input">
                <Switch
                  :checked="notifications.pushEnabled"
                  @update:checked="notifications.setPushEnabled"
                />
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label" style="font-weight: 500">
                  Browser permission:
                  <span :style="{ color: pushStatus.color }">{{ pushStatus.label }}</span>
                </div>
                <div
                  v-if="pushStatus.help"
                  class="setting-desc"
                  :style="{ color: pushStatus.tone === 'error' ? 'var(--red)' : 'var(--txt-dim)' }"
                >
                  {{ pushStatus.help }}
                </div>
                <div
                  v-if="notifications.testResult"
                  class="setting-desc"
                  :style="{
                    marginTop: '4px',
                    color: notifications.testResult.ok ? 'var(--green)' : 'var(--red)',
                  }"
                >
                  {{ notifications.testResult.detail }}
                </div>
              </div>
              <div class="setting-input">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="testSending"
                  @click="runTestNotification"
                >
                  {{ testSending ? "Sending…" : "Send test" }}
                </Button>
              </div>
            </div>
            <div
              style="
                font-size: 11px;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: var(--txt-faint);
                font-weight: 600;
                padding-top: 8px;
              "
            >
              Events
            </div>
            <div v-for="t in notificationTypes" :key="t" class="setting-row">
              <div class="setting-info">
                <div class="setting-label">{{ NOTIFICATION_TYPE_LABELS[t] }}</div>
                <div class="setting-desc">
                  {{
                    t === "review"
                      ? "A task moved from active to review, ready for your sign-off."
                      : t === "paused"
                        ? "A running task was paused."
                        : t === "stuck"
                          ? "A task was surfaced as stuck (no progress detected)."
                          : "A task explicitly needs your attention."
                  }}
                </div>
              </div>
              <div class="setting-input">
                <Switch
                  :checked="notifications.types[t]"
                  @update:checked="notifications.setTypeEnabled(t, $event)"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- ─── Security tab ────────────────────────────────── -->
      <div
        id="settings-panel-security"
        role="tabpanel"
        :aria-labelledby="`settings-tab-security`"
        v-show="activeTab === 'security'"
      >
        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Authentication
            </div>
            <div id="setting-auth.enabled" class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Authentication</div>
                <div class="setting-desc">
                  Require login to access RepoOS (email OTP or Google OAuth).
                </div>
              </div>
              <div class="setting-input">
                <Switch
                  :checked="!!form['auth.enabled']"
                  :disabled="config.saving"
                  @update:checked="(v: boolean) => (form['auth.enabled'] = v)"
                />
              </div>
              <span class="restart-badge">restart required</span>
            </div>
            <div id="setting-auth.sessionMaxAge" class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Session duration (days)</div>
                <div class="setting-desc">
                  How long a login session lasts before requiring sign-in again. Default 30 days.
                </div>
              </div>
              <div class="setting-input">
                <Input
                  :model-value="sessionMaxAgeDays"
                  type="number"
                  min="1"
                  step="1"
                  style="width: 100px"
                  @update:model-value="(v) => (sessionMaxAgeDays = Number(v))"
                />
              </div>
              <span class="restart-badge">restart required</span>
            </div>
          </div>
        </Card>

        <AuthSettingsPanel />

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Voice transcription
            </div>
            <div
              v-for="f in config.voiceFields"
              :key="f.key"
              :id="`setting-${f.key}`"
              class="setting-row"
            >
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">{{ f.description }}</div>
              </div>
              <div class="setting-input">
                <Select
                  v-if="f.type === 'select'"
                  :model-value="String(form[f.key])"
                  :disabled="config.saving"
                  @update:model-value="(v) => (form[f.key] = v)"
                >
                  <SelectTrigger class="h-[34px] w-[200px] rounded-[9px] px-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectViewport class="min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem v-for="o in f.options" :key="o.value" :value="o.value">{{
                        o.label
                      }}</SelectItem>
                    </SelectViewport>
                  </SelectContent>
                </Select>
                <Input
                  v-else-if="f.type === 'string'"
                  :model-value="String(form[f.key] ?? '')"
                  type="password"
                  autocomplete="new-password"
                  placeholder="sk-… or gsk_…"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </Card>
      </div>

      <!-- ─── Advanced tab ────────────────────────────────── -->
      <div
        id="settings-panel-advanced"
        role="tabpanel"
        :aria-labelledby="`settings-tab-advanced`"
        v-show="activeTab === 'advanced'"
      >
        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Advanced
            </div>
            <div class="adv-gate">
              <div class="warning">
                ⚠ Changing these may break the running server. Edit with care.
              </div>
            </div>
            <div
              v-for="f in config.guardedFields"
              :key="f.key"
              :id="`setting-${f.key}`"
              class="setting-row"
            >
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">{{ f.description }}</div>
              </div>
              <div class="setting-input">
                <Input
                  v-if="f.type === 'string'"
                  :model-value="String(form[f.key])"
                  type="text"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
                <Input
                  v-else-if="f.type === 'array'"
                  :model-value="String(form[f.key])"
                  type="text"
                  placeholder=".md, .markdown"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
              </div>
              <span v-if="f.restartRequired" class="restart-badge">restart required</span>
            </div>
          </div>
        </Card>

        <Card style="padding: 0 18px 6px; margin-bottom: 16px">
          <div class="setting-group">
            <div class="sec-label" style="padding-top: 16px; margin-bottom: 0">
              <span class="live-dot"></span>Work board column labels
            </div>
            <div class="setting-desc" style="padding: 4px 0 12px">
              Rename the six Work board columns in the UI and CLI. Status IDs, transitions, and task
              frontmatter are unchanged — these are display labels only.
            </div>
            <div
              v-for="f in boardColumnFields"
              :key="f.key"
              :id="`setting-${f.key}`"
              class="setting-row"
            >
              <div class="setting-info">
                <div class="setting-label">{{ f.label }}</div>
                <div class="setting-desc">
                  Default: {{ f.default }}. Clear the field to restore this default.
                </div>
                <div v-if="boardColumnErrorForKey(f.key)" class="ff-error">
                  {{ boardColumnErrorForKey(f.key) }}
                </div>
              </div>
              <div class="setting-input">
                <Input
                  :model-value="String(form[f.key] ?? '')"
                  type="text"
                  :placeholder="String(f.default)"
                  :disabled="config.saving"
                  @update:model-value="(v) => (form[f.key] = v)"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- ─── Support tab ─────────────────────────────────── -->
      <div
        id="settings-panel-support"
        role="tabpanel"
        :aria-labelledby="`settings-tab-support`"
        v-show="activeTab === 'support'"
      >
        <div class="support-tab-content">
          <div class="setting-group">
            <div class="sec-label" style="margin-bottom: 0">
              <span class="live-dot"></span>Get support
            </div>
            <div class="setting-desc" style="padding: 8px 0 12px">
              Start here for an unexpected setup, server, check, or coding-agent problem. For a
              common fix, see the
              <a
                class="support-link"
                href="https://docs.repoos.org/troubleshooting"
                target="_blank"
                rel="noreferrer"
                >troubleshooting guide ↗</a
              >.
            </div>

            <div class="support-steps-grid" aria-label="How to get support">
              <article class="support-step">
                <span class="support-step-num">1</span>
                <div>
                  <strong>Diagnose</strong>
                  <p>
                    Run <code>repoos doctor</code> first. It often identifies the fix immediately.
                  </p>
                </div>
              </article>
              <article class="support-step">
                <span class="support-step-num">2</span>
                <div>
                  <strong>Create a safe bundle</strong>
                  <p>It stays on this machine; RepoOS never uploads it.</p>
                </div>
              </article>
              <article class="support-step">
                <span class="support-step-num">3</span>
                <div>
                  <strong>Share the right context</strong>
                  <p>Inspect it, then attach it to a bug report or feature request if useful.</p>
                </div>
              </article>
            </div>

            <section class="support-bug-report-section" aria-labelledby="bug-report-heading">
              <div class="support-bug-report-header">
                <div class="sec-label"><span class="live-dot"></span>Share feedback</div>
                <h2 id="bug-report-heading">Report a bug or request a feature</h2>
                <p class="setting-desc">
                  Jot down what happened or the improvement you want. Include the RepoOS page, your
                  goal, and any useful context. You can turn those notes into an editable AI draft,
                  or write the report yourself.
                </p>
              </div>

              <div class="bug-report-type-picker" role="radiogroup" aria-label="Report type">
                <button
                  type="button"
                  :class="{ active: bugReportType === 'bug' }"
                  role="radio"
                  :aria-checked="bugReportType === 'bug'"
                  @click="selectBugReportType('bug')"
                >
                  <strong>Bug report</strong><span>Something is not working as expected</span>
                </button>
                <button
                  type="button"
                  :class="{ active: bugReportType === 'feature' }"
                  role="radio"
                  :aria-checked="bugReportType === 'feature'"
                  @click="selectBugReportType('feature')"
                >
                  <strong>Feature request</strong
                  ><span>Suggest an improvement or new capability</span>
                </button>
              </div>

              <div class="field support-bug-report-notes">
                <label for="bug-report-text">Notes and description</label>
                <textarea
                  id="bug-report-text"
                  v-model="bugReportText"
                  class="input-textarea"
                  rows="7"
                  :placeholder="
                    bugReportType === 'bug'
                      ? 'For example: On Settings → Support, I expected the bundle preview to load. Instead it stayed blank after I refreshed. I was using…'
                      : 'For example: I would like a way to compare two task runs because it would help me understand what changed between them…'
                  "
                ></textarea>
              </div>

              <div class="bug-report-attachments">
                <div>
                  <strong>Screenshots <span class="optional-label">optional</span></strong>
                  <p class="setting-desc">
                    Add screenshots of the page or error. They stay on this machine and are never
                    sent to the AI.
                  </p>
                </div>
                <label class="bug-report-add-screenshot" for="bug-report-screenshot-input">
                  Add screenshots
                </label>
                <input
                  id="bug-report-screenshot-input"
                  class="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
                  multiple
                  @change="addBugReportScreenshots"
                />
              </div>
              <div v-if="bugReportScreenshots.length" class="bug-report-screenshot-grid">
                <figure
                  v-for="(screenshot, index) in bugReportScreenshots"
                  :key="screenshot.name + screenshot.size + index"
                  class="bug-report-screenshot"
                >
                  <img :src="screenshot.dataUrl" :alt="screenshot.name" />
                  <figcaption :title="screenshot.name">{{ screenshot.name }}</figcaption>
                  <button
                    type="button"
                    class="bug-report-remove-screenshot"
                    :aria-label="`Remove ${screenshot.name}`"
                    @click="removeBugReportScreenshot(index)"
                  >
                    Remove
                  </button>
                </figure>
              </div>
              <p v-if="bugReportAttachmentHint" class="bug-report-hint" role="status">
                {{ bugReportAttachmentHint }}
              </p>

              <p class="bug-report-privacy">
                <strong>Choose your path.</strong> Generate with AI sends only your notes to the
                configured PM agent to make a draft. Writing manually sends nothing. In either case,
                you review and edit everything before opening GitHub.
              </p>
              <div class="bug-report-actions">
                <Button
                  :disabled="!bugReportText.trim() || bugReportPending"
                  @click="generateBugReport"
                >
                  {{
                    bugReportPending
                      ? "Generating…"
                      : `${bugReportDraftOpen ? "Regenerate" : "Generate"} editable ${bugReportType === "bug" ? "bug report" : "feature request"} with AI`
                  }}
                </Button>
                <Button variant="outline" @click="beginManualBugReport">Write it manually</Button>
              </div>
              <div v-if="bugReportError" class="support-error" role="alert">
                <span>{{
                  bugReportError === "no-pm-agent" ? "No PM agent configured" : bugReportError
                }}</span>
              </div>
              <div v-if="bugReportHint" class="bug-report-hint" role="status">
                {{ bugReportHint }}
              </div>

              <section
                v-if="bugReportDraftOpen"
                class="bug-report-review"
                aria-labelledby="bug-report-review-heading"
              >
                <div>
                  <h3 id="bug-report-review-heading">Review and edit before sending</h3>
                  <p class="setting-desc">
                    This is your report. Edit the title and details as much as you like; RepoOS will
                    not submit anything automatically.
                  </p>
                </div>
                <div class="field">
                  <label for="bug-report-title">Title</label>
                  <input
                    id="bug-report-title"
                    v-model="bugReportTitle"
                    class="bug-report-title-input"
                    type="text"
                    placeholder="Short summary of the bug"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    class="bug-report-copy-btn"
                    :disabled="!bugReportTitle"
                    @click="copyBugReport('title')"
                  >
                    {{ bugReportCopied === "title" ? "Copied!" : "Copy title" }}
                  </Button>
                </div>
                <div class="field">
                  <label for="bug-report-body">Report</label>
                  <textarea
                    id="bug-report-body"
                    v-model="bugReportBody"
                    class="input-textarea"
                    rows="14"
                    placeholder="What happened, what you expected, steps to reproduce, and any useful context…"
                  ></textarea>
                  <Button
                    variant="outline"
                    size="sm"
                    class="bug-report-copy-btn"
                    :disabled="!bugReportBody"
                    @click="copyBugReport('body')"
                  >
                    {{ bugReportCopied === "body" ? "Copied!" : "Copy report" }}
                  </Button>
                </div>
                <p v-if="bugReportScreenshots.length" class="bug-report-attachment-reminder">
                  {{ bugReportScreenshots.length }} screenshot{{
                    bugReportScreenshots.length === 1 ? "" : "s"
                  }}
                  selected. After GitHub opens, attach these same files to the issue if you choose
                  to share them.
                </p>
                <div class="bug-report-actions">
                  <a
                    :href="bugReportGitHubUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="bug-report-github-link"
                  >
                    <Button :disabled="!bugReportTitle.trim() || !bugReportBody.trim()" tag="span">
                      Open editable
                      {{ bugReportType === "bug" ? "bug report" : "feature request" }} on GitHub
                    </Button>
                  </a>
                </div>
                <details class="support-details">
                  <summary>Attach a support bundle</summary>
                  <div class="support-details-body">
                    <p class="setting-desc">
                      You can attach an inspected support bundle to the GitHub issue for additional
                      context. Create one from the bundle section below before opening the issue.
                    </p>
                  </div>
                </details>
              </section>
            </section>

            <section v-if="supportLoading" class="support-preview-loading" aria-live="polite">
              <span class="support-spinner" aria-hidden="true"></span>
              <div>
                <strong>Preparing a private bundle preview</strong>
                <p>Checking safe diagnostics. This creates nothing and uploads nothing.</p>
              </div>
            </section>

            <template v-else-if="supportPreview">
              <section class="support-preview-ready">
                <div class="support-preview-ready-copy">
                  <strong>Bundle preview ready</strong>
                  <p>
                    {{ supportPreview.manifest.files.length + 1 }} small diagnostic files will be
                    collected locally. Source code, credentials, prompts, environment values and raw
                    logs are excluded.
                  </p>
                </div>
                <div class="support-actions">
                  <Button size="sm" :disabled="supportCreating" @click="createSupportBundle">{{
                    supportCreating ? "Creating…" : "Create support bundle"
                  }}</Button>
                  <Button variant="outline" size="sm" @click="refreshSupportPreview"
                    >Refresh</Button
                  >
                </div>
                <section v-if="supportResult" class="support-bundle-location" aria-live="polite">
                  <div>
                    <strong>Support bundle saved</strong>
                    <p>
                      Inspect this archive before sharing it:
                      <span class="mono">{{ supportResult.path }}</span>
                      <span> ({{ supportResult.bytes }} bytes)</span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="supportOpening"
                    @click="openSupportBundle"
                  >
                    {{ supportOpening ? "Opening…" : "Open in file browser" }}
                  </Button>
                </section>
                <p v-else class="setting-desc support-output-path">
                  Planned location: <span class="mono">{{ supportPreview.path }}</span>
                </p>
                <div v-if="supportPreview.warning" class="support-warning" role="alert">
                  {{ supportPreview.warning }}
                </div>
                <details class="support-details">
                  <summary>Review included information and exclusions</summary>
                  <div class="support-details-body">
                    <div class="support-subhead">Included</div>
                    <ul class="support-list">
                      <li v-for="f in supportPreview.manifest.files" :key="f.path">
                        <span class="mono">{{ f.path }}</span>
                        <span class="setting-desc"> — {{ f.description }}</span>
                      </li>
                      <li>
                        <span class="mono">manifest.json</span>
                        <span class="setting-desc">
                          — machine-readable index of every file above.</span
                        >
                      </li>
                    </ul>
                    <template v-if="supportPreview.manifest.omitted.length">
                      <div class="support-subhead">Omitted (with reason)</div>
                      <ul class="support-list">
                        <li v-for="o in supportPreview.manifest.omitted" :key="o.category">
                          <span class="mono">{{ o.category }}</span>
                          <span class="setting-desc"> — {{ o.reason }}</span>
                        </li>
                      </ul>
                    </template>
                  </div>
                </details>
              </section>
              <div v-if="supportResult" class="setting-desc" style="padding-top: 8px">
                Inspect before sharing:
                <span class="mono">repoos support inspect {{ supportResult.path }}</span>
              </div>
              <div v-if="supportResult" class="support-handoff">
                <div class="support-subhead">Send it with the right report</div>
                <p class="setting-desc">
                  The bug-report form asks for what you expected, what happened, a small
                  reproduction, your version, and an optional inspected bundle. Use a discussion for
                  a question, idea, or help choosing an approach.
                </p>
                <div class="support-links">
                  <a
                    class="support-link"
                    href="https://github.com/repo-os/repoos/issues/new?template=bug_report.yml"
                    target="_blank"
                    rel="noreferrer"
                    >Open the bug-report form ↗</a
                  >
                  <a
                    class="support-link"
                    href="https://github.com/repo-os/repoos/discussions"
                    target="_blank"
                    rel="noreferrer"
                    >Start a GitHub discussion ↗</a
                  >
                </div>
              </div>
            </template>

            <div v-if="supportError" class="support-error" role="alert">
              <span>{{ supportError }}</span>
              <Button variant="outline" size="sm" @click="refreshSupportPreview">Try again</Button>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── repoos.toml tab ─────────────────────────────── -->
      <div
        id="settings-panel-toml"
        role="tabpanel"
        :aria-labelledby="`settings-tab-toml`"
        class="toml-panel"
        v-show="activeTab === 'toml'"
      >
        <Card class="toml-card">
          <div class="toml-raw">
            <div class="toml-raw-head">
              <div class="setting-desc" style="margin: 0">
                The whole file, including sections the other tabs don't cover —
                <code>[preview]</code>, <code>[check]</code>, <code>[release]</code>,
                <code>[[deployments]]</code>, and anything you add. Values stay on one line:
                RepoOS's config reader doesn't support multi-line arrays, multi-line strings, or
                inline tables. Keep secrets in <code>.env</code>, not here.
              </div>
              <div class="toml-raw-actions">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="config.rawLoading || config.rawSaving"
                  @click="reloadRaw"
                  >Reload</Button
                >
                <Button
                  size="sm"
                  :disabled="!config.rawDirty || config.rawLoading || config.rawSaving"
                  @click="saveRaw"
                  >{{ config.rawSaving ? "Saving…" : "Save" }}</Button
                >
              </div>
            </div>
            <div class="toml-editor">
              <pre ref="rawPre" aria-hidden="true"><code v-html="highlightedRaw"></code></pre>
              <textarea
                ref="rawTextarea"
                v-model="config.rawDraft"
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                aria-label="repoos.toml contents"
                :disabled="config.rawLoading"
                @scroll="syncRawScroll"
              ></textarea>
            </div>
            <div v-if="config.rawLoading" class="setting-desc toml-raw-status">Loading…</div>
            <div v-else-if="config.rawError" class="toml-raw-error" role="alert">
              {{ config.rawError }}
            </div>
            <div v-else-if="config.rawDirty" class="setting-desc toml-raw-status">
              Unsaved changes.
            </div>
            <div v-else class="setting-desc toml-raw-status">
              In sync with <span class="mono">repoos.toml</span>.
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
