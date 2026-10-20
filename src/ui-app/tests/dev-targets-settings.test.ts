/**
 * #0749 — the Settings control for `[[dev.targets]]`.
 *
 * Covers the config PATCH path the control writes through: validation is
 * delegated to the loader's `parseDevTargets` (never duplicated), a valid list
 * round-trips as `[[dev.targets]]` rows, a conflicting field is a 400 with the
 * parser's own message, reordering is preserved, clearing the last target drops
 * the blocks, and an unchanged list is a no-op that never churns the file.
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { patchConfig, safeConfigForBrowser } from "../../server/routes/config.js";
import {
  devTargetError,
  devTargetsErrors,
  draftFromTarget,
  emptyDevTargetDraft,
  targetFromDraft,
} from "../src/lib/dev-targets.js";

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: {
    statusCode?: number;
    payload?: string;
    writeHead(code: number): unknown;
    end(payload: string): void;
  } = {
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string) {
      res.payload = payload;
    },
  };
  const cfg = loadConfig(root);
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
    logger: { system() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
}

function repo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-dev-settings-"));
  writeFileSync(join(root, "repoos.toml"), toml);
  return root;
}

const WEB = {
  name: "web",
  kind: "server",
  command: "bun run dev",
  url: "http://localhost:5173",
  healthCheckUrl: "http://localhost:5173/health",
};

const APK = {
  name: "apk",
  kind: "artifact",
  command: "bun run build:android",
  artifactPath: "dist/app-debug.apk",
  label: "Debug APK",
};

const PROCESS = {
  name: "divot",
  kind: "process",
  command: "swift run --package-path macos divot",
  label: "Divot bar",
};

describe("Settings control contract for [[dev.targets]] (#0749)", () => {
  it("exposes the dev.targets key in the schema so search can find its UI row", () => {
    expect(getConfigSchema().some((f) => f.key === "dev.targets")).toBe(true);
    // Parser-only keys stay documented alongside it (docs-drift guard).
    expect(SUPPORTED_TOML_KEYS).toContain("dev.targets.name");
  });

  it("writes a valid list as [[dev.targets]] rows the loader reads back", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { devTargets: [WEB, APK] });
      expect(res.status).toBe(200);
      const cfg = loadConfig(root);
      expect(cfg.dev?.targets).toEqual([
        {
          name: "web",
          kind: "server",
          command: "bun run dev",
          url: "http://localhost:5173",
          healthCheck: { url: "http://localhost:5173/health" },
        },
        {
          name: "apk",
          kind: "artifact",
          command: "bun run build:android",
          artifactPath: "dist/app-debug.apk",
          label: "Debug APK",
        },
      ]);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).toContain("[[dev.targets]]");
      expect(text).toContain('healthCheck.url = "http://localhost:5173/health"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // #0802 — the per-target port setting round-trips, and the default
  // (auto-pick on) stays implicit so an untouched row gains no line.
  it("writes auto-pick off and a fixed port, and reads them back", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { devTargets: [{ ...WEB, autoPort: false, port: 5173 }] });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).toContain("autoPort = false");
      expect(text).toContain("port = 5173");
      const cfg = loadConfig(root);
      expect(cfg.dev?.targets?.[0]).toMatchObject({ autoPort: false, port: 5173 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps auto-pick on implicit and still writes the preferred port", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { devTargets: [{ ...WEB, autoPort: true, port: 5173 }] });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).not.toContain("autoPort");
      expect(text).toContain("port = 5173");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exposes targets (and validation errors) to the browser config", () => {
    const safe = safeConfigForBrowser({
      dev: { targets: [{ name: "web", kind: "server", command: "x", url: "http://x" }] },
      devTargetErrors: ["[dev.targets] web: a command is required"],
    } as never);
    expect(safe.devTargets).toEqual([
      { name: "web", kind: "server", command: "x", url: "http://x" },
    ]);
    expect(safe.devTargetErrors).toEqual(["[dev.targets] web: a command is required"]);
  });

  it("rejects a conflicting field with the parser's own message, inline", async () => {
    const root = repo('workDir = "work"\n');
    try {
      // A url on an artifact is exactly the conflict `parseDevTargets` reports.
      const res = await patch(root, {
        devTargets: [{ ...APK, url: "http://localhost:9999" }],
      });
      expect(res.status).toBe(400);
      expect(String(res.payload.error)).toContain('an "artifact" target cannot have a url');
      expect(res.payload.errors).toEqual([String(res.payload.error)]);
      expect(loadConfig(root).dev?.targets).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a process target (no URL) as a row the loader reads back", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { devTargets: [PROCESS] });
      expect(res.status).toBe(200);
      const cfg = loadConfig(root);
      expect(cfg.dev?.targets).toEqual([
        {
          name: "divot",
          kind: "process",
          command: "swift run --package-path macos divot",
          label: "Divot bar",
        },
      ]);
      expect(cfg.dev?.targets?.[0].url).toBeUndefined();
      expect(cfg.dev?.targets?.[0].artifactPath).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a conflicting url on a process row with the parser's own message", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, {
        devTargets: [{ ...PROCESS, url: "http://localhost:9999" }],
      });
      expect(res.status).toBe(400);
      expect(String(res.payload.error)).toContain('a "process" target cannot have a url');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a missing command with the parser's own message", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, {
        devTargets: [{ name: "web", kind: "server", url: "http://localhost:5173" }],
      });
      expect(res.status).toBe(400);
      expect(String(res.payload.error)).toContain("a command is required");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a non-array payload", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { devTargets: "web" });
      expect(res.status).toBe(400);
      expect(String(res.payload.error)).toContain("must be an array");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves the submitted order (reorder is a real edit)", async () => {
    const root = repo('workDir = "work"\n');
    try {
      await patch(root, { devTargets: [WEB, APK] });
      await patch(root, { devTargets: [APK, WEB] });
      const cfg = loadConfig(root);
      expect(cfg.dev?.targets?.map((t) => t.name)).toEqual(["apk", "web"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("edits an existing row in place", async () => {
    const root = repo(`[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
`);
    try {
      const res = await patch(root, {
        devTargets: [
          { name: "web", kind: "server", command: "bun run serve", url: "http://localhost:8080" },
        ],
      });
      expect(res.status).toBe(200);
      expect(loadConfig(root).dev?.targets).toEqual([
        { name: "web", kind: "server", command: "bun run serve", url: "http://localhost:8080" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clears the last target without a duplicate key", async () => {
    const root = repo(`[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
`);
    try {
      const res = await patch(root, { devTargets: [] });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).not.toContain("[[dev.targets]]");
      expect(loadConfig(root).dev?.targets).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when the list already matches disk", async () => {
    const root = repo(`[[dev.targets]]
name = "web"
kind = "server"
command = "bun run dev"
url = "http://localhost:5173"
`);
    try {
      const before = readFileSync(join(root, "repoos.toml"), "utf8");
      const res = await patch(root, {
        devTargets: [
          { name: "web", kind: "server", command: "bun run dev", url: "http://localhost:5173" },
        ],
      });
      expect(res.status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // #0843 — a target's companion-service name list round-trips through the
  // PATCH and is validated against the declared [[dev.services]] rows.
  it("writes a target's services list and rejects one naming an undeclared service", async () => {
    // The round-trip needs a declared [[dev.services]] row to validate against.
    const root = repo(
      ["[[dev.services]]", 'name = "api"', 'command = "bun --watch src/server/index.ts"', ""].join(
        "\n",
      ),
    );
    try {
      const res = await patch(root, { devTargets: [{ ...WEB, services: ["api"] }] });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).toContain('services = ["api"]');
      const cfg = loadConfig(root);
      expect(cfg.dev?.targets?.[0].services).toEqual(["api"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    // With no [[dev.services]] block, "api" resolves nowhere: a 400.
    const res2 = await patch(root, { devTargets: [{ ...WEB, services: ["api"] }] });
    expect(res2.status).toBe(400);
    expect(String(res2.payload.error)).toContain('unknown service "api"');
  });

  it("is a no-op when a services-holding list already matches disk", async () => {
    const root = repo(
      [
        "[[dev.services]]",
        'name = "api"',
        'command = "bun --watch src/server/index.ts"',
        "",
        "[[dev.targets]]",
        'name = "web"',
        'kind = "server"',
        'services = ["api"]',
        'command = "bun run dev"',
        'url = "http://localhost:5173"',
        "",
      ].join("\n"),
    );
    try {
      const before = readFileSync(join(root, "repoos.toml"), "utf8");
      const res = await patch(root, {
        devTargets: [
          {
            name: "web",
            kind: "server",
            command: "bun run dev",
            url: "http://localhost:5173",
            services: ["api"],
          },
        ],
      });
      expect(res.status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Settings control client-side validation (#0749)", () => {
  it("maps a config row to a draft and back without loss", () => {
    const row = {
      name: "web",
      kind: "server" as const,
      command: "bun run dev",
      url: "http://localhost:5173",
      label: "Web app",
      healthCheck: { url: "http://localhost:5173/health" },
      // #0843: the companion-service name list survives a Settings edit.
      services: ["api", "db"],
    };
    const draft = draftFromTarget(row);
    expect(draft).toEqual({
      name: "web",
      kind: "server",
      command: "bun run dev",
      url: "http://localhost:5173",
      artifactPath: "",
      label: "Web app",
      healthCheckUrl: "http://localhost:5173/health",
      healthCheckFile: "",
      autoPort: true,
      port: "",
      services: "api, db",
      // The on-disk identity the server restores TOML-only fields by (#0843).
      sourceName: "web",
    });
    expect(targetFromDraft(draft)).toMatchObject({
      name: "web",
      url: "http://localhost:5173",
      healthCheckUrl: "http://localhost:5173/health",
      services: ["api", "db"],
    });
    // Whitespace and a trailing comma never leak into the wire row.
    expect(targetFromDraft({ ...draft, services: " api , db, " }).services).toEqual(["api", "db"]);
  });

  it("uses the parser's own message for a bad row (no second copy of the rules)", () => {
    const draft = { ...emptyDevTargetDraft(), name: "apk", kind: "artifact" as const };
    expect(devTargetError(draft)).toContain("a command is required");
  });

  it("reports a conflicting field through the parser", () => {
    const draft = {
      ...emptyDevTargetDraft(),
      name: "apk",
      kind: "artifact" as const,
      command: "bun run build",
      artifactPath: "dist/app.apk",
      url: "http://localhost:9999",
    };
    expect(devTargetError(draft)).toContain('an "artifact" target cannot have a url');
  });

  // #0802 — the auto-pick-off-without-a-port rule is the parser's, surfaced
  // inline in the dialog exactly as the server would report it.
  it("surfaces the auto-pick-off-without-a-port error", () => {
    const draft = {
      ...emptyDevTargetDraft(),
      name: "web",
      kind: "server" as const,
      command: "bun run dev --port {port}",
      url: "http://localhost:{port}",
      autoPort: false,
    };
    expect(devTargetError(draft)).toContain("auto-pick is off but no port is set");
    // Turning auto-pick back on (or setting a port) clears it.
    expect(devTargetError({ ...draft, autoPort: true })).toBeNull();
    expect(devTargetError({ ...draft, port: "5173" })).toBeNull();
  });

  it("accepts a process draft and rejects a health check on one", () => {
    const good = {
      ...emptyDevTargetDraft(),
      name: "divot",
      kind: "process" as const,
      command: "swift run --package-path macos divot",
    };
    expect(devTargetError(good)).toBeNull();
    expect(devTargetError({ ...good, healthCheckFile: "ready.txt" })).toContain(
      'a "process" target cannot have a healthCheck',
    );
  });

  it("flags a duplicate name against a sibling, but not against itself", () => {
    const draft = {
      ...emptyDevTargetDraft(),
      name: "web",
      kind: "server" as const,
      command: "x",
      url: "http://x",
    };
    expect(devTargetError(draft, { takenNames: ["web"], selfName: "web" })).toBeNull();
    expect(devTargetError(draft, { takenNames: ["web", "apk"] })).toContain(
      'duplicate target name "web"',
    );
  });

  it("validates a whole list, naming each offending row", () => {
    const good = {
      ...emptyDevTargetDraft(),
      name: "web",
      kind: "server" as const,
      command: "x",
      url: "http://x",
    };
    const bad = {
      ...emptyDevTargetDraft(),
      name: "",
      kind: "server" as const,
      command: "x",
      url: "http://x",
    };
    const errors = devTargetsErrors([good, bad]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Target 2");
    expect(errors[0]).toContain("missing a name");
  });

  it("reports a duplicate across rows", () => {
    const a = {
      ...emptyDevTargetDraft(),
      name: "web",
      kind: "server" as const,
      command: "x",
      url: "http://x",
    };
    const errors = devTargetsErrors([a, { ...a }]);
    expect(errors.some((e) => e.includes("Target 2") && e.includes("duplicate name"))).toBe(true);
  });
});

describe("Settings saves keep TOML-only target fields without exposing them (#0843 rounds 24-25)", () => {
  const toml = [
    "[[dev.targets]]",
    'name = "web"',
    'kind = "server"',
    'command = "bun run dev"',
    'url = "http://localhost:5173"',
    'cwd = "app"',
    'env = { NODE_ENV = "development", API_KEY = "s3cret-value" }',
    "",
    "[[dev.targets]]",
    'name = "docs"',
    'kind = "server"',
    'command = "bun run docs"',
    'url = "http://localhost:5174"',
    "",
    "[[dev.services]]",
    'name = "api"',
    'command = "bun run api"',
    'env = { DB_PASSWORD = "hunter2" }',
    "",
  ].join("\n");

  /** What the browser would hold: the redacted payload, as drafts. */
  function browserDrafts(root: string) {
    const safe = safeConfigForBrowser(loadConfig(root) as never) as {
      devTargets: Parameters<typeof draftFromTarget>[0][];
    };
    return safe.devTargets.map((t) => draftFromTarget(t));
  }

  // One edit per way the Settings form can rewrite the list.
  const edits: [string, (rows: Record<string, unknown>[]) => Record<string, unknown>[]][] = [
    ["edit a field", (rows) => rows.map((r) => (r.name === "web" ? { ...r, label: "Web" } : r))],
    ["reorder", (rows) => [...rows].reverse()],
    ["rename", (rows) => rows.map((r) => (r.name === "web" ? { ...r, name: "site" } : r))],
    ["remove a sibling", (rows) => rows.filter((r) => r.name === "web")],
  ];

  it("never sends env values (targets or services) to the browser", () => {
    const root = repo(toml);
    try {
      const safe = JSON.stringify(safeConfigForBrowser(loadConfig(root) as never));
      expect(safe).not.toContain("s3cret-value");
      expect(safe).not.toContain("hunter2");
      expect(safe).not.toContain("DB_PASSWORD");
      expect(safe).toContain("bun run api");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(edits)(
    "keeps cwd and env from disk through a browser round-trip: %s",
    async (_n, edit) => {
      const root = repo(toml);
      try {
        const wire = edit(browserDrafts(root).map((d) => targetFromDraft(d)));
        const { status } = await patch(root, { devTargets: wire });
        expect(status).toBe(200);
        const web = loadConfig(root).dev!.targets!.find(
          (t) => t.name === "web" || t.name === "site",
        )!;
        expect(web.cwd).toBe("app");
        expect(web.env).toEqual({ NODE_ENV: "development", API_KEY: "s3cret-value" });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("ignores env/cwd a browser tries to supply", async () => {
    const root = repo(toml);
    try {
      const wire = browserDrafts(root).map((d) => ({
        ...targetFromDraft(d),
        cwd: "evil",
        env: { INJECTED: "1" },
      }));
      await patch(root, { devTargets: wire.map((w) => ({ ...w, label: "x" })) });
      const web = loadConfig(root).dev!.targets![0]!;
      expect(web.cwd).toBe("app");
      expect(web.env).not.toHaveProperty("INJECTED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an older client that omits sourceName inherits from the same-named target", async () => {
    const root = repo(toml);
    try {
      const { status } = await patch(root, {
        devTargets: [
          {
            name: "web",
            kind: "server",
            command: "bun run dev",
            url: "http://localhost:5173",
            label: "Web",
          },
        ],
      });
      expect(status).toBe(200);
      const web = loadConfig(root).dev!.targets![0]!;
      expect(web.cwd).toBe("app");
      expect(web.env).toEqual({ NODE_ENV: "development", API_KEY: "s3cret-value" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("an unchanged list is still a no-op that does not rewrite the file", async () => {
    const root = repo(toml);
    try {
      const before = readFileSync(join(root, "repoos.toml"), "utf8");
      const { status } = await patch(root, {
        devTargets: browserDrafts(root).map((d) => targetFromDraft(d)),
      });
      expect(status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
