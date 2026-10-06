import { describe, expect, it } from "vitest";
import { injectBuildHashIntoUiIndex } from "../../core/ui-index.js";

const TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta name="repoos-build-hash" content="__REPOOS_BUILD_HASH__" />
    <script>window.__REPOOS_BUILD_HASH__ = "__REPOOS_BUILD_HASH__";</script>
  </head>
</html>`;

describe("injectBuildHashIntoUiIndex", () => {
  it("substitutes the hash without breaking the inline script property name", () => {
    const hash = "7cbce21eecab6dfa233c9f8058c1128b957f17d6c14e5f63e18c7032fade39fe";
    const html = injectBuildHashIntoUiIndex(TEMPLATE, hash);
    expect(html).toContain(`content="${hash}"`);
    expect(html).toContain(`window.__REPOOS_BUILD_HASH__ = "${hash}"`);
    expect(html).not.toMatch(/window\.7cbce/);
    expect(() => {
      // The inline assignment must parse as JavaScript (WebKit pageerror otherwise).
      const m = html.match(/<script>([\s\S]*?)<\/script>/);
      if (!m) throw new Error("no script");
      new Function(m[1]);
    }).not.toThrow();
  });
});
