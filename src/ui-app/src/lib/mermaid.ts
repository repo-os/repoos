let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function getThemeForMermaid(): "dark" | "default" {
  const root = document.documentElement;
  const explicit = root.getAttribute("data-theme");
  if (explicit === "dark") return "dark";
  if (explicit === "light") return "default";
  // Fallback to system preference
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
}

async function loadMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        maxTextSize: 50_000,
        maxEdges: 1_000,
        theme: getThemeForMermaid(),
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

/** Render Mermaid blocks that Vue has already inserted into a Markdown view. */
export async function renderMermaidDiagrams(container: ParentNode): Promise<void> {
  const nodes = container.querySelectorAll<HTMLElement>(".md-mermaid:not([data-processed])");
  if (!nodes.length) return;

  try {
    const mermaid = await loadMermaid();
    await mermaid.run({ nodes, suppressErrors: true });
  } catch {
    // Invalid diagrams stay as their escaped source instead of breaking the
    // surrounding document view. Mermaid marks successfully rendered nodes.
  }
}
