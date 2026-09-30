/**
 * #0582 — `repoos shot` target resolution, the area/target mismatch warning,
 * and the gitignored shot storage. The CLI itself needs a live server and a
 * browser; the pure pieces it depends on are what these tests pin down.
 */
import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, parsePreviewConfig } from "../../core/config";
import { changedPathsVsBase } from "../../core/git";
import {
  formatTargetList,
  matchGlob,
  resolveShotTargets,
  shotTargetMismatchWarning,
  splitAreas,
  targetsForArea,
  targetsForPaths,
} from "../../core/shot-targets";
import { localShotStore, shotsDir } from "../../server/shots";
import { isShotCaptureUnavailable, parseShotArgs } from "../../commands/shot";
import type { PreviewConfig } from "../../core/types";

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PREVIEW: PreviewConfig = {
  command: "bun run dev --port {port}",
  targets: [
    { name: "Docs site", areas: ["docs"], paths: ["user-docs/**"], command: "bun dev" },
    { name: "Landing page", areas: ["landing"], paths: ["landing/**"], command: "bun dev" },
    { name: "Web app", areas: ["web"], command: "bun dev" },
  ],
};

describe("splitAreas", () => {
  it("splits multi-area values on + and , (the `web + core + server` case)", () => {
    expect(splitAreas("web + core + server")).toEqual(["web", "core", "server"]);
    expect(splitAreas("Docs, landing")).toEqual(["docs", "landing"]);
  });

  it("trims, lowercases, de-duplicates, and handles empty input", () => {
    expect(splitAreas("  Web ,WEB, web ")).toEqual(["web"]);
    expect(splitAreas("")).toEqual([]);
    expect(splitAreas(null)).toEqual([]);
  });

  it("delegates to the canonical parser — a `+` without spaces is one value (#0587)", () => {
    // The old local `/[+,]/` splitter broke "c++"; consuming `parseTaskAreas`
    // keeps preview routing and the board agreeing on the same rule.
    expect(splitAreas("c++")).toEqual(["c++"]);
    expect(splitAreas("server+ui-app")).toEqual(["server+ui-app"]);
  });
});

describe("glob matching", () => {
  it("matches within a segment and across segments", () => {
    expect(matchGlob("landing/**", "landing/index.md")).toBe(true);
    expect(matchGlob("landing/**", "landing/src/app.ts")).toBe(true);
    expect(matchGlob("landing/**", "user-docs/index.md")).toBe(false);
    expect(matchGlob("src/*.ts", "src/app.ts")).toBe(true);
    expect(matchGlob("src/*.ts", "src/nested/app.ts")).toBe(false);
    expect(matchGlob("**/*.md", "README.md")).toBe(true);
    expect(matchGlob("**/*.md", "docs/a/b.md")).toBe(true);
    expect(matchGlob("a?c", "abc")).toBe(true);
    expect(matchGlob("a?c", "a/c")).toBe(false);
  });
});

describe("targetsForPaths", () => {
  it("returns every target whose globs match, in config order (multi-target diff)", () => {
    const changed = ["user-docs/index.md", "landing/src/hero.tsx", "src/other.ts"];
    expect(targetsForPaths(PREVIEW, changed)).toEqual(["Docs site", "Landing page"]);
  });

  it("never matches a target with no `paths`", () => {
    expect(targetsForPaths(PREVIEW, ["landing/index.html"])).toEqual(["Landing page"]);
    expect(targetsForPaths(PREVIEW, ["src/app.ts"])).toEqual([]);
  });
});

describe("resolveShotTargets", () => {
  it("prefers changed-path matches over the task's area", () => {
    const r = resolveShotTargets(PREVIEW, "web", ["user-docs/index.md"]);
    expect(r.names).toEqual(["Docs site"]);
    expect(r.source).toBe("paths");
    expect(r.detected).toEqual(["Docs site"]);
  });

  it("falls back to area resolution when nothing matches", () => {
    const r = resolveShotTargets(PREVIEW, "landing", ["src/app.ts"]);
    expect(r.names).toEqual(["Landing page"]);
    expect(r.source).toBe("area");
  });

  it("falls back to the default command for an unmatched area", () => {
    const r = resolveShotTargets(PREVIEW, "core", ["src/app.ts"]);
    expect(r.names).toEqual(["default"]);
    expect(r.source).toBe("default");
  });

  it("lets --target override path and area resolution", () => {
    const r = resolveShotTargets(PREVIEW, "web", ["user-docs/index.md"], "Web app");
    expect(r.names).toEqual(["Web app"]);
    expect(r.source).toBe("target");
    // The detected set is still reported for diagnostics.
    expect(r.detected).toEqual(["Docs site"]);
  });

  it("reports an unknown --target instead of silently falling back", () => {
    const r = resolveShotTargets(PREVIEW, "web", [], "Nope");
    expect(r.names).toEqual([]);
    expect(r.source).toBe("none");
    expect(r.unknownTarget).toBe("Nope");
  });

  it("returns none with a reason when nothing resolves at all", () => {
    const r = resolveShotTargets({ targets: [] }, "web", ["src/app.ts"]);
    expect(r.names).toEqual([]);
    expect(r.source).toBe("none");
    expect(r.reason).toMatch(/no preview target/i);
  });
});

describe("targetsForArea", () => {
  it("matches any element of a multi-area value", () => {
    expect(targetsForArea(PREVIEW, "web + docs")).toEqual(["Docs site", "Web app"]);
  });
});

describe("shotTargetMismatchWarning", () => {
  it("warns when the diff touches a target the area does not resolve to", () => {
    const warning = shotTargetMismatchWarning(PREVIEW, "web", ["user-docs/index.md"]);
    expect(warning).toBe(`This task's changes touch Docs site but its area is "web".`);
  });

  it("stays quiet when the area already reaches the changed target", () => {
    expect(shotTargetMismatchWarning(PREVIEW, "docs", ["user-docs/index.md"])).toBeUndefined();
    // Multi-area values count too.
    expect(
      shotTargetMismatchWarning(PREVIEW, "web + docs", ["user-docs/index.md"]),
    ).toBeUndefined();
  });

  it("warns about the unexplained target when only some touched targets are area-reachable", () => {
    const warning = shotTargetMismatchWarning(PREVIEW, "web + docs", [
      "user-docs/index.md",
      "landing/index.html",
    ]);
    expect(warning).toBe(`This task's changes touch Landing page but its area is "web + docs".`);
  });

  it("stays quiet when no changed path matches a target", () => {
    expect(shotTargetMismatchWarning(PREVIEW, "web", ["src/app.ts"])).toBeUndefined();
  });
});

// #0594 — the default (main-app) preview target declares its own `paths`, so a
// diff touching app files resolves it and a mixed app+docs diff captures BOTH.
const PREVIEW_WITH_DEFAULT_PATHS: PreviewConfig = {
  command: "bun run dev --port {port}",
  paths: ["src/ui-app/**"],
  targets: [
    { name: "Docs site", areas: ["docs"], paths: ["user-docs/**"], command: "bun dev" },
    { name: "Landing page", areas: ["landing"], paths: ["landing/**"], command: "bun dev" },
  ],
};

describe("the default target's own paths (#0594)", () => {
  it("resolves the default target for a pure app diff", () => {
    expect(targetsForPaths(PREVIEW_WITH_DEFAULT_PATHS, ["src/ui-app/src/Board.vue"])).toEqual([
      "default",
    ]);
    const r = resolveShotTargets(PREVIEW_WITH_DEFAULT_PATHS, "web", ["src/ui-app/src/Board.vue"]);
    expect(r.names).toEqual(["default"]);
    expect(r.source).toBe("paths");
  });

  it("resolves every matching target on a mixed app + docs diff", () => {
    const changed = [
      "src/ui-app/src/components/TaskDrawer.vue",
      "src/ui-app/src/style.css",
      "user-docs/check.md",
    ];
    expect(targetsForPaths(PREVIEW_WITH_DEFAULT_PATHS, changed)).toEqual(["Docs site", "default"]);
    const r = resolveShotTargets(PREVIEW_WITH_DEFAULT_PATHS, "web", changed);
    expect(r.names).toEqual(["Docs site", "default"]);
    expect(r.source).toBe("paths");
  });

  it("matches top-level paths across every segment, like target paths", () => {
    expect(targetsForPaths(PREVIEW_WITH_DEFAULT_PATHS, ["src/ui-app/a/b/c.vue"])).toEqual([
      "default",
    ]);
  });

  it("does NOT pull the default in for files that match nothing (no implicit map)", () => {
    // A work/*.md-only diff is not evidence about the UI — the default
    // participates only when the repo explicitly declared its globs.
    expect(targetsForPaths(PREVIEW_WITH_DEFAULT_PATHS, ["work/0599-x.md"])).toEqual([]);
    expect(targetsForPaths(PREVIEW_WITH_DEFAULT_PATHS, ["src/server/agents.ts"])).toEqual([]);
    // And without a default command there is nothing to map to anyway.
    expect(
      targetsForPaths({ targets: PREVIEW_WITH_DEFAULT_PATHS.targets, paths: ["src/ui-app/**"] }, [
        "src/ui-app/x.vue",
      ]),
    ).toEqual([]);
  });

  it("never mislabels the always-reachable default as an area mismatch", () => {
    const warning = shotTargetMismatchWarning(PREVIEW_WITH_DEFAULT_PATHS, "web", [
      "src/ui-app/src/Board.vue",
      "user-docs/check.md",
    ]);
    expect(warning).toBe(`This task's changes touch Docs site but its area is "web".`);
  });
});

describe("formatTargetList", () => {
  it("reads naturally for one, two, and many", () => {
    expect(formatTargetList([])).toBe("(none)");
    expect(formatTargetList(["Docs"])).toBe("Docs");
    expect(formatTargetList(["Docs", "Landing"])).toBe("Docs and Landing");
    expect(formatTargetList(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("parsePreviewConfig paths", () => {
  it("reads a target's paths globs (array or single string) and drops empties", () => {
    const parsed = parsePreviewConfig({
      "preview.targets": [
        { name: "Docs", areas: ["docs"], paths: ["user-docs/**"], command: "bun dev" },
        { name: "Landing", areas: ["landing"], paths: "landing/**", command: "bun dev" },
      ],
    });
    expect(parsed?.targets?.[0]?.paths).toEqual(["user-docs/**"]);
    expect(parsed?.targets?.[1]?.paths).toEqual(["landing/**"]);
  });

  it("omits paths when absent, keeping a target without globs unchanged", () => {
    const parsed = parsePreviewConfig({
      "preview.targets": [{ name: "Web", areas: ["web"], command: "bun dev" }],
    });
    expect(parsed?.targets?.[0]).not.toHaveProperty("paths");
  });
});

describe("shot argument parsing", () => {
  it("parses a route and flags, defaulting --base and --wait", () => {
    const opts = parseShotArgs(["/repo", "--target", "Docs site", "--selector", ".x"]);
    expect(opts.error).toBeUndefined();
    expect(opts.route).toBe("/repo");
    expect(opts.target).toBe("Docs site");
    expect(opts.selector).toBe(".x");
    expect(opts.base).toBe("main");
    expect(opts.waitMs).toBeGreaterThan(0);
  });

  it("rejects unknown flags instead of treating the next arg as a route", () => {
    expect(parseShotArgs(["--taget", "X"]).error).toMatch(/unknown flag/);
  });

  it("rejects a flag with no value and a malformed --viewport/--wait", () => {
    expect(parseShotArgs(["--target"]).error).toMatch(/requires a value/);
    expect(parseShotArgs(["--viewport", "wide"]).error).toMatch(/WIDTHxHEIGHT/);
    expect(parseShotArgs(["--wait", "soon"]).error).toMatch(/milliseconds/);
  });

  it("returns help for -h/--help", () => {
    expect(parseShotArgs(["--help"]).help).toBe(true);
    expect(parseShotArgs(["-h"]).help).toBe(true);
  });
});

describe("missing browser (Playwright is optional)", () => {
  it("classifies a missing Playwright/WebKit as a clean skip, not a crash", () => {
    expect(isShotCaptureUnavailable(new Error("Cannot find module @playwright/test"))).toBe(true);
    expect(isShotCaptureUnavailable(new Error("@playwright/test (not installed)"))).toBe(true);
    expect(isShotCaptureUnavailable(new Error("Executable doesn't exist at /webkit/firefox"))).toBe(
      true,
    );
    expect(isShotCaptureUnavailable(new Error("browserType.launch: boom"))).toBe(true);
    expect(isShotCaptureUnavailable(new Error("Timeout 30000ms exceeded navigating"))).toBe(false);
  });
});

describe("changedPathsVsBase", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-diff-"));
    temps.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    git("branch", "-M", "main");
    writeFileSync(join(root, "a.txt"), "a\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    return root;
  }

  it("returns null for a base ref that is not a commit (no silent empty diff)", () => {
    expect(changedPathsVsBase(repo(), "no-such-branch")).toBeNull();
  });

  it("includes committed, unstaged, and untracked changes vs the base", () => {
    const root = repo();
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("checkout", "-q", "-b", "feat/x");
    writeFileSync(join(root, "b.txt"), "b\n");
    git("add", "b.txt");
    git("commit", "-q", "-m", "b");
    writeFileSync(join(root, "a.txt"), "a2\n"); // unstaged
    writeFileSync(join(root, "c.txt"), "c\n"); // untracked
    const paths = changedPathsVsBase(root, "main") ?? [];
    expect(paths).toContain("b.txt");
    expect(paths).toContain("a.txt");
    expect(paths).toContain("c.txt");
  });
});

describe("localShotStore storage (never in git)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  function makeRepo(): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-store-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "work/.attachments/\nnode_modules/\n");
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    git("add", ".gitignore");
    git("commit", "-q", "-m", "init");
    return root;
  }

  it("writes under work/.attachments/<id>/shots and lists the target", () => {
    const root = makeRepo();
    const config = loadConfig(root);
    const store = localShotStore(config, "0582");
    const saved = store.save({ target: "Docs site", route: "/", data: PNG_1PX, mime: "image/png" });
    expect("error" in saved).toBe(false);
    if ("error" in saved) return;
    expect(saved.path.startsWith("work/.attachments/0582/shots/")).toBe(true);
    expect(saved.target).toBe("Docs site");
    expect(shotsDir(root, "work", "0582")).toBe(
      join(root, "work", ".attachments", "0582", "shots"),
    );

    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].target).toBe("Docs site");
    expect(listed[0].route).toBe("/");
    expect(store.resolve(listed[0].name)).not.toBeNull();
  });

  it("does not show the captured shot in git status", () => {
    const root = makeRepo();
    const config = loadConfig(root);
    localShotStore(config, "0582").save({
      target: "Landing page",
      data: PNG_1PX,
      mime: "image/png",
    });
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(status).toBe("");
  });

  it("rejects non-image data and refuses to resolve outside the shots folder", () => {
    const root = makeRepo();
    const config = loadConfig(root);
    const store = localShotStore(config, "0582");
    expect(store.save({ target: "x", data: "", mime: "image/png" })).toEqual({
      error: "base64 image data is required",
    });
    expect(store.save({ target: "x", data: PNG_1PX, mime: "text/plain" })).toHaveProperty("error");
    expect(store.resolve("../../../../etc/passwd")).toBeNull();
  });
});
