import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const settingsView = readFileSync(join(repoRoot, "src/ui-app/src/views/SettingsView.vue"), "utf8");
const styles = readFileSync(join(repoRoot, "src/ui-app/src/style.css"), "utf8");

describe("Settings restart badge layout (#0911)", () => {
  it("places each restart hint before its control and keeps its accessible explanation", () => {
    const badgeIndexes = [...settingsView.matchAll(/class="restart-badge"/g)].map(
      (match) => match.index!,
    );
    const badges = badgeIndexes.map((index) => {
      const start = settingsView.lastIndexOf("<span", index);
      const end = settingsView.indexOf(">", settingsView.indexOf("</span", index)) + 1;
      return { index: start, source: settingsView.slice(start, end) };
    });
    expect(badges).toHaveLength(7);
    for (const badge of badges) {
      expect(badge.source).toContain('title="Changes require restarting RepoOS"');
      expect(badge.source).toContain('aria-label="Restart required"');
      expect(
        settingsView.slice(
          badge.index + badge.source.length,
          badge.index + badge.source.length + 120,
        ),
      ).toMatch(/^\s*<div[^>]*class="[^"]*setting-input/);
    }
  });

  it("right-aligns controls and lets rows wrap for narrow screens", () => {
    expect(styles).toMatch(/\.setting-row\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/\.setting-input\s*\{[^}]*margin-left:\s*auto/s);
    expect(styles).toMatch(/\.restart-badge\s*\{[^}]*white-space:\s*nowrap/s);
  });
});
