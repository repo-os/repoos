import { describe, expect, test } from "bun:test";
import { scopeHeadingIds } from "../.vitepress/release-heading-ids";

describe("scopeHeadingIds", () => {
  test("prefixes each heading id with the release tag", () => {
    const html = '<h3 id="highlights" tabindex="-1">Highlights</h3>';
    expect(scopeHeadingIds(html, "v0.5.92")).toBe(
      '<h3 id="v0-5-92--highlights" tabindex="-1">Highlights</h3>',
    );
  });

  test("rewrites the header-anchor link inside the heading to the scoped id", () => {
    const html =
      '<h3 id="known-issues" tabindex="-1">Known issues<a class="header-anchor" href="#known-issues" aria-label="Permalink">&ZeroWidthSpace;</a></h3>';
    const out = scopeHeadingIds(html, "v0.5.81");
    expect(out).toContain('id="v0-5-81--known-issues"');
    expect(out).toContain('href="#v0-5-81--known-issues"');
    expect(out).not.toContain('href="#known-issues"');
  });

  test("leaves links to other anchors and non-heading elements alone", () => {
    const html =
      '<p><a href="#known-issues">jump</a></p><h2 id="a">A<a href="#a">#</a></h2><a href="#VPContent">skip</a>';
    const out = scopeHeadingIds(html, "v1.0.0");
    expect(out).toContain('<p><a href="#known-issues">jump</a></p>');
    expect(out).toContain('<h2 id="v1-0-0--a">A<a href="#v1-0-0--a">#</a></h2>');
    expect(out).toContain('<a href="#VPContent">skip</a>');
  });

  test("keeps two releases' identical headings distinct", () => {
    const html = '<h3 id="fixes">Fixes</h3>';
    const a = scopeHeadingIds(html, "v0.5.80");
    const b = scopeHeadingIds(html, "v0.5.81");
    expect(a).toContain('id="v0-5-80--fixes"');
    expect(b).toContain('id="v0-5-81--fixes"');
  });
});
