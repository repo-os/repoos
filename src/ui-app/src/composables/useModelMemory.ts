/**
 * Remembers the last model chosen for each CLI (#0342). Switching an agent's
 * CLI used to reset its model to "default" and persist that instantly, wiping a
 * deliberately pinned raw model id when the picker was merely touched. Keeping
 * a per-CLI record lets the modal restore that pin when you switch back, so the
 * reset is recoverable instead of silent and permanent.
 *
 * Stored per browser (localStorage) rather than per agent because a pinned
 * model belongs to the CLI it was chosen for; the same CLI is usually pinned to
 * the same model across agents. Reads/writes are stateless so every modal
 * instance sees the latest value.
 */
const STORAGE_KEY = "agent-model-last-by-cli";

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function useModelMemory() {
  function remember(cli: string, model: string): void {
    if (!cli || !model) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...load(), [cli]: model }));
    } catch {
      // Storage unavailable (quota/private mode): the pin survives in the
      // current modal/session only.
    }
  }

  function recall(cli: string): string | undefined {
    if (!cli) return undefined;
    return load()[cli] || undefined;
  }

  return { remember, recall };
}
