import { Capacitor } from "@capacitor/core";

// Vite only receives this value when the dev APK publish script sources the
// ignored channel configuration. Release builds therefore contain no URL.
export const hubDevUpdateBaseUrl = import.meta.env.VITE_HUB_DEV_UPDATE_BASE_URL ?? "";
export const hubDevUpdatePackage = import.meta.env.VITE_HUB_DEV_UPDATE_PACKAGE ?? "";
export const hubInstalledCommit = import.meta.env.VITE_HUB_BUILD_COMMIT ?? "unknown";
export const hubInstalledVersionCode = Number(import.meta.env.VITE_HUB_VERSION_CODE ?? 0);

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
