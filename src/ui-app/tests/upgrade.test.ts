/**
 * `repoos upgrade` already fetches the release object GitHub returns for a
 * tag (including its notes body, #0361), but never read or printed it —
 * users saw only the version bump, with no way to know what changed short of
 * going to look at GitHub themselves (#0371).
 */
import { describe, expect, it } from "vitest";
import { releaseNotesToPrint } from "../../commands/upgrade";

describe("releaseNotesToPrint", () => {
  it("returns the trimmed body when notes are present", () => {
    expect(releaseNotesToPrint("  Some real release notes.  \n")).toBe("Some real release notes.");
  });

  it("returns null for an empty body (a release cut with no notes)", () => {
    expect(releaseNotesToPrint("")).toBeNull();
  });

  it("returns null for whitespace-only body", () => {
    expect(releaseNotesToPrint("   \n\t  ")).toBeNull();
  });

  it("returns null when body is null (GitHub's shape for an unset release body)", () => {
    expect(releaseNotesToPrint(null)).toBeNull();
  });

  it("returns null when body is undefined (older cached release shape)", () => {
    expect(releaseNotesToPrint(undefined)).toBeNull();
  });

  it("preserves multi-line markdown content as-is", () => {
    const body = "## Highlights\n\n- Thing one\n- Thing two";
    expect(releaseNotesToPrint(body)).toBe(body);
  });
});
