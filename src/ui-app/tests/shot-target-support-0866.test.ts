/**
 * #0866 — a declared shot must be validated against the target that will
 * render it: an app `state` fixture or app route belongs to the app target, a
 * target that cannot serve the route fails the shot, and a fixture that never
 * rendered is failed evidence rather than a passing screenshot.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PreviewConfig } from "../../core/types";
import {
  buildCapturePlan,
  resolveDeclaredShotTarget,
  validateDeclaredShotTargets,
} from "../../core/shot-plan";
import {
  APP_ROUTE_PREFIXES,
  DEFAULT_PREVIEW_TARGET,
  appPreviewTargetName,
  isAppRoute,
} from "../../core/shot-targets";
import {
  captureShotPage,
  shotRouteNotServedProblem,
  shotStateProblem,
  type ShotDriverPage,
} from "../../core/shot-page";

const PREVIEW: PreviewConfig = {
  command: "bun run dev --port {port}",
  paths: ["src/ui-app/**"],
  targets: [
    {
      name: "Docs site",
      areas: ["docs"],
      paths: ["user-docs/**"],
      command: "bun run dev --port {port}",
    },
  ],
};

const DRAWER_ROUTE = "/work?task=9999&tab=changes";

describe("app target resolution (#0866)", () => {
  it("treats the default command as the app target and its routes as app routes", () => {
    expect(appPreviewTargetName(PREVIEW)).toBe(DEFAULT_PREVIEW_TARGET);
    expect(isAppRoute("/settings?tab=general")).toBe(true);
    expect(isAppRoute("/work?task=9999&tab=changes")).toBe(true);
    expect(isAppRoute("/configuration")).toBe(false);
    // `/` is ambiguous (dashboard vs docs/landing home) — never app-only.
    expect(isAppRoute("/")).toBe(false);
  });

  it("keeps APP_ROUTE_PREFIXES in sync with the UI router", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const router = readFileSync(join(here, "../src/router.ts"), "utf8");
    const routes = [...router.matchAll(/path:\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((path) => path.startsWith("/") && !path.includes(":"))
      .map((path) => path.split(/[?#]/)[0])
      .filter((path) => path !== "/");
    const covered = [...APP_ROUTE_PREFIXES];
    for (const route of new Set(routes)) {
      const isCovered = covered.some(
        (prefix) => route === prefix || route.startsWith(`${prefix}/`),
      );
      expect(isCovered, `router route ${route} is missing from APP_ROUTE_PREFIXES`).toBe(true);
    }
  });

  it("defaults a declared app shot to the app target, not the first resolved target", () => {
    const resolved = resolveDeclaredShotTarget(
      { state: "drawer:shotEvidence", route: DRAWER_ROUTE },
      ["Docs site"],
      { appTarget: DEFAULT_PREVIEW_TARGET },
    );
    expect(resolved).toEqual({ target: DEFAULT_PREVIEW_TARGET, appScoped: true });

    // An app route (no state) gets the same default.
    const routeOnly = resolveDeclaredShotTarget({ route: "/settings" }, ["Docs site"], {
      appTarget: DEFAULT_PREVIEW_TARGET,
    });
    expect(routeOnly).toEqual({ target: DEFAULT_PREVIEW_TARGET, appScoped: true });

    // A docs route keeps the old resolution order.
    const docs = resolveDeclaredShotTarget({ route: "/configuration" }, ["Docs site"], {
      appTarget: DEFAULT_PREVIEW_TARGET,
    });
    expect(docs).toEqual({ target: "Docs site", appScoped: false });
  });

  it("rejects an app state fixture on a target that cannot render it", () => {
    const shot = {
      target: "Docs site",
      route: DRAWER_ROUTE,
      state: "drawer:shotEvidence",
    };
    expect(validateDeclaredShotTargets([shot], PREVIEW)).toEqual([
      expect.stringContaining('state "drawer:shotEvidence" needs the app target'),
    ]);
    const errors = validateDeclaredShotTargets([shot], PREVIEW);
    expect(errors[0]).toContain('resolved to "Docs site"');
    expect(errors[0]).toContain('set "target": "default"');
    expect(errors[0]).toContain(DRAWER_ROUTE);

    const built = buildCapturePlan(["Docs site"], [shot], {
      appTarget: DEFAULT_PREVIEW_TARGET,
    });
    expect(built.entries).toEqual([]);
    expect(built.blockingErrors).toEqual([expect.stringContaining("needs the app target")]);
  });

  it("still captures a correct docs declaration and a correct app state declaration", () => {
    expect(
      validateDeclaredShotTargets([{ target: "Docs site", route: "/configuration" }], PREVIEW),
    ).toEqual([]);

    const built = buildCapturePlan(
      ["Docs site"],
      [
        {
          target: DEFAULT_PREVIEW_TARGET,
          route: DRAWER_ROUTE,
          state: "drawer:shotEvidence",
          label: "Shot evidence drawer",
        },
      ],
      { appTarget: DEFAULT_PREVIEW_TARGET },
    );
    expect(built.errors).toEqual([]);
    expect(built.blockingErrors).toEqual([]);
    expect(built.entries).toEqual([
      expect.objectContaining({
        target: DEFAULT_PREVIEW_TARGET,
        route: DRAWER_ROUTE,
        state: "drawer:shotEvidence",
      }),
    ]);
  });
});

describe("state fixture rendering (#0866)", () => {
  it("fails a state the page never applied, naming the target", () => {
    const problem = shotStateProblem(
      { state: "drawer:shotEvidence", route: "/", target: "Docs site" },
      { appliedState: null, hasDialog: false, hasTaskCard: true },
    );
    expect(problem).toContain('state "drawer:shotEvidence" did not render');
    expect(problem).toContain('target "Docs site"');
  });

  it("fails a drawer fixture applied on a page with no drawer open", () => {
    const problem = shotStateProblem(
      { state: "drawer:shotEvidence", route: "/work", target: DEFAULT_PREVIEW_TARGET },
      { appliedState: "drawer:shotEvidence", hasDialog: false, hasTaskCard: true },
    );
    expect(problem).toContain("has no open drawer/dialog");
    expect(problem).toContain(DRAWER_ROUTE);
  });

  it("passes when the fixture and its container rendered", () => {
    expect(
      shotStateProblem(
        { state: "drawer:shotEvidence", route: DRAWER_ROUTE, target: DEFAULT_PREVIEW_TARGET },
        { appliedState: "drawer:shotEvidence", hasDialog: true, hasTaskCard: true },
      ),
    ).toBeUndefined();
  });

  it("reports a fixture miss through the shared capture choreography", async () => {
    const page = {
      async goto(): Promise<void> {},
      async waitForLoadState(): Promise<void> {},
      async waitForTimeout(): Promise<void> {},
      async setViewportSize(): Promise<void> {},
      locator(): unknown {
        return {};
      },
      async screenshot(): Promise<Buffer> {
        return Buffer.from("png");
      },
      async close(): Promise<void> {},
      async evaluate(): Promise<unknown> {
        return { appliedState: "card:doneError", hasDialog: false, hasTaskCard: false };
      },
    } as unknown as ShotDriverPage;
    const misses: string[] = [];
    await captureShotPage(
      page,
      "http://x/",
      { route: "/", state: "drawer:shotEvidence", target: DEFAULT_PREVIEW_TARGET },
      { waitMs: 0, fullPage: false },
      { onStateMiss: (message) => misses.push(message) },
    );
    expect(misses).toEqual([expect.stringContaining('state "drawer:shotEvidence" did not render')]);
  });
});

describe("route not served by the target (#0866)", () => {
  const MIME =
    'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".';

  it("names the route and target when the target serves an HTML shell for a module", () => {
    const problem = shotRouteNotServedProblem({ route: "/settings", target: "Docs site" }, [
      "some unrelated console error",
      MIME,
    ]);
    expect(problem).toContain('route /settings is not served by target "Docs site"');
    expect(problem).toContain("HTML shell");
    expect(problem).toContain("MIME type");
  });

  it("ignores console errors that are not a module MIME failure", () => {
    expect(
      shotRouteNotServedProblem({ route: "/settings", target: "default" }, [
        "Failed to load resource: the server responded with a status of 404",
      ]),
    ).toBeUndefined();
  });
});
