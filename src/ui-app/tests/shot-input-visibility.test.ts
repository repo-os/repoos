/**
 * Screenshot file-input visibility (#0642, #0877).
 *
 * In a WKWebView-hosted installed PWA (Safari "Add to Dock", the macOS Hub) a
 * programmatic `.click()` on a `display: none` file input never reaches
 * `WKUIDelegate.runOpenPanelWith`, so the New Task and New Input "add
 * screenshots" buttons silently did nothing. The input must stay rendered and
 * be hidden visually only (#0642), and it now covers its control so the
 * pointer click lands on the real input instead of a synthetic click (#0877;
 * `shot-dropzone.test.ts` covers that wiring).
 *
 * jsdom neither loads the stylesheet nor applies it to a mounted component, so
 * this asserts the source rules directly (mirroring overlay-layer-isolation).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "../src");

describe("screenshot file input visibility (#0642)", () => {
  const css = readFileSync(join(APP, "style.css"), "utf8");

  function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
    expect(match, `style.css must keep the ${selector} rule`).not.toBeNull();
    return match?.[0] ?? "";
  }

  it("keeps the dropzone flex layout inside .field (#0899)", () => {
    const body = rule(".field .shot-dropzone");
    expect(body).toMatch(/display:\s*flex/);
    expect(body).toMatch(/text-transform:\s*none/);
  });

  it("keeps the dropzone file input rendered and clickable", () => {
    const body = rule(".shot-dropzone .shot-input");
    expect(body, "display:none blocks the picker in WKWebView PWAs").not.toMatch(/display:\s*none/);
    // Visually hidden but still laid out, so the picker can open.
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/opacity:\s*0/);
    // The input covers the zone, so the user's click is a native click on it
    // rather than a synthetic one the PWA can ignore (#0877).
    expect(body).toMatch(/inset:\s*0/);
    expect(body, "pointer-events:none would swallow the native click").not.toMatch(
      /pointer-events:\s*none/,
    );
  });

  it("keeps the PM-chat attach input rendered and clickable", () => {
    const body = rule(".pm-shot-input");
    expect(body).not.toMatch(/display:\s*none/);
    expect(body).toMatch(/inset:\s*0/);
    expect(body).toMatch(/opacity:\s*0/);
    expect(body).not.toMatch(/pointer-events:\s*none/);
  });
});
