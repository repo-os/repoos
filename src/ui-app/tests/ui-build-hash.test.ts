/**
 * Served index.html injects the build hash without breaking inline script syntax.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const indexTpl = readFileSync(join(import.meta.dirname, "../index.html"), "utf8");

function injectBuildHash(hash: string): string {
  return indexTpl.replaceAll("__REPOOS_BUILD_HASH_VALUE__", hash);
}

describe("UI build hash placeholder", () => {
  it("keeps window.__REPOOS_BUILD_HASH__ as a valid property name when hash starts with a digit", () => {
    const hash = "94d47812e731407505ff607297ae6092236d36ef799af094a42e125862c4e4dd";
    const html = injectBuildHash(hash);
    expect(html).toContain(`window.__REPOOS_BUILD_HASH__ = "${hash}"`);
    expect(html).not.toMatch(/window\.[0-9]/);
  });

  it("keeps syntax valid when hash would look like a numeric literal prefix (0678…)", () => {
    const hash = "0678deadbeef";
    const html = injectBuildHash(hash);
    expect(html).toContain(`window.__REPOOS_BUILD_HASH__ = "${hash}"`);
    expect(() => new Function(`window.__REPOOS_BUILD_HASH__ = "${hash}";`)).not.toThrow();
  });
});
