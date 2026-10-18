import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "./repoos.js";
import { localStorageProvider } from "./storage/local.js";
import {
  registerStorageProvider,
  unregisterStorageProvider,
} from "./storage/registry.js";
import type { StorageProvider } from "./storage/types.js";
import { taskAttachmentApiPath, taskAttachmentStore } from "./attachment-reference.js";
import { runAttachmentMigration } from "./attachment-migration.js";
import { readAttachmentUploadState, uploadRecordKey } from "./attachment-upload-state.js";
import { appendScreenshotsSection } from "../server/attachments.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-migrate-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  unregisterStorageProvider("mem-cloud");
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function memCloudProvider(stores: Map<string, Map<string, Buffer>>): StorageProvider {
  return {
    id: "mem-cloud",
    status: () => ({ available: true }),
    put(namespace, name, data) {
      if (!stores.has(namespace)) stores.set(namespace, new Map());
      stores.get(namespace)!.set(name, Buffer.from(data));
      return {};
    },
    get(namespace, name) {
      return stores.get(namespace)?.get(name) ?? null;
    },
    list(namespace) {
      return [...(stores.get(namespace)?.keys() ?? [])].sort();
    },
    remove(namespace, name) {
      const ns = stores.get(namespace);
      if (!ns?.has(name)) return false;
      ns.delete(name);
      return true;
    },
    removeNamespace(namespace) {
      stores.delete(namespace);
    },
    size(namespace, name) {
      const buf = stores.get(namespace)?.get(name);
      return buf ? buf.length : null;
    },
  };
}

describe("attachment migration (#0663)", () => {
  it("dry-run reports uploads without mutating local or cloud", () => {
    const root = tempRoot();
    const cloud = new Map<string, Map<string, Buffer>>();
    registerStorageProvider("mem-cloud", () => memCloudProvider(cloud));

    const repoos = createRepoOS(root);
    const task = repoos.createTask({ title: "migrate dry" });
    repoos.config.storage = { provider: "mem-cloud" };
    const local = localStorageProvider(join(root, repoos.config.workDir));
    local.put(task.id, "screenshot-1.png", Buffer.from(PNG_1PX, "base64"));

    const result = runAttachmentMigration(repoos.config, { dryRun: true });
    expect(result.planned).toHaveLength(1);
    expect(result.planned[0]?.action).toBe("upload");
    expect(cloud.size).toBe(0);
    expect(local.get(task.id, "screenshot-1.png")).not.toBeNull();
    expect(readAttachmentUploadState(repoos.config).records).toEqual({});
  });

  it("uploads, verifies through the resolver, rewrites legacy names, and releases locals", () => {
    const root = tempRoot();
    const cloud = new Map<string, Map<string, Buffer>>();
    registerStorageProvider("mem-cloud", () => memCloudProvider(cloud));

    const repoos = createRepoOS(root);
    const task = repoos.createTask({ title: "migrate real" });
    repoos.config.storage = { provider: "mem-cloud" };
    const workBase = join(root, repoos.config.workDir);
    const local = localStorageProvider(workBase);
    local.put(task.id, "screenshot-1.png", Buffer.from(PNG_1PX, "base64"));

    const legacyUrl = taskAttachmentApiPath(task.id, "screenshot-1.png");
    const withShot = repoos.updateTask(task.id, {
      body: appendScreenshotsSection("", [
        {
          id: "1",
          name: "bug",
          path: `work/.attachments/${task.id}/screenshot-1.png`,
          url: legacyUrl,
          size: 1,
          mime: "image/png",
        },
      ]),
    });

    void withShot;

    const result = runAttachmentMigration(repoos.config);
    expect(result.errors).toEqual([]);
    expect(result.uploaded).toBe(1);
    expect(result.verified).toBe(1);
    expect(local.get(task.id, "screenshot-1.png")).toBeNull();
    expect(cloud.get(task.id)?.size).toBe(1);
    const targetName = [...(cloud.get(task.id)?.keys() ?? [])][0]!;
    expect(targetName).toMatch(/^att_/);
    expect(taskAttachmentStore(repoos.config).get(task.id, targetName)?.length).toBeGreaterThan(
      0,
    );

    const taskFile = readFileSync(join(root, task.path), "utf8");
    expect(taskFile).toContain(taskAttachmentApiPath(task.id, targetName));
    expect(taskFile).not.toContain("screenshot-1.png");

    const backup = join(
      root,
      repoos.config.cacheDir,
      "attachment-migration-backup",
      "work",
      task.id,
      "screenshot-1.png",
    );
    expect(existsSync(backup)).toBe(true);

    const state = readAttachmentUploadState(repoos.config);
    const key = uploadRecordKey("work", task.id, "screenshot-1.png");
    expect(state.records[key]?.phase).toBe("verified");
  });

  it("resumes with verify-only when the cloud object already exists", () => {
    const root = tempRoot();
    const cloud = new Map<string, Map<string, Buffer>>();
    let putCalls = 0;
    registerStorageProvider("mem-cloud", () => {
      const inner = memCloudProvider(cloud);
      return {
        ...inner,
        put(namespace, name, data) {
          putCalls++;
          return inner.put(namespace, name, data);
        },
      };
    });

    const repoos = createRepoOS(root);
    const task = repoos.createTask({ title: "resume" });
    repoos.config.storage = { provider: "mem-cloud" };
    const workBase = join(root, repoos.config.workDir);
    const local = localStorageProvider(workBase);
    const bytes = Buffer.from(PNG_1PX, "base64");
    local.put(task.id, "shot.png", bytes);
    cloud.set(task.id, new Map([["shot.png", Buffer.from(bytes)]]));

    const result = runAttachmentMigration(repoos.config);
    expect(result.errors).toEqual([]);
    expect(result.planned[0]?.action).toBe("verify-only");
    expect(putCalls).toBe(0);
    expect(result.verified).toBe(1);
    expect(local.get(task.id, "shot.png")).toBeNull();
  });

  it("leaves local bytes intact when verification would fail", () => {
    const root = tempRoot();
    const cloud = new Map<string, Map<string, Buffer>>();
    registerStorageProvider("mem-cloud", () => ({
      id: "mem-cloud",
      status: () => ({ available: true }),
      put(namespace, name, data) {
        if (!cloud.has(namespace)) cloud.set(namespace, new Map());
        cloud.get(namespace)!.set(name, Buffer.from(data));
        return {};
      },
      get: () => null,
      list: () => [],
      remove: () => false,
      removeNamespace: () => {},
    }));

    const repoos = createRepoOS(root);
    const task = repoos.createTask({ title: "fail verify" });
    repoos.config.storage = { provider: "mem-cloud" };
    localStorageProvider(join(root, repoos.config.workDir)).put(
      task.id,
      "keep.png",
      Buffer.from(PNG_1PX, "base64"),
    );

    const result = runAttachmentMigration(repoos.config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      localStorageProvider(join(root, repoos.config.workDir)).get(task.id, "keep.png"),
    ).not.toBeNull();
  });
});
