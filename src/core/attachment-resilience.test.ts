import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "./repoos.js";
import {
  ATTACHMENT_NO_LOCAL_READ_FALLBACK_ENV,
  attachmentCloudDelivery,
  createResilientAttachmentProvider,
  readWithLocalOriginalFallback,
  taskAttachmentCloudStates,
} from "./attachment-resilience.js";
import { localStorageProvider } from "./storage/local.js";
import {
  registerStorageProvider,
  unregisterStorageProvider,
} from "./storage/index.js";
import { resolveTaskAttachmentReference, taskAttachmentApiPath } from "./attachment-reference.js";
import { readAttachment, saveScreenshot } from "../server/attachments.js";
import type { StorageProvider } from "./storage/types.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-att-outage-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  delete process.env[ATTACHMENT_NO_LOCAL_READ_FALLBACK_ENV];
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function downCloudProvider(id = "fake-cloud-down"): StorageProvider {
  return {
    id,
    status: () => ({ available: true }),
    put: () => ({ error: "cloud unreachable" }),
    get: () => null,
    list: () => [],
    remove: () => false,
    removeNamespace: () => {},
  };
}

describe("attachment outage read fallback (#0666)", () => {
  it("serves the local original when cloud get misses (simulated Neon down)", () => {
    const base = tempRoot();
    const local = localStorageProvider(base);
    const remote = downCloudProvider();
    local.put("0666", "att_test.png", Buffer.from(PNG_1PX, "base64"));
    const data = readWithLocalOriginalFallback(remote, local, "0666", "att_test.png");
    expect(data?.toString("base64")).toBe(PNG_1PX);
  });

  it("negative: disabling the local fallback breaks serve when cloud is down", () => {
    const base = tempRoot();
    const local = localStorageProvider(base);
    const remote = downCloudProvider();
    local.put("0666", "att_test.png", Buffer.from("x"));
    expect(readWithLocalOriginalFallback(remote, local, "0666", "att_test.png")).not.toBeNull();
    process.env[ATTACHMENT_NO_LOCAL_READ_FALLBACK_ENV] = "1";
    expect(readWithLocalOriginalFallback(remote, local, "0666", "att_test.png")).toBeNull();
  });

  it("resolves task attachments through the resilient provider after a failed cloud put", () => {
    const root = tempRoot();
    registerStorageProvider("fake-cloud-down", () => downCloudProvider());
    try {
      const repoos = createRepoOS(root);
      repoos.config.storage = { provider: "fake-cloud-down" };
      const task = repoos.createTask({ title: "outage" });
      const saved = saveScreenshot(repoos.config, task, {
        name: "bug.png",
        mime: "image/png",
        data: PNG_1PX,
      });
      expect("error" in saved).toBe(false);
      const objectName = decodeURIComponent((saved as { url: string }).url.split("/").pop()!);
      const served = readAttachment(repoos.config, task.id, objectName);
      expect(served?.data.toString("base64")).toBe(PNG_1PX);
      expect(attachmentCloudDelivery(repoos.config, "work", task.id, objectName)).toBe("pending");
    } finally {
      unregisterStorageProvider("fake-cloud-down");
    }
  });

  it("keeps the same Markdown reference resolvable across a local ↔ cloud mode switch", () => {
    const root = tempRoot();
    registerStorageProvider("fake-cloud-down", () => downCloudProvider());
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "switch" });
      const objectName = "att_mode.png";
      localStorageProvider(join(root, "work")).put(
        task.id,
        objectName,
        Buffer.from(PNG_1PX, "base64"),
      );
      const path = taskAttachmentApiPath(task.id, objectName);
      const md = `![bug](${path})\n`;

      repoos.config.storage = { provider: "local" };
      expect(resolveTaskAttachmentReference(repoos.config, task.id, objectName)?.data.length).toBe(
        Buffer.from(PNG_1PX, "base64").length,
      );

      repoos.config.storage = { provider: "fake-cloud-down" };
      expect(resolveTaskAttachmentReference(repoos.config, task.id, objectName)?.data.length).toBe(
        Buffer.from(PNG_1PX, "base64").length,
      );

      const states = taskAttachmentCloudStates(repoos.config, task.id, md);
      expect(states[objectName]).toBe("pending");
    } finally {
      unregisterStorageProvider("fake-cloud-down");
    }
  });

  it("never deletes the local original via resilient remove()", () => {
    const base = tempRoot();
    registerStorageProvider("fake-cloud-down", () => downCloudProvider());
    try {
      const store = createResilientAttachmentProvider(base, "fake-cloud-down");
      store.put("1", "keep.png", Buffer.from("local"));
      store.remove("1", "keep.png");
      expect(localStorageProvider(base).get("1", "keep.png")?.toString()).toBe("local");
    } finally {
      unregisterStorageProvider("fake-cloud-down");
    }
  });
});
