import { Capacitor } from "@capacitor/core";

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
