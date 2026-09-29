/**
 * #0582 — the loopback CLI token that lets `repoos shot` reach an
 * auth-enabled server without a browser session.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isLoopbackAddress,
  localCliTokenPath,
  localTokenMatches,
  readLocalCliToken,
  writeLocalCliToken,
} from "../../server/local-token";

describe("local CLI token (#0582)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  it("writes a token the CLI can read back", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-local-token-"));
    temps.push(root);
    const written = writeLocalCliToken(root, ".repoos");
    expect(written).toMatch(/^[0-9a-f]{64}$/);
    expect(readLocalCliToken(root, ".repoos")).toBe(written);
    expect(localCliTokenPath(root, ".repoos")).toBe(join(root, ".repoos", "local-cli-token"));
  });

  it("returns null before any token exists", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-local-token-"));
    temps.push(root);
    expect(readLocalCliToken(root, ".repoos")).toBeNull();
  });

  it("compares tokens exactly and never matches a missing side", () => {
    expect(localTokenMatches("abc", "abc")).toBe(true);
    expect(localTokenMatches("abc", "abd")).toBe(false);
    expect(localTokenMatches("abc", null)).toBe(false);
    expect(localTokenMatches(undefined, "abc")).toBe(false);
    // Length differences must not throw in timingSafeEqual.
    expect(localTokenMatches("ab", "abcd")).toBe(false);
  });

  it("only trusts loopback peer addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("10.0.0.5")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});
