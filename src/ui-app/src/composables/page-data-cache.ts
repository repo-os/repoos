/** Small in-memory stale-while-revalidate cache for page-level API resources. */
type Entry = { value: unknown; updatedAt: number; request?: Promise<unknown> };
const entries = new Map<string, Entry>();

export async function refreshPageData<T>(
  key: string,
  fetcher: () => Promise<T>,
  receive: (value: T) => void,
  failed?: (error: unknown) => void,
  force = false,
): Promise<void> {
  let entry = entries.get(key);
  if (entry?.value !== undefined) receive(entry.value as T);
  // Cached values render synchronously through receive(), then always revalidate.
  // `force` remains explicit at call sites that represent a user refresh.
  void force;
  if (entry?.request) {
    try {
      receive((await entry.request) as T);
    } catch (error) {
      failed?.(error);
    }
    return;
  }
  entry ??= { value: undefined, updatedAt: 0 };
  const request = fetcher();
  entry.request = request;
  entries.set(key, entry);
  try {
    const value = await request;
    entry.value = value;
    entry.updatedAt = Date.now();
    receive(value);
  } catch (error) {
    failed?.(error);
  } finally {
    entry.request = undefined;
  }
}

export function invalidatePageData(key: string): void {
  entries.delete(key);
}
