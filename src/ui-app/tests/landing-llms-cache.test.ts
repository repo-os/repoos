// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import worker, { AGENT_TEXT_CACHE_CONTROL, type LandingEnv } from "../../../landing/worker.js";

// 2026-10-21: repoos.org/llms.txt kept returning a cached 404 for hours after
// a deploy. A miss must never be cacheable; a hit is cached briefly.
function env(status: number): LandingEnv {
  return {
    ASSETS: {
      fetch: vi.fn(
        async () =>
          new Response(status === 200 ? "# RepoOS" : "not found", {
            status,
            headers: { "Cache-Control": "public, max-age=14400" },
          }),
      ),
    },
  };
}

describe("landing llms.txt caching", () => {
  it.each(["/llms.txt", "/llms-full.txt"])(
    "serves %s with a short revalidated cache",
    async (path) => {
      const res = await worker.fetch(new Request(`https://repoos.org${path}`), env(200));
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe(AGENT_TEXT_CACHE_CONTROL);
      expect(await res.text()).toBe("# RepoOS");
    },
  );

  it("never lets a 404 for llms.txt be cached", async () => {
    const res = await worker.fetch(new Request("https://repoos.org/llms.txt"), env(404));
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("routes llms*.txt through the worker, and docs set a short cache", () => {
    const wrangler = readFileSync(
      new URL("../../../landing/wrangler.jsonc", import.meta.url),
      "utf8",
    );
    expect(wrangler).toMatch(/"run_worker_first": \[[^\]]*"\/llms\.txt", "\/llms-full\.txt"\]/);
    const headers = readFileSync(
      new URL("../../../user-docs/public/_headers", import.meta.url),
      "utf8",
    );
    expect(headers).toMatch(/\/llms\.txt\n\s+Cache-Control: public, max-age=300, must-revalidate/);
    expect(headers).toMatch(
      /\/llms-full\.txt\n\s+Cache-Control: public, max-age=300, must-revalidate/,
    );
  });
});
