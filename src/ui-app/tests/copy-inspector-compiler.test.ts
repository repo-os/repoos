import { describe, expect, it } from "vitest";
import { compile } from "@vue/compiler-dom";
import { copyInspectorNodeTransform } from "../copy-inspector-compiler";

function render(template: string): string {
  return compile(template, {
    filename: "/repo/src/ui-app/src/components/Parent.vue",
    nodeTransforms: [copyInspectorNodeTransform("/repo")],
  }).code;
}

describe("copyInspectorNodeTransform (#0509)", () => {
  it("annotates native elements with repo-relative file and line", () => {
    const code = render("<div>\n  <p>hello</p>\n</div>");
    expect(code).toContain('"data-repoos-file": "src/ui-app/src/components/Parent.vue"');
    expect(code).toContain('"data-repoos-line": "2"');
  });

  it("does not annotate component vnodes, so a child's own annotation is not overridden", () => {
    const code = render('<StatusPill label="x" />');
    expect(code).not.toContain("data-repoos-file");
  });

  it("ignores files outside src/", () => {
    const code = compile("<p>hi</p>", {
      filename: "/repo/scripts/Thing.vue",
      nodeTransforms: [copyInspectorNodeTransform("/repo")],
    }).code;
    expect(code).not.toContain("data-repoos-file");
  });
});
