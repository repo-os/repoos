import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../src/lib/random-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "fixed" });
    expect(randomId()).toBe("fixed");
  });

  it("falls back in insecure contexts where randomUUID is undefined", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(randomId()).toMatch(UUID);
  });

  it("falls back when crypto is missing entirely", () => {
    vi.stubGlobal("crypto", undefined);
    expect(randomId()).toMatch(UUID);
  });
});
