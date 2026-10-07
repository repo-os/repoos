import type { ConfigField } from "./types";

/** Settings page tab ids — keep in sync with SettingsView tab panels. */
export type SettingsTabId =
  | "general"
  | "notifications"
  | "security"
  | "advanced"
  | "support"
  | "toml";

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "advanced", label: "Advanced" },
  { id: "support", label: "Support" },
  { id: "toml", label: "repoos.toml" },
];

export const SETTINGS_TAB_LABELS: Record<SettingsTabId, string> = Object.fromEntries(
  SETTINGS_TABS.map((t) => [t.id, t.label]),
) as Record<SettingsTabId, string>;

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
  "attention.spendAlertUsd",
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
  if (key.startsWith("remoteValidation.")) {
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
  if (key === "auth.enabled" || key === "auth.sessionMaxAge") {
    return { tab: "security", hasUiRow: true };
  }
  if (field?.group === "voice") {
    return { tab: "security", hasUiRow: true };
  }
  if (key.startsWith("board.columns.")) {
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
};

export function settingSearchAliases(key: string): string {
  return SETTING_SEARCH_ALIASES[key] ?? "";
}
