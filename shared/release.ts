/**
 * The current public release, shared by every surface that displays it.
 *
 * repoos.org, docs.repoos.org and the generated llms files all read the one
 * committed `release-history.json` (written by the release pipeline at cut
 * time), so the version and release date can never drift between them.
 */
import history from "../release-history.json" with { type: "json" };

export interface ReleaseInfo {
  version: string;
  tag: string;
  /** UTC date, YYYY-MM-DD. */
  date: string;
  notes: string;
}

const releases = (history as { releases: ReleaseInfo[] }).releases;

/** Newest release; the file is written newest-first by the release pipeline. */
export const CURRENT_RELEASE: ReleaseInfo = releases[0] ?? {
  version: "0.0.0",
  tag: "v0.0.0",
  date: "",
  notes: "",
};

/** "Nov 4, 2026" — rendered in UTC so a build cannot shift the date by timezone. */
export function formatReleaseDate(date: string = CURRENT_RELEASE.date): string {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "v0.5.76 (Nov 4, 2026)" — the one-line stamp used by every agent surface. */
export function releaseStamp(): string {
  const date = formatReleaseDate();
  return date ? `v${CURRENT_RELEASE.version} (${date})` : `v${CURRENT_RELEASE.version}`;
}

/** The release notes page on GitHub. */
export const CURRENT_RELEASE_URL = `https://github.com/repo-os/repoos/releases/tag/${CURRENT_RELEASE.tag}`;
