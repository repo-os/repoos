import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../src");
const tabs = readFileSync(resolve(root, "components/MobileTabs.vue"), "utf8");
const heads = readFileSync(resolve(root, "components/FloatingHeads.vue"), "utf8");
const css = readFileSync(resolve(root, "style.css"), "utf8");
const statusBar = readFileSync(resolve(root, "components/IntegrationStatusBar.vue"), "utf8");

describe("mobile touch affordances", () => {
  it("keeps agent launch actions visible and comfortably tappable when heads are hidden", () => {
    expect(tabs).toMatch(
      /v-if="!floatingHeadsVisible"[\s\S]*?visibleAgentShortcuts[\s\S]*?class="mobile-more-link mobile-more-agent-link"/,
    );
    expect(tabs).toContain("floatingHeadEnabled");
    expect(tabs).toContain('event: "repoos:open-cto"');
    expect(tabs).toContain('event: "repoos:open-ross"');
    expect(tabs).toContain('event: "repoos:open-debugger"');
    expect(heads).toMatch(
      /<CTOPanel[\s\S]*<RepoGuideChat[\s\S]*<DebuggerChat[\s\S]*<div v-if="visible" class="stack"/,
    );
    expect(heads).toMatch(/function openHead[\s\S]*ui\.close\(\)[\s\S]*activeHead\.value = head/);
    expect(heads).toMatch(/repoos:open-cto"[\s\S]*openCto/);
    expect(css).toMatch(/\.mobile-more-link\s*\{[^}]*min-height:\s*52px/s);
    expect(css).toMatch(/\.mobile-more-agent-link\s*\{[^}]*width:\s*100%/s);
  });

  it("lets the narrow content and integration bar use the viewport width", () => {
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?#app\s*\{[^}]*--page-inline-end-inset:\s*0px/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.main\s*\{[^}]*padding-inline-end:\s*16px/s,
    );
    expect(statusBar).toMatch(
      /@media \(max-width: 719\.98px\)[\s\S]*?\.ibar-wrap\s*\{[^}]*right:\s*12px/s,
    );
    expect(css).toMatch(/--page-bottom-inset:\s*calc\(var\(--floating-head-stack-height\)/);
    expect(heads).toMatch(/@media \(max-width: 719\.98px\)/);
  });
});
