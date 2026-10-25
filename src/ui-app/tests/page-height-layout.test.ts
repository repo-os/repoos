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
      /\.main\s*\{[^}]*overflow-y:\s*auto;[^}]*min-height:\s*0;[^}]*padding:[^;]*var\(--page-bottom-inset\)/s,
    );
  });

  it("uses a theme-token fade and shared end inset below fixed controls", () => {
    expect(css).toMatch(/--floating-head-size:\s*52px/);
    expect(css).toMatch(/--floating-head-gap:\s*8px/);
    expect(css).toMatch(
      /--floating-head-stack-height:\s*calc\([\s\S]*--floating-head-size[\s\S]*--floating-head-gap/,
    );
    expect(css).toMatch(
      /--page-bottom-inset:\s*calc\(var\(--floating-head-stack-height\) \+ var\(--floating-head-bottom\) \+ 16px\)/,
    );
    expect(css).toMatch(
      /\.body::after\s*\{[^}]*position:\s*fixed;[^}]*background:\s*linear-gradient\(to bottom, transparent, var\(--bg\)\)/s,
    );
    expect(css).toMatch(
      /--page-bottom-fade-size:\s*calc\(var\(--floating-head-stack-height\) \+ var\(--floating-head-bottom\)\)/,
    );
    expect(css).toMatch(/--floating-head-size:\s*46px/);
    expect(css).toMatch(/padding:\s*18px 16px var\(--page-bottom-inset\)/);
    expect(floatingHeads).toMatch(/\.stack\s*\{[^}]*gap:\s*var\(--floating-head-gap\)/s);
    expect(floatingHeads).toMatch(
      /\.head-btn\s*\{[^}]*width:\s*var\(--floating-head-size\);[^}]*height:\s*var\(--floating-head-size\)/s,
    );
    expect(floatingHeads).toMatch(
      /\.floating-heads\s*\{[^}]*bottom:\s*var\(--floating-head-bottom\)/s,
    );
    expect(css).toMatch(/\.work-page \.parked-lists\s*\{[^}]*z-index:\s*55;/s);
  });
});
