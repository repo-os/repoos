import { InAppBrowser } from "@capacitor/inappbrowser";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { hubDevUpdateBaseUrl, hubDevUpdatePackage, hubInstalledVersionCode } from "./platform";

export interface DevUpdateManifest {
  versionName: string;
  versionCode: number;
  commit: string;
  builtAt: string;
  notes: string[];
}

const CHECKED_AT_KEY = "repoos.devUpdate.checkedAt";
const SNOOZED_UNTIL_KEY = "repoos.devUpdate.snoozedUntil";
const HOUR_MS = 60 * 60 * 1000;

export function isDevUpdateChannelEnabled(): boolean {
  return (
    Capacitor.getPlatform() === "android" &&
    hubDevUpdatePackage === "org.repoos.mobile.dev" &&
    Boolean(hubDevUpdateBaseUrl)
  );
}

export async function checkForDevUpdate(force = false): Promise<DevUpdateManifest | null> {
  if (!isDevUpdateChannelEnabled()) return null;
  try {
    const now = Date.now();
    const [checkedAt, snoozedUntil] = await Promise.all([
      Preferences.get({ key: CHECKED_AT_KEY }),
      Preferences.get({ key: SNOOZED_UNTIL_KEY }),
    ]);
    if (!force && now - Number(checkedAt.value || 0) < HOUR_MS) return null;
    await Preferences.set({ key: CHECKED_AT_KEY, value: String(now) });
    const response = await fetch(`${hubDevUpdateBaseUrl}/latest.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const manifest = (await response.json()) as DevUpdateManifest;
    if (
      !Number.isInteger(manifest.versionCode) ||
      manifest.versionCode <= hubInstalledVersionCode ||
      !Array.isArray(manifest.notes)
    )
      return null;
    if (!force && now < Number(snoozedUntil.value || 0)) return null;
    return manifest;
  } catch {
    return null;
  }
}

export async function snoozeDevUpdate(): Promise<void> {
  await Preferences.set({ key: SNOOZED_UNTIL_KEY, value: String(Date.now() + HOUR_MS) });
}

export async function openDevUpdateApk(): Promise<void> {
  if (!isDevUpdateChannelEnabled()) return;
  try {
    await InAppBrowser.openInExternalBrowser({ url: `${hubDevUpdateBaseUrl}/latest.apk` });
  } catch {
    // A missing browser or offline device should not interrupt app use.
  }
}
