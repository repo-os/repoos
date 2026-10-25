import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
const floatingHeads = readFileSync(
  resolve(__dirname, "../src/components/FloatingHeads.vue"),
  "utf8",
);

describe("standard page height and floating controls", () => {
  it("lets the shared page pane fill and scroll through the full app body", () => {
    expect(css).toMatch(/#app\s*\{[^}]*height:\s*100dvh/s);
    expect(css).toMatch(/\.body\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/s);
    expect(css).toMatch(
      /\.main\s*\{[^}]*overflow-y:\s*auto;[^}]*min-height:\s*0;[^}]*padding:\s*22px 26px 0/s,
    );
  });

  it("uses a theme-token fade and shared end inset below fixed controls", () => {
    expect(css).toMatch(/--floating-head-size:\s*52px/);
    expect(css).toMatch(/--floating-head-gap:\s*8px/);
    expect(css).toMatch(
      /--floating-head-stack-height:\s*calc\([\s\S]*--floating-head-size[\s\S]*--floating-head-gap/,
    );
    expect(css).toMatch(
      /--page-bottom-inset:\s*calc\(var\(--floating-head-stack-height\) \+ var\(--floating-head-bottom\) \+ 24px\)/,
    );
    expect(css).toMatch(
      /\.body::after\s*\{[^}]*position:\s*fixed;[^}]*left:\s*auto;[^}]*right:\s*0;[^}]*width:\s*calc\(var\(--floating-head-size\) \+ var\(--floating-head-inline-offset\) \+ 22px\);[^}]*background:\s*linear-gradient\(to bottom, transparent, var\(--bg\)\)/s,
    );
    expect(css).toMatch(/full-width viewport[\s\S]*?gradient reads as a bottom band/);
    expect(css).toMatch(
      /--page-bottom-fade-size:\s*calc\(var\(--floating-head-stack-height\) \+ var\(--floating-head-bottom\)\)/,
    );
    expect(css).toMatch(
      /--page-inline-end-inset:\s*calc\(\s*var\(--floating-head-size\) \+ var\(--floating-head-inline-offset\) \+ 12px\s*\)/,
    );
    expect(css).toMatch(
      /\.main\s*\{[^}]*padding-inline-end:\s*max\(26px, var\(--page-inline-end-inset\)\)/s,
    );
    expect(css).toMatch(/--floating-head-size:\s*46px/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.main\s*\{[^}]*padding:\s*18px 16px 0/s);
    expect(floatingHeads).toMatch(/\.stack\s*\{[^}]*gap:\s*var\(--floating-head-gap\)/s);
    expect(floatingHeads).toMatch(
      /\.head-btn\s*\{[^}]*width:\s*var\(--floating-head-size\);[^}]*height:\s*var\(--floating-head-size\)/s,
    );
    expect(floatingHeads).toMatch(
      /\.floating-heads\s*\{[^}]*bottom:\s*var\(--floating-head-bottom\)/s,
    );
    expect(css).toMatch(/\.work-page \.parked-lists\s*\{[^}]*z-index:\s*55;/s);
    expect(css).toMatch(
      /\.work-page \.parked-lists\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--bg\) 88%, transparent\);[^}]*backdrop-filter:\s*blur\(12px\)/s,
    );
  });

  it("reserves more than the three stacked head buttons at scroll end (#0951)", () => {
    const size = 52;
    const gap = 8;
    const stack = size * 3 + gap * 2;
    const bottom = 22;
    const clearance = 24;
    const minInset = stack + bottom + clearance;
    expect(minInset).toBeGreaterThan(200);
    expect(css).toContain(
      `--page-bottom-inset: calc(var(--floating-head-stack-height) + var(--floating-head-bottom) + ${clearance}px)`,
    );
  });

  it("keeps the internally scrolling Work columns clear of fixed bottom controls", () => {
    expect(css).toMatch(
      /\.col-body\s*\{[^}]*overflow-y:\s*auto;[\s\S]*padding:\s*4px 8px var\(--page-bottom-inset\)/s,
    );
  });

  it("clears floating heads in page-scroll views (Checks, Releases, Deployments)", () => {
    expect(css).toMatch(
      /\.page-scroll-body\s*\{[^}]*padding-bottom:\s*var\(--page-bottom-inset\)/s,
    );
  });
});
