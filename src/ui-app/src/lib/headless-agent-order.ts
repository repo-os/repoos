/** Display order for headless default agents on the Agents page (not config seed order). */
export const HEADLESS_DISPLAY_ORDER = ["pm", "engineer", "reviewer"];

export function sortHeadlessAgents<T extends { name: string }>(agents: T[]): T[] {
  const order = new Map(HEADLESS_DISPLAY_ORDER.map((name, index) => [name, index]));
  return [...agents].sort((a, b) => {
    const ai = order.get(a.name.toLowerCase()) ?? 999;
    const bi = order.get(b.name.toLowerCase()) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}
