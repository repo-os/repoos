import { Capacitor, registerPlugin } from "@capacitor/core";

interface HubDevUpdateConfig {
  enabled: boolean;
  baseUrl: string;
  installedCommit: string;
  versionCode: number;
}

interface HubDevUpdateConfigPlugin {
  getConfig(): Promise<HubDevUpdateConfig>;
}

const DevUpdateConfig = registerPlugin<HubDevUpdateConfigPlugin>("HubDevUpdateConfig");
const emptyDevUpdateConfig: HubDevUpdateConfig = {
  enabled: false,
  baseUrl: "",
  installedCommit: "unknown",
  versionCode: 0,
};
let devUpdateConfig = emptyDevUpdateConfig;

export async function loadHubDevUpdateConfig(): Promise<HubDevUpdateConfig> {
  if (Capacitor.getPlatform() !== "android") return emptyDevUpdateConfig;
  try {
    const config = await DevUpdateConfig.getConfig();
    devUpdateConfig = config.enabled ? config : emptyDevUpdateConfig;
  } catch {
    devUpdateConfig = emptyDevUpdateConfig;
  }
  return devUpdateConfig;
}

export function getHubDevUpdateConfig(): HubDevUpdateConfig {
  return devUpdateConfig;
}

export type ShellPlatform = "ios" | "android" | "web";

export function shellPlatform(): ShellPlatform {
  const p = Capacitor.getPlatform();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

/** Dev / shot fixtures: ?platform=ios|android overrides Capacitor detection. */
export function resolveShellPlatform(): ShellPlatform {
  if (typeof window === "undefined") return "web";
  const params = new URLSearchParams(window.location.search);
  const override = params.get("platform")?.trim().toLowerCase();
  if (override === "ios" || override === "android") return override;
  return shellPlatform();
}
