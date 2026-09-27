import { ref, type Ref } from "vue";

/** Shared across every SearchOverlay instance so bodies are fetched once per path. */
const contentByPath: Ref<Map<string, string>> = ref(new Map());
const inflight = new Map<string, Promise<void>>();

async function fetchOne(path: string): Promise<void> {
  if (contentByPath.value.has(path)) return;
  let pending = inflight.get(path);
  if (!pending) {
    pending = (async () => {
      try {
        const r = await fetch(path);
        if (r.ok) {
          const text = await r.text();
          contentByPath.value.set(path, text);
        }
      } catch {
        /* full-text search falls back to title/path metadata */
      } finally {
        inflight.delete(path);
      }
    })();
    inflight.set(path, pending);
  }
  await pending;
}

export function useSearchBodyCache(): {
  contentByPath: Ref<Map<string, string>>;
  ensurePaths: (paths: string[]) => Promise<void>;
  prefetchPath: (path: string) => void;
} {
  async function ensurePaths(paths: string[]): Promise<void> {
    const todo = paths.filter((p) => !contentByPath.value.has(p));
    await Promise.all(todo.map((path) => fetchOne(path)));
  }

  function prefetchPath(path: string): void {
    void fetchOne(path);
  }

  return { contentByPath, ensurePaths, prefetchPath };
}
