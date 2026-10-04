/**
 * Screenshot file-input visibility (#0642).
 *
 * In a WKWebView-hosted installed PWA (Safari "Add to Dock", the macOS Hub) a
 * programmatic `.click()` on a `display: none` file input never reaches
 * `WKUIDelegate.runOpenPanelWith`, so the New Task and New Input "add
 * screenshots" buttons silently did nothing. The input must stay rendered and
 * be hidden visually only — the same technique as `.pm-shot-input` and
 * Tailwind's `sr-only` used by the Settings bug-report upload, both of which
 * already worked.
 *
 * jsdom neither loads the stylesheet nor applies it to a mounted component, so
 * this asserts the source rule directly (mirroring overlay-layer-isolation).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "../src");

describe("screenshot file input visibility (#0642)", () => {
  const css = readFileSync(join(APP, "style.css"), "utf8");

  it("keeps the dropzone file input rendered instead of display:none", () => {
    const rule = css.match(/\.shot-dropzone \.shot-input\s*\{[^}]*\}/);
    expect(rule, "style.css must keep the dropzone file-input rule").not.toBeNull();
    const body = rule?.[0] ?? "";
    expect(body, "display:none blocks the picker in WKWebView PWAs").not.toMatch(/display:\s*none/);
    // Visually hidden but still laid out, so the picker can open.
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/opacity:\s*0/);
  });
});
