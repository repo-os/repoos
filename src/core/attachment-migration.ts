/**
 * Local → cloud attachment migration (#0663, slice 6).
 *
 * Discovers bytes still on the local gitignored provider, uploads them to the
 * configured cloud backend with resumable state, verifies through the #0661
 * resolver, rewrites legacy screenshot names to stable `att_*` tokens, and only
 * then moves local originals into a recoverable backup tree.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  generateAttachmentObjectName,
  isLegacyScreenshotObjectName,
  resolveTaskAttachmentReference,
  taskAttachmentApiPath,
} from "./attachment-reference.js";
import {
  type AttachmentUploadBase,
  type AttachmentUploadRecord,
  readAttachmentUploadState,
  uploadRecordKey,
  upsertUploadRecord,
  writeAttachmentUploadState,
} from "./attachment-upload-state.js";
import { localStorageProvider } from "./storage/local.js";
import {
  DEFAULT_STORAGE_PROVIDER_ID,
  getStorageProviderFactory,
  type StorageProvider,
} from "./storage/index.js";
import { extname } from "node:path";
import type { RepoOSConfig } from "./types.js";

export interface MigrationPlanLine {
  base: AttachmentUploadBase;
  namespace: string;
  sourceName: string;
  targetName: string;
  rewriteRefs: boolean;
  byteLength: number;
  action: "skip-verified" | "upload" | "verify-only" | "resume-upload";
}

export interface AttachmentMigrationResult {
  dryRun: boolean;
  providerId: string;
  planned: MigrationPlanLine[];
  uploaded: number;
  verified: number;
  skipped: number;
  rewrittenTaskFiles: string[];
  errors: string[];
}

const BACKUP_DIR = "attachment-migration-backup";

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function workBaseDir(config: RepoOSConfig): string {
  return join(config.root, config.workDir);
}

function inputsBaseDir(config: RepoOSConfig): string {
  return join(config.root, config.inputsDir ?? "inputs");
}

function baseDirFor(config: RepoOSConfig, base: AttachmentUploadBase): string {
  return base === "work" ? workBaseDir(config) : inputsBaseDir(config);
}

/** Cloud provider for `configuredId`, or null when unavailable (no local fallback). */
export function createConfiguredStorageProvider(
  baseDir: string,
  configuredId: string,
): StorageProvider | null {
  if (!configuredId || configuredId === DEFAULT_STORAGE_PROVIDER_ID) return null;
  const factory = getStorageProviderFactory(configuredId);
  if (!factory) return null;
  let provider: StorageProvider;
  try {
    provider = factory(baseDir);
  } catch {
    return null;
  }
  const status = provider.status?.();
  if (status && !status.available) return null;
  return provider;
}

function backupPath(
  config: RepoOSConfig,
  base: AttachmentUploadBase,
  namespace: string,
  sourceName: string,
): string {
  return join(config.root, config.cacheDir, BACKUP_DIR, base, namespace, sourceName);
}

function discoverLocalObjects(
  config: RepoOSConfig,
  base: AttachmentUploadBase,
): Array<{ namespace: string; name: string }> {
  const local = localStorageProvider(baseDirFor(config, base));
  const root = join(baseDirFor(config, base), ".attachments");
  if (!existsSync(root)) return [];
  const out: Array<{ namespace: string; name: string }> = [];
  for (const namespace of readdirSync(root)) {
    const nsPath = join(root, namespace);
    try {
      if (!statSync(nsPath).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const name of local.list(namespace)) {
      const abs = join(nsPath, name);
      try {
        if (!statSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      out.push({ namespace, name });
    }
  }
  return out;
}

function targetObjectName(sourceName: string, existing?: AttachmentUploadRecord): string {
  if (existing?.targetName) return existing.targetName;
  if (isLegacyScreenshotObjectName(sourceName)) {
    return generateAttachmentObjectName(extname(sourceName) || ".bin");
  }
  return sourceName;
}

function cloudObjectMatches(
  cloud: StorageProvider,
  namespace: string,
  targetName: string,
  expectedSha: string,
  expectedLen: number,
): boolean {
  const remote = cloud.get(namespace, targetName);
  if (!remote || remote.length !== expectedLen) return false;
  return sha256Hex(remote) === expectedSha;
}

function rewriteTaskAttachmentRefs(
  config: RepoOSConfig,
  taskId: string,
  oldName: string,
  newName: string,
): string[] {
  if (oldName === newName) return [];
  const workRoot = join(config.root, config.workDir);
  const updated: string[] = [];
  const oldSegment = encodeURIComponent(oldName);
  const newPath = taskAttachmentApiPath(taskId, newName);
  const oldPathPlain = taskAttachmentApiPath(taskId, oldName);

  const visit = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!config.taskExtensions.some((ext) => entry.endsWith(ext))) continue;
      let text = readFileSync(abs, "utf8");
      if (
        !text.includes(oldPathPlain) &&
        !text.includes(`/attachments/${oldName})`) &&
        !text.includes(`/attachments/${oldSegment})`)
      ) {
        continue;
      }
      text = text.split(oldPathPlain).join(newPath);
      text = text.replace(
        new RegExp(`/api/tasks/${taskId}/attachments/${escapeRegExp(oldName)}`, "g"),
        newPath,
      );
      text = text.replace(
        new RegExp(`/api/tasks/${taskId}/attachments/${escapeRegExp(oldSegment)}`, "g"),
        newPath,
      );
      writeFileSync(abs, text, "utf8");
      updated.push(relative(config.root, abs));
    }
  };
  visit(workRoot);
  return updated;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verifyThroughResolver(
  config: RepoOSConfig,
  taskId: string,
  objectName: string,
  expectedSha: string,
): boolean {
  const resolved = resolveTaskAttachmentReference(config, taskId, objectName);
  if (!resolved) return false;
  return sha256Hex(resolved.data) === expectedSha;
}

export interface RunAttachmentMigrationOptions {
  dryRun?: boolean;
}

/**
 * Migrate local attachment bytes to the configured cloud provider. When
 * `dryRun` is true, only {@link AttachmentMigrationResult.planned} is filled.
 */
export function runAttachmentMigration(
  config: RepoOSConfig,
  options: RunAttachmentMigrationOptions = {},
): AttachmentMigrationResult {
  const dryRun = options.dryRun === true;
  const configuredId = config.storage?.provider?.trim() || DEFAULT_STORAGE_PROVIDER_ID;
  const result: AttachmentMigrationResult = {
    dryRun,
    providerId: configuredId,
    planned: [],
    uploaded: 0,
    verified: 0,
    skipped: 0,
    rewrittenTaskFiles: [],
    errors: [],
  };

  if (configuredId === DEFAULT_STORAGE_PROVIDER_ID) {
    result.errors.push(
      "storage.provider is still local — set a cloud provider in repoos.toml before migrating.",
    );
    return result;
  }

  const bases: AttachmentUploadBase[] = ["work", "inputs"];
  const clouds = new Map<AttachmentUploadBase, StorageProvider>();
  for (const base of bases) {
    const cloud = createConfiguredStorageProvider(baseDirFor(config, base), configuredId);
    if (!cloud) {
      result.errors.push(
        `The "${configuredId}" storage provider is not available for ${base} attachments.`,
      );
      return result;
    }
    clouds.set(base, cloud);
  }

  const state = readAttachmentUploadState(config);

  for (const base of bases) {
    const local = localStorageProvider(baseDirFor(config, base));
    const cloud = clouds.get(base)!;
    const objects = discoverLocalObjects(config, base);

    for (const { namespace, name: sourceName } of objects) {
      const key = uploadRecordKey(base, namespace, sourceName);
      const existing = state.records[key];
      const localBytes = local.get(namespace, sourceName);
      if (!localBytes) {
        if (existing?.phase === "verified") {
          result.skipped++;
          result.planned.push({
            base,
            namespace,
            sourceName,
            targetName: existing.targetName,
            rewriteRefs: false,
            byteLength: existing.byteLength,
            action: "skip-verified",
          });
        }
        continue;
      }

      const contentSha256 = existing?.contentSha256 ?? sha256Hex(localBytes);
      const byteLength = localBytes.length;
      const targetName = targetObjectName(sourceName, existing);
      const rewriteRefs =
        base === "work" && isLegacyScreenshotObjectName(sourceName) && targetName !== sourceName;

      let action: MigrationPlanLine["action"] = "upload";
      if (existing?.phase === "verified") {
        action = "skip-verified";
      } else if (cloudObjectMatches(cloud, namespace, targetName, contentSha256, byteLength)) {
        action = "verify-only";
      } else if (existing?.phase === "uploading" || existing?.phase === "failed") {
        action = "resume-upload";
      }

      result.planned.push({
        base,
        namespace,
        sourceName,
        targetName,
        rewriteRefs,
        byteLength,
        action,
      });

      if (dryRun) continue;

      const recordBase: AttachmentUploadRecord = {
        base,
        namespace,
        sourceName,
        targetName,
        phase: "uploading",
        contentSha256,
        byteLength,
        updatedAt: new Date().toISOString(),
      };
      upsertUploadRecord(config, recordBase);

      if (action !== "verify-only" && action !== "skip-verified") {
        if (!cloudObjectMatches(cloud, namespace, targetName, contentSha256, byteLength)) {
          const put = cloud.put(namespace, targetName, localBytes);
          if ("error" in put) {
            upsertUploadRecord(config, {
              ...recordBase,
              phase: "failed",
              error: put.error,
            });
            result.errors.push(`${key}: upload failed — ${put.error}`);
            continue;
          }
          result.uploaded++;
        }
        upsertUploadRecord(config, { ...recordBase, phase: "uploaded" });
      }

      if (base === "work") {
        if (!verifyThroughResolver(config, namespace, targetName, contentSha256)) {
          upsertUploadRecord(config, {
            ...recordBase,
            phase: "failed",
            error: "verification failed: resolver could not read cloud object",
          });
          result.errors.push(`${key}: verification failed (resolver)`);
          continue;
        }
      } else {
        const remote = cloud.get(namespace, targetName);
        if (!remote || sha256Hex(remote) !== contentSha256) {
          upsertUploadRecord(config, {
            ...recordBase,
            phase: "failed",
            error: "verification failed: cloud bytes mismatch",
          });
          result.errors.push(`${key}: verification failed (bytes)`);
          continue;
        }
      }

      result.verified++;
      if (rewriteRefs) {
        result.rewrittenTaskFiles.push(
          ...rewriteTaskAttachmentRefs(config, namespace, sourceName, targetName),
        );
      }

      const backup = backupPath(config, base, namespace, sourceName);
      mkdirSync(dirname(backup), { recursive: true });
      const localPath = local.localPath?.(namespace, sourceName);
      if (localPath && existsSync(localPath)) {
        copyFileSync(localPath, backup);
        local.remove(namespace, sourceName);
      }

      upsertUploadRecord(config, { ...recordBase, phase: "verified" });
      state.records[key] = {
        ...recordBase,
        phase: "verified",
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (!dryRun) writeAttachmentUploadState(config, state);
  return result;
}
