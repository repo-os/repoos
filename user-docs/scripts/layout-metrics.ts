/**
 * Layout rules for the docs site, shared by the browser test
 * (`layout.test.ts`) and the QA sweep (`docs/qa/measure-docs-site-widths.mjs`).
 *
 * `pageLayoutMetrics` runs inside the page through `page.evaluate`, so it must
 * stay self-contained: no imports, no references to anything outside its body.
 * `layoutFailures` runs in Node and turns the numbers into failure messages.
 */

export interface LayoutMetrics {
  vw: number;
  /** How far the document is wider than the viewport, in px (0 when it fits). */
  docOverflow: number;
  /** Visible elements past the viewport edge that are not inside a scroller. */
  offenderCount: number;
  offenders: string[];
  /** Code blocks whose language label is painted under the copy button or over code. */
  labelOverlaps: number;
  codeBlocks: number;
  /** Code blocks whose long lines scroll inside the block. Informational only. */
  scrollingCodeBlocks: number;
  /** Text of the page's h1: the doc title, or the hero heading on the home page. */
  h1: string | null;
}

export function pageLayoutMetrics(): LayoutMetrics {
  const vw = document.documentElement.clientWidth;
  const inScroller = (el: Element): boolean => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const describe = (el: Element): string => {
    const cls = String((el as SVGElement).className?.baseVal ?? el.className).split(" ")[0];
    return `${el.tagName.toLowerCase()}.${cls} ${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50)}`;
  };
  const offenders: string[] = [];
  for (const el of document.querySelectorAll(".vp-doc *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) offenders.push(describe(el));
  }

  // The language label must not be painted under the copy button or over code.
  const hits = (a: DOMRect, b: DOMRect): boolean =>
    a.width > 0 &&
    b.width > 0 &&
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom;
  let labelOverlaps = 0;
  const blocks = [...document.querySelectorAll(".vp-doc div[class*='language-']")];
  for (const block of blocks) {
    const lang = block.querySelector(".lang");
    if (!lang) continue;
    const label = lang.getBoundingClientRect();
    const covered = [block.querySelector(".copy"), ...block.querySelectorAll(".line")].some(
      (el) => el !== null && hits(label, el.getBoundingClientRect()),
    );
    if (covered) labelOverlaps++;
  }
  const pres = blocks
    .map((b) => b.querySelector("pre"))
    .filter((pre): pre is HTMLPreElement => pre !== null);

  return {
    vw,
    docOverflow: document.documentElement.scrollWidth - vw,
    offenderCount: offenders.length,
    offenders: offenders.slice(0, 5),
    labelOverlaps,
    codeBlocks: pres.length,
    scrollingCodeBlocks: pres.filter((pre) => pre.scrollWidth > pre.clientWidth + 1).length,
    h1:
      (document.querySelector(".vp-doc h1") ?? document.querySelector("h1"))?.textContent?.trim() ??
      null,
  };
}

/** Failure messages for one page at one width. An empty list means it passes. */
export function layoutFailures(m: LayoutMetrics): string[] {
  const failures: string[] = [];
  if (m.h1 === null) failures.push("no h1 rendered");
  if (m.docOverflow > 0) failures.push(`page scrolls sideways by ${m.docOverflow}px`);
  if (m.offenderCount > 0) {
    failures.push(`${m.offenderCount} element(s) past the viewport: ${m.offenders.join(" | ")}`);
  }
  if (m.labelOverlaps > 0) {
    failures.push(
      `${m.labelOverlaps} code block(s) paint the language label under the copy button or over code`,
    );
  }
  return failures;
}
