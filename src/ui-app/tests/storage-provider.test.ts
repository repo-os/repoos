import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localStorageProvider } from "../../core/storage/local";
import {
  createStorageProvider,
  DEFAULT_STORAGE_PROVIDER_ID,
  getStorageProviderFactory,
  listStorageProviderIds,
  registerStorageProvider,
  unregisterStorageProvider,
} from "../../core/storage/registry";
import { createRepoOS } from "../../core/repoos";
import { saveScreenshot, resolveScreenshot, readAttachment } from "../../server/attachments";
import { createInput, listInputs, saveInputAttachment } from "../../core/input";

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-storage-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("localStorageProvider", () => {
  it("stores, reads, lists and removes bytes under .attachments", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    const data = Buffer.from("hello");
    const result = store.put("0001", "note.txt", data);
    expect("error" in result).toBe(false);
    expect(store.get("0001", "note.txt")?.toString()).toBe("hello");
    expect(store.list("0001")).toEqual(["note.txt"]);
    expect(store.size?.("0001", "note.txt")).toBe(5);
    expect(store.localPath?.("0001", "note.txt")).toBe(
      join(base, ".attachments", "0001", "note.txt"),
    );
    expect(store.remove("0001", "note.txt")).toBe(true);
    expect(store.get("0001", "note.txt")).toBeNull();
    expect(store.remove("0001", "note.txt")).toBe(false);
  });

  it("writes exactly where the local behavior expects (base/.attachments/ns/name)", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    store.put("task-9", "screenshot-1.png", Buffer.from(PNG_1PX, "base64"));
    const abs = join(base, ".attachments", "task-9", "screenshot-1.png");
    expect(readFileSync(abs, "base64")).toBe(PNG_1PX);
  });

  it("returns null/[]/false for missing namespaces and objects", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    expect(store.get("nope", "x.png")).toBeNull();
    expect(store.list("nope")).toEqual([]);
    expect(store.remove("nope", "x.png")).toBe(false);
    expect(store.localPath?.("nope", "x.png")).toBeNull();
    expect(store.size?.("nope", "x.png")).toBeNull();
  });

  it("refuses path-traversal names and namespaces", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    for (const bad of ["../evil.png", "sub/evil.png", "..", "."]) {
      const result = store.put("0001", bad, Buffer.from("x"));
      expect("error" in result).toBe(true);
      expect(store.get("0001", bad)).toBeNull();
      expect(store.localPath?.("0001", bad)).toBeNull();
    }
    const escaped = store.put("../outside", "evil.png", Buffer.from("x"));
    expect("error" in escaped).toBe(true);
  });

  it("removeNamespace clears the whole namespace and is idempotent", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    store.put("a", "one.png", Buffer.from("1"));
    store.put("a", "two.png", Buffer.from("2"));
    expect(store.list("a").sort()).toEqual(["one.png", "two.png"]);
    store.removeNamespace("a");
    expect(store.list("a")).toEqual([]);
    expect(() => store.removeNamespace("a")).not.toThrow();
  });

  it("allows an empty object (an attachment can legitimately be zero bytes)", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    const result = store.put("0001", "empty.txt", Buffer.alloc(0));
    expect("error" in result).toBe(false);
    expect(store.get("0001", "empty.txt")?.length).toBe(0);
  });

  it("overwrites an existing object in place", () => {
    const base = tempRoot();
    const store = localStorageProvider(base);
    store.put("0001", "shot.png", Buffer.from("first"));
    store.put("0001", "shot.png", Buffer.from("second"));
    expect(store.get("0001", "shot.png")?.toString()).toBe("second");
  });
});

describe("storage provider registry", () => {
  it("registers local as the default provider", () => {
    expect(getStorageProviderFactory(DEFAULT_STORAGE_PROVIDER_ID)).toBeTypeOf("function");
    expect(listStorageProviderIds()[0]).toBe(DEFAULT_STORAGE_PROVIDER_ID);
  });

  it("instantiates the requested provider rooted at the given base", () => {
    const base = tempRoot();
    const store = createStorageProvider(base);
    expect(store.id).toBe("local");
    store.put("ns", "f.txt", Buffer.from("x"));
    expect(readFileSync(join(base, ".attachments", "ns", "f.txt"), "utf8")).toBe("x");
  });

  it("falls back to local for an unknown provider id", () => {
    const base = tempRoot();
    const store = createStorageProvider(base, "no-such-provider");
    expect(store.id).toBe("local");
  });

  it("lets a later provider register and be selected by id", () => {
    const calls: string[] = [];
    registerStorageProvider("fake-cloud", (base) => {
      calls.push(base);
      return {
        id: "fake-cloud",
        put: () => ({ error: "not implemented" }),
        get: () => null,
        list: () => [],
        remove: () => false,
        removeNamespace: () => {},
      };
    });
    const store = createStorageProvider("/tmp/base", "fake-cloud");
    expect(store.id).toBe("fake-cloud");
    expect(calls).toEqual(["/tmp/base"]);
    expect(listStorageProviderIds()).toEqual(["local", "fake-cloud"]);
    // Clean up so the shared module registry is not polluted for other tests.
    unregisterStorageProvider("fake-cloud");
    expect(listStorageProviderIds()).toEqual(["local"]);
  });
});

describe("task and input attachments use the provider with unchanged behavior", () => {
  it("stores a task screenshot at the same path and serves the same bytes", () => {
    const root = tempRoot();
    const repoos = createRepoOS(root);
    const task = repoos.createTask({ title: "provider shot" });
    const saved = saveScreenshot(repoos.config, task, {
      name: "bug.png",
      mime: "image/png",
      data: PNG_1PX,
    });
    expect("error" in saved).toBe(false);
    expect(resolveScreenshot(repoos.config, task.id, "screenshot-1.png")).toBe(
      join(root, "work", ".attachments", task.id, "screenshot-1.png"),
    );
    const served = readAttachment(repoos.config, task.id, "screenshot-1.png");
    expect(served?.mime).toBe("image/png");
    expect(served?.data.toString("base64")).toBe(PNG_1PX);
    // Traversal and misses still resolve to null.
    expect(readAttachment(repoos.config, task.id, "..%2F..%2Frepoos.toml")).toBeNull();
    expect(readAttachment(repoos.config, task.id, "missing.png")).toBeNull();
  });

  it("lists and reads input attachments identically", () => {
    const root = tempRoot();
    const repoos = createRepoOS(root);
    const input = createInput(repoos.config, "Bug repro", "bug", "human");
    saveInputAttachment(repoos.config, input.id, "dark.png", PNG_1PX);
    const listed = listInputs(repoos.config).find((i) => i.id === input.id)!;
    expect(listed.attachments.map((a) => a.name)).toEqual(["dark.png"]);
    expect(listed.attachments[0]?.mime).toBe("image/png");
    expect(listed.attachments[0]?.size).toBe(Buffer.from(PNG_1PX, "base64").length);
    expect(readFileSync(join(root, "inputs", ".attachments", input.id, "dark.png"), "base64")).toBe(
      PNG_1PX,
    );
  });
});
