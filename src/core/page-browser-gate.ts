/**
 * Browser console / network / overflow checks shared by the UI handoff gate
 * (#0680) and test fakes. Keeps Playwright types out of core: callers pass a
 * page object with the event hooks the gate needs.
 */
export type PageGateIssueKind = "console" | "pageerror" | "request" | "overflow";

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

/** Build a collector that records console errors, page errors, and failed HTTP responses. */
export function createPageGateCollector(): PageGateCollector {
  const issues: PageGateIssue[] = [];
  return {
    attach(page: PageGateListenerPage): void {
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        const url = msg.location().url;
        if (text.startsWith("Failed to load resource")) {
          issues.push({ kind: "request", message: text, url });
        } else {
          issues.push({ kind: "console", message: text, url: url || undefined });
        }
      });
      page.on("pageerror", (err) => {
        issues.push({ kind: "pageerror", message: err.message });
      });
      page.on("response", (res) => {
        const status = res.status();
        if (status >= 400) {
          issues.push({
            kind: "request",
            message: `HTTP ${status} for ${res.url()}`,
            url: res.url(),
          });
        }
      });
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
  // PNG signature + IHDR — very small files are not real screenshots.
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
