/** Compare RepoOS release tags the way `repoos upgrade` orders them. */

const STABLE_VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
const VERSION_ORDER = /^v?(\d+)\.(\d+)\.(\d+)(?:-[a-z]+\.(\d+))?$/;

function versionOrder(version: string): number[] | null {
  const match = version.trim().match(VERSION_ORDER);
  if (!match) return null;
  const stable = match[4] === undefined ? 1 : 0;
  return [Number(match[1]), Number(match[2]), Number(match[3]), stable, Number(match[4] ?? 0)];
}

export function isStableRelease(release: { tag_name?: unknown; prerelease?: unknown }): boolean {
  return (
    release.prerelease !== true &&
    typeof release.tag_name === "string" &&
    STABLE_VERSION.test(release.tag_name.trim())
  );
}

export function isNewerVersion(latest: string, current: string | null): boolean {
  if (!latest || !current) return false;
  const a = versionOrder(latest);
  const b = versionOrder(current);
  if (!a || !b) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
