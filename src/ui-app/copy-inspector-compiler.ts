/**
 * Vue template compiler hook for dev-only `data-repoos-*` source attribution (#0509).
 * Loaded from vite.config.ts only — not part of the runtime bundle.
 */
import { relative } from "node:path";
import { ElementTypes, NodeTypes, type NodeTransform } from "@vue/compiler-core";

export function repoRelativeFromAbs(repoRoot: string, absPath: string): string {
  const clean = absPath.split("?")[0]!;
  return relative(repoRoot, clean).replace(/\\/g, "/");
}

/** Annotate native template elements with repo-relative file + line for the copy inspector. */
export function copyInspectorNodeTransform(repoRoot: string): NodeTransform {
  return (node, ctx) => {
    if (node.type !== NodeTypes.ELEMENT) return;
    // Native elements only: a component vnode's attrs fall through onto the
    // child's root element and win over the child's own annotation, which
    // would attribute the child's copy to the parent's file.
    if (node.tagType !== ElementTypes.ELEMENT) return;
    if (node.tag === "template" || node.tag === "slot") return;
    const startLine = node.loc?.start?.line;
    if (!startLine || !ctx.filename) return;
    const repoRel = repoRelativeFromAbs(repoRoot, ctx.filename);
    if (!repoRel.startsWith("src/")) return;
    node.props.push(
      {
        type: NodeTypes.ATTRIBUTE,
        name: "data-repoos-file",
        nameLoc: node.loc,
        value: { type: NodeTypes.TEXT, content: repoRel, loc: node.loc },
        loc: node.loc,
      },
      {
        type: NodeTypes.ATTRIBUTE,
        name: "data-repoos-line",
        nameLoc: node.loc,
        value: { type: NodeTypes.TEXT, content: String(startLine), loc: node.loc },
        loc: node.loc,
      },
    );
  };
}
