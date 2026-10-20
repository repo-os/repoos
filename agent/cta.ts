// Shared call to action for the canonical starter prompt. Landing
// (landing/src) and the docs homepage (user-docs/.vitepress/theme) both import
// this module, so the heading, sentence, labels, guide path and prompt text
// have exactly one source: agent/cta.json plus agent/starter-prompt.md.
import cta from "./cta.json";
import starterPrompt from "./starter-prompt.md?raw";

export const AGENT_CTA = cta;

/** The canonical prompt, unchanged apart from the file's trailing newline. */
export const STARTER_PROMPT = starterPrompt.trim();

/**
 * The opening of the prompt for the compact preview: the title and the first
 * lines a reader sees, with Markdown heading markers removed. Derived from the
 * prompt itself so the preview can never drift into a rewritten blurb.
 */
export function promptPreview(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3)
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join("\n");
}

export const STARTER_PROMPT_PREVIEW = promptPreview(STARTER_PROMPT);

export type AgentCtaSite = keyof typeof AGENT_CTA.guide;

/** The guide URL for a site: absolute on the marketing site, site-relative in docs. */
export function agentGuideHref(site: AgentCtaSite): string {
  return AGENT_CTA.guide[site];
}

/**
 * Copy text with the Clipboard API, falling back to a hidden textarea when the
 * API is unavailable or denied (for example on a non-secure preview origin) —
 * the same fallback InstallBox uses.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
