import type { ConfigField } from "./types";

/** Settings page tab ids — keep in sync with SettingsView tab panels. */
export type SettingsTabId =
  | "general"
  | "notifications"
  | "security"
  | "advanced"
  | "import-export"
  | "support"
  | "toml";

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "advanced", label: "Advanced" },
  { id: "import-export", label: "Import/Export" },
  { id: "support", label: "Support" },
  { id: "toml", label: "repoos.toml" },
];

export const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = Object.fromEntries(
  SETTINGS_TABS.map((t) => [t.id, t.label]),
) as Record<SettingsTabId, string>;

/**
 * A named, linkable region inside a Settings tab (#0800). The tab is the
 * primary axis; a `section` is a stable anchor within it, addressed as
 * `/settings?tab=general&section=model-routing` the way a task has a URL.
 *
 * Sections are a navigation aid, not a schema change: every config key keeps
 * its value and its existing control. The id is part of the public URL — treat
 * it as stable and rename only deliberately.
 */
export interface SettingsSection {
  id: string;
  label: string;
}

/**
 * General-tab sections, in the order they render top to bottom. Ids are stable
 * URL parameters. The sections listed in `GENERAL_FIELD_SECTIONS` are rendered
 * automatically from schema rows; the others are hand-rendered cards.
 */
export const GENERAL_SECTIONS: readonly SettingsSection[] = [
  { id: "themes", label: "Themes" },
  { id: "activity-animation", label: "Activity animation" },
  { id: "general", label: "General" },
  { id: "performance", label: "Performance" },
  { id: "model-routing", label: "Model routing" },
  { id: "close-out", label: "Close-out" },
  { id: "automation", label: "Automation & approval" },
  { id: "screenshots", label: "Screenshots" },
  { id: "attachments", label: "Attachments" },
  { id: "service", label: "Background service" },
  { id: "publishing", label: "Publishing" },
  { id: "remote-validation", label: "Remote validation" },
  { id: "board", label: "Board" },
];

/**
 * General sections whose rows are built from `generalFields` (schema keys). The
 * remaining General sections are hand-rendered cards whose markup already lives
 * in SettingsView (Themes, Attachments, Publishing, …).
 */
export const GENERAL_FIELD_SECTIONS: readonly string[] = [
  "general",
  "performance",
  "model-routing",
  "close-out",
  "automation",
  "screenshots",
];

const GENERAL_SECTION_BY_ID = new Map(GENERAL_SECTIONS.map((s) => [s.id, s]));

/** Display name for a General section id (falls back to the id). */
export function generalSectionLabel(id: string): string {
  return GENERAL_SECTION_BY_ID.get(id)?.label ?? id;
}

/** Whether `id` names a real General section — used to ignore a stray URL param. */
export function isGeneralSectionId(id: string): boolean {
  return GENERAL_SECTION_BY_ID.has(id);
}

/**
 * Section id that renders a given General-tab setting key. Every General key
 * maps to exactly one section; an unmapped key falls back to `general` so no
 * row can be orphaned. Hand-rendered keys (Publishing, Attachments, …) are
 * listed here too, so the section a search result links to is the same anchor
 * the page renders that row under.
 */
export function generalSectionForKey(key: string): string {
  if (key === "activityAnimationStyle" || key === "activityAnimationSize") {
    return "activity-animation";
  }
  if (key === "tunnelEnabled") return "publishing";
  if (key === "remoteValidation.enabled") return "remote-validation";
  if (key === "remoteValidation.browserCaptureMode") return "performance";
  if (key === "remoteValidation.offloadBrowserSteps" || key === "remoteValidation.localFallback") {
    return "remote-validation";
  }
  if (key === "storage.provider") return "attachments";
  if (
    key.startsWith("localChecks.") ||
    key.startsWith("playwright.") ||
    key.startsWith("pressureGuard.")
  ) {
    return "performance";
  }
  if (key.startsWith("model_routing.")) return "model-routing";
  if (key.startsWith("closeOut.")) return "close-out";
  if (key === "shot.maxAutoShots") return "screenshots";
  if (
    key === "ctoSkipHealthy" ||
    key === "cto.actions" ||
    key === "automation.paused" ||
    key === "autoEngineeringMode" ||
    key === "skillSuggestions" ||
    key === "attention.slowRunMultiplier" ||
    key.startsWith("autoEngineering.") ||
    key.startsWith("approval.") ||
    key.startsWith("uiVerification.") ||
    key.startsWith("reviewVerification.") ||
    key.startsWith("review.")
  ) {
    return "automation";
  }
  return "general";
}

export interface SettingLocationContext {
  /** When false, dev.inspector.* rows are not rendered on Advanced. */
  inspectorAvailable: boolean;
}

export interface SettingLocation {
  /** Tab to open when navigating to this key. */
  tab: SettingsTabId;
  /** Whether `#setting-<key>` exists on the settings page. */
  hasUiRow: boolean;
}

const GENERAL_EXCLUDED_KEYS = new Set([
  "tunnelEnabled",
  "ntfyEnabled",
  "ntfyTopic",
  // Telegram's toggle is a dedicated hand-rendered card on Notifications
  // (#0531), never an auto-rendered General row.
  "telegram.enabled",
  "auth.enabled",
  "auth.sessionMaxAge",
  // Attachment storage has a dedicated hand-rendered "Attachments" card on
  // General (#0659) that carries the availability explanation beside the
  // select, so it must not also auto-render as a plain General row.
  "storage.provider",
  // Hand-rendered card with live preview (#0787, #0813).
  "activityAnimationStyle",
  "activityAnimationSize",
  // Dev targets have a dedicated hand-rendered card on Advanced (#0749); a
  // plain comma-separated General row cannot express the four fields.
  "dev.targets",
  // The Dev-failure AI summary toggle (#0775) is rendered with the Dev targets
  // card on Advanced, not as a plain General row.
  "dev.failureSummary.ai",
  // The agent-driver budget allowlist is edited on the Agents page's Budget
  // Controls tab (#0764), not by a plain General row.
  "budget.allowlist",
  "attention.spendAlertUsd",
  // Hand-rendered checkbox list beside ctoSkipHealthy (#0796).
  "cto.actions",
  // Clef-Flash is not a selectable provider (#0809); the key is retained so an
  // existing `[model_routing]` table parses, but there is no server-URL field.
  "model_routing.baseUrl",
]);

/** Remote-validation keys with General-tab rows beside the runner card (#0836). */
export const REMOTE_VALIDATION_GENERAL_FIELD_KEYS = new Set([
  "remoteValidation.offloadBrowserSteps",
  "remoteValidation.localFallback",
  "remoteValidation.browserCaptureMode",
]);

/** Mirrors `isFieldVisible` in SettingsView.vue */
function isInspectorFieldVisible(key: string, ctx: SettingLocationContext): boolean {
  if (key === "dev.inspector.enabled" || key === "dev.inspector.editorCommand") {
    return ctx.inspectorAvailable;
  }
  return true;
}

/** Mirrors `generalFields` in SettingsView.vue — schema keys rendered in the General group. */
export function isGeneralSchemaFieldKey(key: string): boolean {
  if (GENERAL_EXCLUDED_KEYS.has(key)) return false;
  if (REMOTE_VALIDATION_GENERAL_FIELD_KEYS.has(key)) return true;
  if (key.startsWith("remoteValidation.")) return false;
  if (key.startsWith("board.columns.")) return false;
  return true;
}

/**
 * Single source of truth for which tab owns a config key and whether the settings
 * page renders a focusable `#setting-<key>` row for it.
 */
export function resolveSettingLocation(
  key: string,
  field: Pick<ConfigField, "tier" | "group"> | undefined,
  ctx: SettingLocationContext,
): SettingLocation | null {
  if (key === "tunnelEnabled" || key === "remoteValidation.enabled") {
    return { tab: "general", hasUiRow: true };
  }
  if (REMOTE_VALIDATION_GENERAL_FIELD_KEYS.has(key)) {
    return { tab: "general", hasUiRow: true };
  }
  if (key.startsWith("remoteValidation.")) {
    if (!field) return null;
    return { tab: "toml", hasUiRow: false };
  }
  // Command-based capture targets (#0761): a `[[shot.targets]]` array-of-tables
  // is raw-TOML-only, like `[[preview.targets]]` — the schema entry exists only
  // so the search overlay can point at the toml tab.
  if (key.startsWith("shot.targets")) {
    if (!field) return null;
    return { tab: "toml", hasUiRow: false };
  }
  // The budget allowlist's control lives on the Agents page's Budget Controls
  // tab (#0764), which is outside the Settings page — the schema entry exists
  // for search, which points at the toml tab for a raw edit.
  if (key === "budget.allowlist") {
    if (!field) return null;
    return { tab: "toml", hasUiRow: false };
  }
  if (key === "attention.slowRunMultiplier") {
    return { tab: "general", hasUiRow: true };
  }
  if (key === "ntfyEnabled" || key === "ntfyTopic" || key === "attention.spendAlertUsd") {
    return { tab: "notifications", hasUiRow: true };
  }
  if (key === "telegram.enabled") {
    // Dedicated hand-rendered card on Notifications (#0531).
    return { tab: "notifications", hasUiRow: true };
  }
  if (key === "storage.provider") {
    // Dedicated hand-rendered "Attachments" card on General (#0659).
    return { tab: "general", hasUiRow: true };
  }
  if (key === "activityAnimationStyle" || key === "activityAnimationSize") {
    return { tab: "general", hasUiRow: true };
  }
  if (key === "cto.actions") {
    return { tab: "general", hasUiRow: true };
  }
  if (key === "auth.enabled" || key === "auth.sessionMaxAge") {
    return { tab: "security", hasUiRow: true };
  }
  if (field?.group === "voice") {
    return { tab: "security", hasUiRow: true };
  }
  if (key.startsWith("board.columns.")) {
    return { tab: "advanced", hasUiRow: true };
  }
  if (key === "dev.targets") {
    // A hand-rendered card on Advanced (#0749); not an auto-rendered row.
    return { tab: "advanced", hasUiRow: true };
  }
  if (key === "dev.failureSummary.ai") {
    // Hand-rendered beside the Dev targets card on Advanced (#0775).
    return { tab: "advanced", hasUiRow: true };
  }
  if (key === "dev.inspector.enabled" || key === "dev.inspector.editorCommand") {
    const visible = isInspectorFieldVisible(key, ctx);
    return { tab: visible ? "advanced" : "toml", hasUiRow: visible };
  }
  if (field?.tier === "guarded") {
    return { tab: "advanced", hasUiRow: true };
  }
  if (field && isGeneralSchemaFieldKey(key)) {
    return { tab: "general", hasUiRow: true };
  }
  if (field) {
    return { tab: "toml", hasUiRow: false };
  }
  return null;
}

export function settingTabLabel(tab: SettingsTabId): string {
  return SETTINGS_TAB_LABELS[tab];
}

/**
 * Extra searchable text for settings that have a dedicated UI row but weak
 * label/key recall (e.g. tailscale → remote validation runner on General).
 */
const SETTING_SEARCH_ALIASES: Record<string, string> = {
  "remoteValidation.enabled":
    "tailscale hetzner remote validation runner configure disposable vm cloud",
  tunnelEnabled: "cloudflare tunnel publish publishing hostname public",
  "closeOut.timeoutMs": "close out move to done mtd merge pipeline budget timeout hung",
  "closeOut.gate":
    "close out move to done mtd merge gate full suite scoped reuse changed tests cheaper faster",
  "closeOut.candidate":
    "close out candidate node_modules symlink own install workspace dependencies monorepo",
  "closeOut.installCommand": "close out install command bun npm python venv cargo dependencies",
  "closeOut.postPublishCommand":
    "close out post publish merge lockfile refresh main install dependencies",
  "approval.enabled": "auto approve clean reviews policy move to done rubber stamp low risk",
  "approval.autoApprove.machineryPaths":
    "auto approve blocked paths machinery server core cli config architecture human only",
  "approval.autoApprove.allowP0": "auto approve p0 critical incident human only",
  "automation.paused": "kill switch pause stop automatic actions autopilot halt",
  "uiVerification.enabled":
    "handoff browser gate playwright console overflow screenshot verification review block",
  "uiVerification.viewportWidths": "handoff ui verification mobile desktop overflow viewport width",
  "uiVerification.autoRefreshStaleOnce":
    "automatically refresh stale screenshots evidence review rerun once",
  activityAnimationStyle:
    "activity indicator animation coding reviewing agent working dots orbital compact",
  activityAnimationSize: "activity indicator animation size larger smaller scale slider pixels px",
  "reviewVerification.guardTestCheck":
    "guard negative test review clamp needs some work check step rejection block disable turn off",
  "reviewVerification.testGlobs":
    "guard test file globs swift python go non-javascript negative test evidence path match",
  "review.humanFlagAfterPasses":
    "repeated review classes passes human attention flag loop escalating needs some work rounds",
  "shot.targets":
    "capture targets native macos ios android desktop screenshot command offscreen render simctl adb screencapture evidence image non-web",
  "budget.allowlist":
    "budget controls agent driver allowlist allowed models expensive steering restrict override",
};

export function settingSearchAliases(key: string): string {
  return SETTING_SEARCH_ALIASES[key] ?? "";
}
