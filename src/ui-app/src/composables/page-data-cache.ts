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
  const entry = entries.get(key) ?? { value: undefined, updatedAt: 0 };
  entries.set(key, entry);
  // Reserve the shared request before delivering stale data: receive() can
  // synchronously trigger another refresh for this key during navigation.
  const isRequestOwner = !entry.request;
  let resolveRequest!: (value: T | PromiseLike<T>) => void;
  let rejectRequest!: (error: unknown) => void;
  const request = (entry.request ??
    new Promise<T>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    })) as Promise<T>;
  if (isRequestOwner) entry.request = request;
  if (entry.value !== undefined) receive(entry.value as T);
  // `force` remains explicit at call sites that represent a user refresh.
  void force;
  if (isRequestOwner) {
    try {
      resolveRequest(fetcher());
    } catch (error) {
      rejectRequest(error);
    }
  }
  try {
    const value = await request;
    // An action may invalidate this resource while the request is in flight.
    // Never let that older response repopulate the cache or overwrite the
    // caller's fresh post-action load.
    if (entries.get(key) !== entry) return;
    if (isRequestOwner) {
      entry.value = value;
      entry.updatedAt = Date.now();
    }
    receive(value);
  } catch (error) {
    if (entries.get(key) === entry) failed?.(error);
  } finally {
    if (isRequestOwner && entry.request === request) entry.request = undefined;
  }
}

export function invalidatePageData(key: string): void {
  entries.delete(key);
}

export function invalidatePageDataPrefix(prefix: string): void {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
