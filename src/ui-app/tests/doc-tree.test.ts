import { describe, expect, it } from "vitest";
import { buildDocTree, flattenDocTree } from "../src/lib/docTree";

describe("buildDocTree", () => {
  it("builds a nested tree of arbitrary depth from flat paths", () => {
    const tree = buildDocTree([
      { path: "AGENTS.md" },
      { path: "docs/architecture.md" },
      { path: "docs/api/v1/endpoints.md" },
      { path: "docs/api/v1/limits.md" },
      { path: "docs/api/v2/overview.md" },
    ]);

    expect(tree.map((n) => n.name)).toEqual(["docs", "AGENTS.md"]);
    const docs = tree[0];
    expect(docs.key).toBe("docs");
    expect(docs.isFile).toBe(false);
    expect(docs.children!.map((n) => n.name)).toEqual(["api", "architecture.md"]);

    const api = docs.children![0];
    expect(api.key).toBe("docs/api");
    expect(api.children!.map((n) => n.name)).toEqual(["v1", "v2"]);

    const v1 = api.children![0];
    expect(v1.key).toBe("docs/api/v1");
    expect(v1.children!.map((n) => n.name)).toEqual(["endpoints.md", "limits.md"]);

    const top = tree[1];
    expect(top.key).toBe("AGENTS.md");
    expect(top.isFile).toBe(true);
    expect(top.path).toBe("AGENTS.md");
  });

  it("keys directories by full path so same-named dirs stay distinct", () => {
    const tree = buildDocTree([{ path: "a/api/readme.md" }, { path: "b/api/readme.md" }]);
    const dirs = tree.flatMap((n) => n.children!).filter((n) => !n.isFile);
    expect(dirs.map((n) => n.key).sort()).toEqual(["a/api", "b/api"]);
  });

  it("sorts directories before files and ignores empty paths", () => {
    expect(
      buildDocTree([{ path: "" }, { path: "b.md" }, { path: "a/x.md" }]).map((n) => n.name),
    ).toEqual(["a", "b.md"]);
  });
});

describe("flattenDocTree", () => {
  const tree = buildDocTree([
    { path: "top.md" },
    { path: "docs/a.md" },
    { path: "docs/api/v1/x.md" },
  ]);

  it("collapses unexpanded directories to a single row", () => {
    const flat = flattenDocTree(tree, new Set(["docs/api"]));
    expect(flat.map((n) => n.name)).toEqual(["docs", "top.md"]);
  });

  it("recurses to arbitrary depth under expanded keys", () => {
    const flat = flattenDocTree(tree, new Set(["docs", "docs/api", "docs/api/v1"]));
    expect(flat.map((n) => n.name)).toEqual(["docs", "api", "v1", "x.md", "a.md", "top.md"]);
    expect(flat.find((n) => n.name === "x.md")!.depth).toBe(3);
  });

  it("keys each row by its full path", () => {
    const flat = flattenDocTree(tree, new Set(["docs", "docs/api", "docs/api/v1"]));
    expect(flat.map((n) => n.key)).toEqual([
      "docs",
      "docs/api",
      "docs/api/v1",
      "docs/api/v1/x.md",
      "docs/a.md",
      "top.md",
    ]);
  });
});
