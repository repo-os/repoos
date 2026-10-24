import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");

describe("standard page height and floating controls", () => {
  it("lets the shared page pane fill and scroll through the full app body", () => {
    expect(css).toMatch(/#app\s*\{[^}]*height:\s*100dvh/s);
    expect(css).toMatch(/\.body\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/s);
    expect(css).toMatch(/\.main\s*\{[^}]*overflow-y:\s*auto;[^}]*min-height:\s*0;[^}]*padding:[^;]*var\(--page-bottom-inset\)/s);
  });

  it("uses a theme-token fade and shared end inset below fixed controls", () => {
    expect(css).toMatch(/--page-bottom-inset:\s*calc\(88px \+ var\(--safe-bot\)\)/);
    expect(css).toMatch(/\.body::after\s*\{[^}]*position:\s*fixed;[^}]*background:\s*linear-gradient\(to bottom, transparent, var\(--bg\)\)/s);
    expect(css).toMatch(/\.main:has\(\.work-page\)\s*\{[^}]*--page-bottom-inset:\s*calc\(154px \+ var\(--safe-bot\)\)/s);
    expect(css).toMatch(/\.work-page \.parked-lists\s*\{[^}]*z-index:\s*55;/s);
  });
});
