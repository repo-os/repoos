/**
 * Browser console / network / overflow checks shared by the UI handoff gate
 * (#0680) and test fakes. Keeps Playwright types out of core: callers pass a
 * page object with the event hooks the gate needs.
 */
export type PageGateIssueKind =
  | "console"
  | "pageerror"
  | "request"
  | "overflow"
  | "blank"
  // #0734: required visual evidence that is missing or wrong.
  | "assertion"
  | "missing-target"
  | "route";

export interface PageGateIssue {
  kind: PageGateIssueKind;
  message: string;
  url?: string;
  viewportWidth?: number;
}

export interface PageGateListenerPage {
  on(
    event: "console",
    handler: (msg: { type(): string; text(): string; location(): { url: string } }) => void,
  ): void;
  on(event: "pageerror", handler: (err: Error) => void): void;
  on(event: "response", handler: (res: { url(): string; status(): number }) => void): void;
  evaluate<T>(fn: () => T): Promise<T>;
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
  waitForTimeout?(ms: number): Promise<void>;
}

export interface PageGateCollector {
  attach(page: PageGateListenerPage): void;
  /** Issues seen since the last drain (or since attach). */
  drain(): PageGateIssue[];
}

/** URLs whose failed loads are expected on preview apps and must not fail handoff. */
export function isBenignFailedResourceUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const parsed = new URL(u);
    const path = parsed.pathname;
    if (/\/favicon\.ico$/i.test(path)) return true;
    if (/apple-touch-icon/i.test(path)) return true;
    if (/\/manifest(\.webmanifest|\.json)?$/i.test(path)) return true;
    if (/\/robots\.txt$/i.test(path)) return true;
    if (/\.(map|woff2?|ttf|ico)(\?|$)/i.test(path)) return true;
    if (/\/api\/tasks\/[^/]+\/stats$/i.test(path)) return true;
    return false;
  } catch {
    return /favicon|manifest|apple-touch-icon/i.test(u);
  }
}

/**
 * Whether an HTTP response should count against the gate. Scoped to the preview
 * origin and excludes static assets; favicon-style paths are never failures.
 */
export function shouldRecordFailedHttpResponse(
  url: string,
  status: number,
  pageOrigin?: string,
): boolean {
  if (status < 400) return false;
  if (isBenignFailedResourceUrl(url)) return false;
  if (!pageOrigin) return false;
  try {
    const res = new URL(url);
    const origin = new URL(pageOrigin);
    if (res.origin !== origin.origin) return false;
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|woff2?|ttf)(\?|$)/i.test(res.pathname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Build a collector that records console errors, page errors, and failed HTTP responses. */
export function createPageGateCollector(pageOrigin?: string): PageGateCollector {
  const issues: PageGateIssue[] = [];
  return {
    attach(page: PageGateListenerPage): void {
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        const url = msg.location().url;
        if (text.startsWith("Failed to load resource")) {
          const failUrl = url || text;
          if (isBenignFailedResourceUrl(failUrl)) return;
          issues.push({ kind: "request", message: text, url: url || undefined });
        } else {
          issues.push({ kind: "console", message: text, url: url || undefined });
        }
      });
      page.on("pageerror", (err) => {
        issues.push({ kind: "pageerror", message: err.message });
      });
      if (pageOrigin) {
        page.on("response", (res) => {
          const url = res.url();
          const status = res.status();
          if (!shouldRecordFailedHttpResponse(url, status, pageOrigin)) return;
          issues.push({
            kind: "request",
            message: `HTTP ${status} for ${url}`,
            url,
          });
        });
      }
    },
    drain(): PageGateIssue[] {
      const out = issues.splice(0, issues.length);
      return out;
    },
  };
}

/** True when the PNG is suspiciously empty (single-color / tiny). */
export function pngLooksBlank(png: Buffer): boolean {
  if (png.length < 800) return true;
  if (png.length < 2_000) return true;
  return false;
}

export async function checkHorizontalOverflowAtViewport(
  page: PageGateListenerPage,
  width: number,
  label: string,
): Promise<PageGateIssue | null> {
  await page.setViewportSize({ width, height: Math.max(800, Math.round(width * 0.75)) });
  if (page.waitForTimeout) await page.waitForTimeout(80);
  const dims = await page.evaluate(() => ({
    scrollWidth: document.body?.scrollWidth ?? 0,
    innerWidth: window.innerWidth,
  }));
  if (dims.scrollWidth > dims.innerWidth) {
    return {
      kind: "overflow",
      message: `${label}: body scrollWidth ${dims.scrollWidth} > innerWidth ${dims.innerWidth}`,
      viewportWidth: width,
    };
  }
  return null;
}

export function formatPageGateIssues(issues: PageGateIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .slice(0, 12)
    .map((i) => {
      const where =
        i.viewportWidth !== undefined ? `@${i.viewportWidth}px` : i.url ? ` (${i.url})` : "";
      return `[${i.kind}] ${i.message}${where}`;
    })
    .join("; ");
}
