/**
 * Unit tests for the shared `api()` fetch wrapper, focused on the #0313
 * regression: a 200 whose body isn't JSON (e.g. the SPA fallback answering
 * for an API route the running server build doesn't have) used to reject with
 * the raw JSON parser message (`Unexpected token '<'`), which the UI showed
 * verbatim. It must surface a friendly, actionable error instead.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api()", () => {
  it("parses JSON responses as before", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ hello: "world" }) })),
    );
    await expect(api("/x")).resolves.toEqual({ hello: "world" });
  });

  it("keeps server-provided error bodies on non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        statusText: "Bad Gateway",
        json: async () => ({ error: "boom" }),
      })),
    );
    await expect(api("/x")).rejects.toThrow("boom");
  });

  it("throws a friendly message when a 200 body is not valid JSON (SPA fallback answered an API route)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`);
        },
      })),
    );
    const err = (await api("/api/playground/models").catch((e: Error) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("non-JSON");
    expect(err.message).toContain("Rebuild");
    expect(err.message).not.toContain("Unexpected token");
    expect(err.message).not.toContain("<!DOCTYPE");
  });
});
