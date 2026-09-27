/**
 * Build the `?story=` ref for navigating from a task to the Stories panel (#0553).
 * Registered stories link by number; tag-only stories link by key.
 */
import { storyKey } from "../../../core/stories.js";
import type { StoryDefinitionRecord } from "../types.js";

export function storyDeepLinkRef(
  storyName: string,
  definitions: readonly StoryDefinitionRecord[],
): string {
  const name = storyName.replace(/\s+/g, " ").trim();
  if (!name) return "";
  const key = storyKey(name);
  const def = definitions.find((d) => d.key === key);
  if (def?.number) return def.number;
  return key;
}

export function storyOpenLabel(
  storyName: string,
  definitions: readonly StoryDefinitionRecord[],
): string {
  const name = storyName.replace(/\s+/g, " ").trim();
  if (!name) return "";
  const key = storyKey(name);
  const def = definitions.find((d) => d.key === key);
  const display = def?.name ?? name;
  if (def?.number) return `Open story "${display}" (#${def.number})`;
  return `Open story "${display}"`;
}
