/**
 * Storage-provider interface (#0658, slice 1 of "Cloud attachment storage").
 *
 * RepoOS attachments (task screenshots, captured shots, input attachments, PM
 * pending batches) have always been plain files under a gitignored
 * `.attachments/` folder (`work/.attachments/`, `inputs/.attachments/`). This
 * module names the seam those bytes live behind, so a later hosted/cloud
 * backend (Neon object storage, ...) can be added without touching callers —
 * the local provider is the reference implementation every other provider must
 * match.
 *
 * The interface is deliberately minimal: it stores and retrieves opaque bytes
 * addressed by `namespace` + `name`. It is NOT a domain model — screenshot
 * numbering, MIME validation, manifests and 1-based ids stay in the callers.
 * A provider only answers "where do the bytes go?".
 *
 * Keep this dependency-free and synchronous: the server's request paths are
 * synchronous today, and no runtime dependency may be added for it.
 */

/**
 * The result of storing one object. `localPath` is present only for providers
 * that expose bytes as a file on this machine (the local provider); remote
 * providers omit it and callers must fall back to {@link StorageProvider.get}.
 */
export interface StoredObject {
  /** Absolute local path when the provider stores as files, else omitted. */
  localPath?: string;
}

/**
 * A backend that stores attachment bytes. Every method addresses one object by
 * a `namespace` (a logical group, e.g. a task id — the provider maps it to a
 * real directory/prefix) and a `name` (the file name within it).
 *
 * Implementations MUST refuse names/namespaces that escape their store root
 * (path traversal) and MUST NOT throw on a missing object — `get`/`localPath`
 * return `null`, `remove` returns `false`.
 */
export interface StorageProvider {
  /** Stable provider id, e.g. `"local"`. Used by the registry and config. */
  readonly id: string;
  /**
   * Write `data` under `namespace/name`, overwriting any existing object.
   * Returns {@link StoredObject} on success, or `{ error }` on invalid input
   * (unsafe name, empty data, provider failure). Never throws.
   */
  put(namespace: string, name: string, data: Buffer): StoredObject | { error: string };
  /** Read the bytes stored at `namespace/name`, or `null` when absent. */
  get(namespace: string, name: string): Buffer | null;
  /** File names in `namespace`, sorted; empty when the namespace is absent. */
  list(namespace: string): string[];
  /** Remove one object. Returns `true` when something was removed. */
  remove(namespace: string, name: string): boolean;
  /** Remove a whole namespace and everything in it. Idempotent. */
  removeNamespace(namespace: string): void;
  /**
   * Absolute local path for `namespace/name`, or `null` when absent — the
   * fast path for a local provider serving a stored file. Remote providers
   * omit this method entirely (or return `null`).
   */
  localPath?(namespace: string, name: string): string | null;
  /**
   * Byte size of `namespace/name`, or `null` when absent — lets a lister
   * report sizes without reading the whole object. Remote providers may omit
   * this and have callers fall back to `get().length`.
   */
  size?(namespace: string, name: string): number | null;
}

/** True when a provider exposes stored objects as files on this machine. */
export function isLocalProvider(provider: StorageProvider): boolean {
  return typeof provider.localPath === "function";
}
