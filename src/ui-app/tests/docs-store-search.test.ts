import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useDocsStore } from "../src/stores/docs";
import { searchAll, searchContext } from "../src/search";

const api = vi.spyOn(apiMod, "api");

describe("docs store search index (#0557)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "# Brand new topic\n\nDetails here.",
      })),
    );
  });

  it("exposes docs loading failures and clears them after a successful retry", async () => {
    const docs = useDocsStore();
    api.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);

    expect(await docs.loadDocs()).toBe(false);
    expect(docs.docsLoading).toBe(false);
    expect(docs.docsLoadError).toContain("Could not load docs");

    expect(await docs.loadDocs()).toBe(true);
    expect(docs.docsLoadError).toBe("");
    expect(docs.docs).toEqual([]);
  });

  it("keeps the latest docs refresh authoritative while requests overlap", async () => {
    const docs = useDocsStore();
    let resolveOlder!: (value: unknown) => void;
    let resolveNewer!: (value: unknown) => void;
    const older = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    const newer = new Promise((resolve) => {
      resolveNewer = resolve;
    });
    api
      .mockReturnValueOnce(older as ReturnType<typeof apiMod.api>)
      .mockReturnValueOnce(newer as ReturnType<typeof apiMod.api>);

    const olderLoad = docs.loadDocs();
    const newerLoad = docs.loadDocs();
    resolveOlder([{ path: "docs/old.md", title: "Old", mtimeMs: 1 }]);
    await Promise.resolve();
    expect(docs.docsLoading).toBe(true);
    expect(docs.docs).toEqual([]);

    resolveNewer([{ path: "docs/new.md", title: "New", mtimeMs: 2 }]);
    await expect(newerLoad).resolves.toBe(true);
    await expect(olderLoad).resolves.toBe(true);
    expect(docs.docsLoading).toBe(false);
    expect(docs.docs.map((doc) => doc.path)).toEqual(["docs/new.md"]);
  });

  it("ignores a stale docs failure after a newer refresh succeeds", async () => {
    const docs = useDocsStore();
    let rejectOlder!: (reason: Error) => void;
    let resolveNewer!: (value: unknown) => void;
    const older = new Promise((_, reject) => {
      rejectOlder = reject;
    });
    const newer = new Promise((resolve) => {
      resolveNewer = resolve;
    });
    api
      .mockReturnValueOnce(older as ReturnType<typeof apiMod.api>)
      .mockReturnValueOnce(newer as ReturnType<typeof apiMod.api>);

    const olderLoad = docs.loadDocs();
    const newerLoad = docs.loadDocs();
    resolveNewer([]);
    await expect(newerLoad).resolves.toBe(true);
    rejectOlder(new Error("late failure"));
    await expect(olderLoad).resolves.toBe(true);

    expect(docs.docsLoading).toBe(false);
    expect(docs.docsLoadError).toBe("");
    expect(docs.docs).toEqual([]);
  });

  it("does not let an older preview fetch overwrite the document selected by a newer listing", async () => {
    const docs = useDocsStore();
    let resolveOlderList!: (value: unknown) => void;
    let resolveNewerList!: (value: unknown) => void;
    let resolveOldContent!: (value: { ok: boolean; text: () => Promise<string> }) => void;
    let resolveNewContent!: (value: { ok: boolean; text: () => Promise<string> }) => void;
    const olderList = new Promise((resolve) => {
      resolveOlderList = resolve;
    });
    const newerList = new Promise((resolve) => {
      resolveNewerList = resolve;
    });
    const oldContent = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
      resolveOldContent = resolve;
    });
    const newContent = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
      resolveNewContent = resolve;
    });
    api
      .mockReturnValueOnce(olderList as ReturnType<typeof apiMod.api>)
      .mockReturnValueOnce(newerList as ReturnType<typeof apiMod.api>);
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) => (path === "docs/old.md" ? oldContent : newContent)),
    );

    const olderLoad = docs.loadDocs();
    resolveOlderList([{ path: "docs/old.md", title: "Old", mtimeMs: 1 }]);
    await Promise.resolve();
    const newerLoad = docs.loadDocs();
    resolveNewerList([{ path: "docs/new.md", title: "New", mtimeMs: 2 }]);
    await Promise.resolve();

    resolveNewContent({ ok: true, text: async () => "# New document" });
    await expect(newerLoad).resolves.toBe(true);
    resolveOldContent({ ok: true, text: async () => "# Old document" });
    await expect(olderLoad).resolves.toBe(true);

    expect(docs.selDoc).toBe("docs/new.md");
    expect(docs.docTitle).toBe("New");
    expect(docs.docContent).toBe("# New document");
  });

  it("syncDocAfterCreate indexes a path when the listing API omits it", async () => {
    const docs = useDocsStore();
    docs.docs = [{ path: "docs/existing.md", title: "Existing", mtimeMs: 1 }];
    api.mockResolvedValueOnce([]);

    await docs.syncDocAfterCreate("docs/brand-new.md");

    expect(docs.docs.some((d) => d.path === "docs/brand-new.md")).toBe(true);
    const global = searchAll("brand new", {
      tasks: [],
      docs: docs.docs,
      fields: [],
    });
    expect(global.some((r) => r.kind === "doc" && r.path === "docs/brand-new.md")).toBe(true);
    const scoped = searchContext("brand new", { docs: docs.docs, skills: [] });
    expect(scoped.results.some((r) => r.kind === "doc" && r.path === "docs/brand-new.md")).toBe(
      true,
    );
  });
});
