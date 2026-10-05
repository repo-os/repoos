/**
 * Local, disk-backed {@link StorageProvider} (#0658).
 *
 * This is the reference implementation and preserves today's behavior exactly:
 * attachment bytes live in `<baseDir>/.attachments/<namespace>/<name>`, a
 * gitignored tree served from disk only. Nothing here is new behavior — it is
 * the same `mkdirSync`/`writeFileSync`/`resolve` logic the attachment code
 * always used, moved behind the interface so later providers can replace it.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import type { StorageProvider, StoredObject } from "./types.js";

/** Reject names/namespaces that could escape the store root. */
function isSafeSegment(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

/**
 * A storage provider rooted at one `baseDir`, storing under the gitignored
 * `<baseDir>/.attachments/` subtree. `baseDir` is an absolute path (e.g.
 * `<root>/work`); its `.attachments` child is created lazily on first write.
 *
 * A namespace maps to `.attachments/<namespace>`; nested paths inside a
 * namespace are not addressed (callers that need a sub-tree, like captured
 * shots under `<taskId>/shots/`, pass it in the namespace string).
 */
export function localStorageProvider(baseDir: string): StorageProvider {
  const root = resolve(baseDir, ".attachments");

  /** Absolute path of `namespace/name`, or null when either segment is unsafe. */
  const target = (namespace: string, name: string): string | null => {
    if (!isSafeSegment(namespace) || !isSafeSegment(name)) return null;
    const abs = resolve(root, namespace, name);
    // Defense in depth: the resolved path must stay inside the store root.
    if (!abs.startsWith(root + sep)) return null;
    return abs;
  };

  const namespaceDir = (namespace: string): string | null =>
    isSafeSegment(namespace) ? join(root, namespace) : null;

  return {
    id: "local",
    put(namespace, name, data): StoredObject | { error: string } {
      if (!isSafeSegment(namespace) || !isSafeSegment(name)) {
        return { error: "unsafe storage name" };
      }
      if (!Buffer.isBuffer(data)) return { error: "data must be a Buffer" };
      const abs = target(namespace, name);
      if (!abs) return { error: "unsafe storage name" };
      try {
        mkdirSync(join(root, namespace), { recursive: true });
        writeFileSync(abs, data);
        return { localPath: abs };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    get(namespace, name) {
      const abs = target(namespace, name);
      if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return null;
      try {
        return readFileSync(abs);
      } catch {
        return null;
      }
    },
    list(namespace) {
      const dir = namespaceDir(namespace);
      if (!dir || !existsSync(dir)) return [];
      // Raw readdir order, exactly as the attachment code listed before this
      // interface existed — callers that need a stable order sort themselves.
      return readdirSync(dir);
    },
    remove(namespace, name) {
      const abs = target(namespace, name);
      if (!abs || !existsSync(abs)) return false;
      try {
        rmSync(abs, { force: true });
        return true;
      } catch {
        return false;
      }
    },
    removeNamespace(namespace) {
      const dir = namespaceDir(namespace);
      if (!dir) return;
      rmSync(dir, { recursive: true, force: true });
    },
    localPath(namespace, name) {
      const abs = target(namespace, name);
      if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return null;
      return abs;
    },
    size(namespace, name) {
      const abs = target(namespace, name);
      if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return null;
      try {
        return statSync(abs).size;
      } catch {
        return null;
      }
    },
  };
}
