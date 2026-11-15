import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../src");
const appRoot = resolve(__dirname, "..");
const tabs = readFileSync(resolve(root, "components/MobileTabs.vue"), "utf8");
const heads = readFileSync(resolve(root, "components/FloatingHeads.vue"), "utf8");
const css = readFileSync(resolve(root, "style.css"), "utf8");
const statusBar = readFileSync(resolve(root, "components/IntegrationStatusBar.vue"), "utf8");
const topBar = readFileSync(resolve(root, "components/TopBar.vue"), "utf8");
const noticeBell = readFileSync(resolve(root, "components/NoticeBell.vue"), "utf8");
const searchBar = readFileSync(resolve(root, "components/SearchBar.vue"), "utf8");
const workView = readFileSync(resolve(root, "views/WorkView.vue"), "utf8");
const agentsView = readFileSync(resolve(root, "views/AgentsView.vue"), "utf8");
const sidebar = readFileSync(resolve(root, "components/Sidebar.vue"), "utf8");
const indexHtml = readFileSync(resolve(appRoot, "index.html"), "utf8");

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

describe("mobile web polish (#1139)", () => {
  it("gives top-bar controls a 44px touch target and an icon-only phone chip", () => {
    // Global controls (theme toggle, search pill, repo pill) size up together.
    expect(css).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.theme-toggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.repo-pill\s*\{[^}]*min-height:\s*44px/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.search-input\s*\{[^}]*min-height:\s*44px/s,
    );
    // Scoped TopBar controls need their own rule to beat the scoped originals.
    expect(topBar).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.help-menu-trigger,[\s\S]*?\.user-menu-trigger\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s,
    );
    expect(topBar).toMatch(
      /@media \(max-width: 719\.98px\)\s*\{[\s\S]*?\.repo-pill-text\s*\{[^}]*display:\s*none/s,
    );
    expect(topBar).toContain(':aria-label="`Repo colour');
    expect(noticeBell).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.notice-bell-trigger\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s,
    );
  });

  it("hides keyboard-only hints on touch input", () => {
    expect(css).toMatch(
      /@media \(hover: none\)\s*\{[\s\S]*?\.search-input kbd\s*\{[^}]*display:\s*none/s,
    );
    expect(css).toMatch(
      /@media \(hover: none\)\s*\{[\s\S]*?\.search-overlay-keyboard-hint\s*\{[^}]*display:\s*none/s,
    );
    // The pill's tooltip no longer advertises keyboard commands at all.
    expect(searchBar).toContain('data-tip="Search"');
    expect(searchBar).not.toContain("↑↓ navigate");
  });

  it("raises touch-device inputs to 16px so iOS does not zoom on focus", () => {
    expect(css).toMatch(
      /@media \(pointer: coarse\)\s*\{[\s\S]*?\.ff-textarea,[\s\S]*?\.nt-body-textarea,[\s\S]*?\.search-overlay-input[\s\S]*?font-size:\s*16px/s,
    );
    expect(css).toMatch(
      /@media \(pointer: coarse\)\s*\{[\s\S]*?\.field input,[\s\S]*?\.field select[\s\S]*?font-size:\s*16px/s,
    );
  });

  it("fits landscape phones and 768px tablets without clipping", () => {
    // Compact shell: icon-only sidebar rail between phone and desktop.
    expect(css).toMatch(
      /@media \(min-width: 720px\) and \(max-width: 900px\)\s*\{[\s\S]*?\.sidebar\s*\{[^}]*width:\s*60px/s,
    );
    expect(css).toMatch(
      /@media \(min-width: 720px\) and \(max-width: 900px\)\s*\{[\s\S]*?\.nav-item \.nav-label[\s\S]*?display:\s*none/s,
    );
    expect(sidebar).toContain('class="nav-label"');
    // Headers wrap their toolbars rather than clipping "Pipeline".
    expect(workView).toContain('class="work-header-actions"');
    expect(workView).toMatch(/\.work-header\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(workView).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.work-header-actions\s*\{[^}]*width:\s*100%/s,
    );
    expect(css).toMatch(
      /@media \(min-width: 720px\) and \(max-width: 900px\)\s*\{[\s\S]*?\.page-header\s*\{[^}]*flex-wrap:\s*wrap/s,
    );
    // Agents sub-tabs wrap on phones/tablets instead of scrolling off-screen.
    expect(css).toMatch(
      /@media \(max-width: 900px\)\s*\{[\s\S]*?\.agent-tabs\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow-x:\s*visible/s,
    );
    expect(agentsView).toContain('class="agent-tabs"');
  });

  it("ships an installable PWA that opens Work with an iOS icon", () => {
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(indexHtml).toContain('href="/apple-touch-icon.png"');
  });
});
