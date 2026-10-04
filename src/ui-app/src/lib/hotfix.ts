/**
 * Hotfix presentation helpers (#0644). One source of truth for the badge
 * label, its tooltip, and the drawer banner copy, so the card and the drawer
 * can never disagree about what a hotfix is or where it runs.
 */
export type HotfixTarget = "branch" | "main";

/** `HOTFIX · BRANCH` / `HOTFIX · MAIN` — the shared badge label. */
export function hotfixBadgeLabel(target?: HotfixTarget | null): string {
  return target === "main" ? "HOTFIX · MAIN" : "HOTFIX · BRANCH";
}

/**
 * The styled tooltip text behind the badge. Keyboard focus reaches it too —
 * the shared `.app-tooltip` listens for `focusin`, so the badge is focusable.
 */
export function hotfixTooltip(target?: HotfixTarget | null, branch?: string | null): string {
  const where =
    target === "main" ? "directly on main" : branch ? `on branch ${branch}` : "on its branch";
  return `Hotfix — runs in the main checkout ${where}. No preview and no review report; the checkout is blocked until it lands.`;
}

/** The drawer banner's one-sentence explanation. */
export function hotfixBannerText(target?: HotfixTarget | null, branch?: string | null): string {
  const where = target === "main" ? "directly on main" : branch ? `on ${branch}` : "on its branch";
  return `Running as a hotfix in the main checkout ${where}. No preview and no review report.`;
}
