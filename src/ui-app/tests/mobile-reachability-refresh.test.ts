import { describe, expect, it } from "vitest";
import { validateServer } from "../../../mobile/src/reachability";

describe("Hub refresh reachability outcomes", () => {
  it("turns a timed out health request into an unreachable result", async () => {
    const result = await validateServer(
      "https://slow.example",
      5,
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("didn't answer within 0 seconds");
  });

  it("keeps an all-unreachable refresh outcome explicit per server", async () => {
    const results = await Promise.all(
      ["https://one.example", "https://two.example"].map((url) =>
        validateServer(url, 1, async () => new Response(null, { status: 503 })),
      ),
    );

    expect(results).toHaveLength(2);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results.every((result) => result.error?.includes("HTTP 503"))).toBe(true);
  });
});
