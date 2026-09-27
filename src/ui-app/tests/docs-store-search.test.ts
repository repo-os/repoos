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
