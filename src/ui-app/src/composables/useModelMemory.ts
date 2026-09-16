/**
 * Remembers the last model chosen for each CLI, scoped to the *context* it was
 * chosen in (#0342, #0360). Switching an agent's CLI used to reset its model to
 * "default" and persist that instantly, wiping a deliberately pinned raw model
 * id when the picker was merely touched. Keeping a per-CLI record lets the modal
 * restore that pin when you switch back, so the reset is recoverable instead of
 * silent and permanent.
 *
 * The record is keyed by context *and* CLI (#0360). A context is the thing whose
 * cli/model is being edited — an agent, a task override, or a transient panel.
 * Keying by CLI alone let contexts bleed into each other: a per-task override's
 * pick for opencode would overwrite the Agents page's remembered pin for
 * opencode, so switching CLI-and-back in one context silently restored the
 * other context's model. The caller supplies a stable context key
 * (`AgentModelControl`'s `memoryKey`).
 *
 * Stored per browser (localStorage) rather than server-side because a pinned
 * model belongs to the CLI it was chosen for; this is best-effort convenience,
 * deliberately invisible to other browsers/machines. Reads/writes are stateless
 * so every modal instance sees the latest value.
 */
const STORAGE_KEY = "agent-model-last-by-context";

type Memory = Record<string, Record<string, string>>;

function load(): Memory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Memory = {};
    for (const [context, byCli] of Object.entries(parsed as Record<string, unknown>)) {
      if (!byCli || typeof byCli !== "object" || Array.isArray(byCli)) continue;
      out[context] = byCli as Record<string, string>;
    }
    return out;
  } catch {
    return {};
  }
}

export function useModelMemory() {
  function remember(context: string, cli: string, model: string): void {
    if (!context || !cli || !model) return;
    try {
      const memory = load();
      memory[context] = { ...(memory[context] ?? {}), [cli]: model };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch {
      // Storage unavailable (quota/private mode): the pin survives in the
      // current modal/session only.
    }
  }

  function recall(context: string, cli: string): string | undefined {
    if (!context || !cli) return undefined;
    return load()[context]?.[cli] || undefined;
  }

  return { remember, recall };
}
