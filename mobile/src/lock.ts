/**
 * Optional device lock (biometric / device passcode).
 *
 * Uses @capgo/capacitor-native-biometric, which wraps LocalAuthentication
 * (iOS Touch/Face ID) and BiometricPrompt (Android). The lock gates *opening*
 * the app or a selected server; it never replaces the server's own
 * authentication. `verifyIdentity` resolves on success and REJECTS on
 * cancel/failure, so success is "it returned".
 */
import type { LockSettings, DeviceLockResult, ServerEntry } from "./types";

export async function probeDeviceLock(): Promise<DeviceLockResult> {
  // Dynamic import keeps the browser/dev path free of hard native deps.
  try {
    const mod = await import("@capgo/capacitor-native-biometric").catch(() => null);
    if (!mod?.NativeBiometric) return { supported: false, available: false };
    const r = await mod.NativeBiometric.isAvailable();
    return { supported: true, available: r.isAvailable };
  } catch {
    return { supported: false, available: false };
  }
}

export async function verifyWithDeviceLock(reason: string): Promise<boolean> {
  try {
    const mod = await import("@capgo/capacitor-native-biometric").catch(() => null);
    if (!mod?.NativeBiometric) return true; // no native plugin → skip (web dev)
    await mod.NativeBiometric.verifyIdentity({
      reason,
      title: "Unlock RepoOS",
      subtitle: "Authenticate to continue",
      maxAttempts: 3,
    });
    return true;
  } catch {
    return false;
  }
}

export type { LockSettings, ServerEntry };
