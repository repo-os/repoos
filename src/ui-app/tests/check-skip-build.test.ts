import { describe, expect, it } from "vitest";
import { skipBuildAction } from "../../commands/check.js";

/**
 * The "Full build" skip guard (#0213). Standalone `repoos check` never sets
 * REPOOS_SKIP_BUILD and must always build — that path is agents' definition-of-
 * done gate. Only the close-out pipeline sets it after running `bun run build`
 * itself, and even then the skip must never apply when dist is missing or
 * stale (buildFresh=false), or the UI smoke test could probe a bad build.
 */
describe("skipBuildAction — repoos check's Full-build step", () => {
  it("standalone (env unset) always builds, even on a fresh build", () => {
    expect(skipBuildAction({}, true)).toBe("build");
  });

  it("standalone (env unset) builds when dist is stale or missing", () => {
    expect(skipBuildAction({}, false)).toBe("build");
  });

  it('only the exact value "1" enables the skip path', () => {
    expect(skipBuildAction({ REPOOS_SKIP_BUILD: "1" }, true)).toBe("skip");
    expect(skipBuildAction({ REPOOS_SKIP_BUILD: "0" }, true)).toBe("build");
    expect(skipBuildAction({ REPOOS_SKIP_BUILD: "true" }, true)).toBe("build");
    expect(skipBuildAction({ REPOOS_SKIP_BUILD: "" }, true)).toBe("build");
  });

  it("REPOOS_SKIP_BUILD=1 with a verified-fresh build skips", () => {
    expect(skipBuildAction({ REPOOS_SKIP_BUILD: "1" }, true)).toBe("skip");
  });

  it("REPOOS_SKIP_BUILD=1 never skips when the build is NOT fresh — builds anyway", () => {
    // The staleness check above said dist is missing/stale. Skipping here would
    // let the UI smoke test probe an old or absent dist, so the guard must
    // still build — the close-out's skip is only valid because it JUST built.
    expect(skipBuildAction({ REPOOS_SKIP_BUILD: "1" }, false)).toBe("build-not-fresh");
  });
});
