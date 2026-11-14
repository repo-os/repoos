/**
 * Build the component name for `adb shell am start -n`.
 *
 * The debug build's applicationId gains a `.dev` suffix while the activity class
 * keeps the app's Kotlin/Java package. A leading-dot component would resolve
 * against the suffixed application id and fail on the device, so the activity
 * must always be fully qualified.
 */
export function hubLaunchComponent(appId: string, activityClass: string): string {
  if (!appId.trim()) {
    throw new LaunchComponentError("hubLaunchComponent: application id is required");
  }
  if (!activityClass.trim()) {
    throw new LaunchComponentError("hubLaunchComponent: activity class is required");
  }
  if (activityClass.includes("/")) {
    throw new LaunchComponentError(
      `hubLaunchComponent: activity class must not contain a slash (got '${activityClass}')`,
    );
  }
  if (activityClass.startsWith(".")) {
    throw new LaunchComponentError(
      `hubLaunchComponent: activity class '${activityClass}' is relative; a leading dot would resolve against the application id and fail. Use the fully qualified class.`,
    );
  }
  if (!activityClass.includes(".")) {
    throw new LaunchComponentError(
      `hubLaunchComponent: activity class '${activityClass}' is not fully qualified`,
    );
  }
  return `${appId}/${activityClass}`;
}

export class LaunchComponentError extends Error {
  override name = "LaunchComponentError";
}
