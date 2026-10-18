/**
 * Outage and mode-switch behavior for cloud attachment storage (#0666, slice 9).
 *
 * When a cloud provider is configured, bytes still land on the local gitignored
 * tree first; reads try cloud then fall back to the local original if the
 * object is missing or the provider is unreachable. Upload state stays
 * "pending" until the cloud copy is verified — never "available" on faith.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createConfiguredStorageProvider } from "./attachment-migration.js";
import {
  type AttachmentUploadBase,
  readAttachmentUploadState,
  uploadRecordKey,
  upsertUploadRecord,
} from "./attachment-upload-state.js";
import { parseTaskAttachmentReferences } from "./attachment-reference.js";
import { localStorageProvider } from "./storage/local.js";
import { DEFAULT_STORAGE_PROVIDER_ID, resolveStorageProvider } from "./storage/index.js";
import type { StorageProvider } from "./storage/types.js";
import type { RepoOSConfig } from "./types.js";

/** Test-only: set to `1` to disable the local-original read fallback (#0666 negative test). */
export const ATTACHMENT_NO_LOCAL_READ_FALLBACK_ENV = "REPOOS_ATTACHMENT_NO_LOCAL_READ_FALLBACK";

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function workBaseDir(config: RepoOSConfig): string {
  return join(config.root, config.workDir);
}

function inputsBaseDir(config: RepoOSConfig): string {
  return join(config.root, config.inputsDir ?? "inputs");
}

export function attachmentBaseDir(config: RepoOSConfig, base: AttachmentUploadBase): string {
  return base === "work" ? workBaseDir(config) : inputsBaseDir(config);
}

/** True when the cloud store holds bytes matching `expected` for `objectName`. */
export function cloudObjectMatchesLocal(
  cloud: StorageProvider,
  namespace: string,
  objectName: string,
  expected: Buffer,
): boolean {
  const remote = cloud.get(namespace, objectName);
  if (!remote || remote.length !== expected.length) return false;
  return sha256Hex(remote) === sha256Hex(expected);
}

/**
 * Read through `remote`, then the local original when allowed. This is the
 * outage/mode-switch serve path — removing the local branch breaks degraded
 * reads when cloud is down (#0666 negative test).
 */
export function readWithLocalOriginalFallback(
  remote: StorageProvider,
  local: StorageProvider,
  namespace: string,
  name: string,
): Buffer | null {
  if (process.env[ATTACHMENT_NO_LOCAL_READ_FALLBACK_ENV] === "1") {
    return remote.get(namespace, name);
  }
  const fromRemote = remote.get(namespace, name);
  if (fromRemote) return fromRemote;
  return local.get(namespace, name);
}

/**
 * Storage provider for attachment bytes: local-only when configured that way;
 * otherwise cloud with a mandatory local mirror and read fallback.
 */
export function createResilientAttachmentProvider(
  baseDir: string,
  configuredId: string = DEFAULT_STORAGE_PROVIDER_ID,
): StorageProvider {
  const resolved = resolveStorageProvider(baseDir, configuredId);
  const local = localStorageProvider(baseDir);
  if (resolved.effective === DEFAULT_STORAGE_PROVIDER_ID) {
    return resolved.provider;
  }

  const remote = resolved.provider;
  return {
    id: remote.id,
    status: () => remote.status?.() ?? { available: true },
    put(namespace, name, data) {
      if (!Buffer.isBuffer(data)) return { error: "data must be a Buffer" };
      const localResult = local.put(namespace, name, data);
      if ("error" in localResult) return localResult;
      const remoteResult = remote.put(namespace, name, data);
      if ("error" in remoteResult) {
        return localResult;
      }
      return remoteResult;
    },
    get(namespace, name) {
      return readWithLocalOriginalFallback(remote, local, namespace, name);
    },
    list(namespace) {
      const names = new Set([...remote.list(namespace), ...local.list(namespace)]);
      return [...names].sort();
    },
    remove(namespace, name) {
      return remote.remove(namespace, name);
    },
    removeNamespace(namespace) {
      remote.removeNamespace(namespace);
    },
    localPath(namespace, name) {
      return local.localPath?.(namespace, name) ?? null;
    },
    size(namespace, name) {
      const fromRemote = remote.size?.(namespace, name);
      if (fromRemote != null) return fromRemote;
      return local.size?.(namespace, name) ?? null;
    },
  };
}

/** UI label values — only `pending` and `available`; local-only omits a badge. */
export type AttachmentCloudDelivery = "pending" | "available";

export function attachmentCloudDelivery(
  config: RepoOSConfig,
  base: AttachmentUploadBase,
  namespace: string,
  objectName: string,
): AttachmentCloudDelivery | null {
  const configured = config.storage?.provider ?? DEFAULT_STORAGE_PROVIDER_ID;
  if (configured === DEFAULT_STORAGE_PROVIDER_ID) return null;

  const baseDir = attachmentBaseDir(config, base);
  const resolved = resolveStorageProvider(baseDir, configured);
  if (resolved.effective === DEFAULT_STORAGE_PROVIDER_ID) return null;

  const local = localStorageProvider(baseDir);
  const localBytes = local.get(namespace, objectName);
  if (!localBytes) return null;

  const key = uploadRecordKey(base, namespace, objectName);
  const record = readAttachmentUploadState(config).records[key];
  if (record?.phase === "verified") return "available";

  const cloud = createConfiguredStorageProvider(baseDir, configured);
  if (cloud && cloudObjectMatchesLocal(cloud, namespace, objectName, localBytes)) {
    return "available";
  }

  return "pending";
}

export function recordAttachmentCloudPut(
  config: RepoOSConfig,
  base: AttachmentUploadBase,
  namespace: string,
  objectName: string,
  data: Buffer,
): void {
  const configured = config.storage?.provider ?? DEFAULT_STORAGE_PROVIDER_ID;
  if (configured === DEFAULT_STORAGE_PROVIDER_ID) return;

  const baseDir = attachmentBaseDir(config, base);
  const cloud = createConfiguredStorageProvider(baseDir, configured);
  if (!cloud) return;

  const contentSha256 = sha256Hex(data);
  const verified = cloudObjectMatchesLocal(cloud, namespace, objectName, data);
  upsertUploadRecord(config, {
    base,
    namespace,
    sourceName: objectName,
    targetName: objectName,
    phase: verified ? "verified" : "pending",
    contentSha256,
    byteLength: data.length,
    updatedAt: new Date().toISOString(),
  });
}

/** Cloud delivery state for every attachment image linked from one task body. */
export function taskAttachmentCloudStates(
  config: RepoOSConfig,
  taskId: string,
  markdown?: string,
): Record<string, AttachmentCloudDelivery> {
  const body = markdown ?? "";
  const out: Record<string, AttachmentCloudDelivery> = {};
  for (const ref of parseTaskAttachmentReferences(body)) {
    if (ref.taskId !== taskId) continue;
    const delivery = attachmentCloudDelivery(config, "work", ref.taskId, ref.objectName);
    if (delivery) out[ref.objectName] = delivery;
  }
  return out;
}
