/**
 * #0464 — preview-only configuration overrides.
 *
 * A `[preview.<base path>]` table in repoos.toml deep-merges over the base
 * configuration, but ONLY when the preview/UI-test runtime resolves config.
 * Covers: extraction, base-only (non-preview) behavior, nested deep-merge,
 * precedence (defaults → base → overlay → explicit CLI flags), the
 * `--no-preview-overrides` escape hatch, reporting, and the loopback guard that
 * keeps an auth-disabled preview off the tailnet.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfig,
  parseFlatToml,
  parsePreviewOverlays,
  readPreviewOverlayKeys,
} from "../../core/config";
import { resolvePreviewOverrides } from "../../commands/serve";
import { startServer, type ServerHandle } from "../../server/server";

const tmpRoots: string[] = [];
const handles: ServerHandle[] = [];

afterEach(async () => {
  for (const h of handles) await h.close("test cleanup").catch(() => {});
  handles.length = 0;
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  vi.restoreAllMocks();
});

function tmpRepo(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-preview-overrides-"));
  tmpRoots.push(dir);
  writeFileSync(join(dir, "repoos.toml"), body, "utf8");
  return dir;
}

const BASE_AUTH = `[auth]
enabled = true
sessionMaxAge = 1234
bootstrapAdmin = "admin@example.com"
`;

describe("parsePreviewOverlays", () => {
  it("extracts base-key overrides and ignores preview feature keys and target tables", () => {
    const parsed = parseFlatToml(
      [
        "[preview]",
        'command = "bun run dev --port {port}"',
        'readyPath = "/api/health"',
        "",
        "[preview.auth]",
        "enabled = false",
        "",
        "[preview.auth.google]",
        'clientId = "client-123"',
        "",
        "[[preview.targets]]",
        'name = "Landing"',
        'command = "bun run dev"',
      ].join("\n"),
    );
    const overlay = parsePreviewOverlays(parsed);
    expect(overlay.entries).toEqual({
      "auth.enabled": false,
      "auth.google.clientId": "client-123",
    });
    expect(overlay.keys).toEqual(["auth.enabled", "auth.google.clientId"]);
  });
});

describe("loadConfig [preview.*] overlay", () => {
  it("ignores the overlay for a normal (non-preview) load — base config only", () => {
    const root = tmpRepo(`${BASE_AUTH}\n[preview.auth]\nenabled = false\n`);
    const cfg = loadConfig(root);
    expect(cfg.auth?.enabled).toBe(true);
    expect(cfg.previewOverrides).toBeUndefined();
  });

  it("applies the overlay when preview overrides are enabled", () => {
    const root = tmpRepo(`${BASE_AUTH}\n[preview.auth]\nenabled = false\n`);
    const cfg = loadConfig(root, { previewOverrides: true });
    expect(cfg.auth?.enabled).toBe(false);
    expect(cfg.previewOverrides).toEqual(["auth.enabled"]);
  });

  it("deep-merges: an override changes only the keys it names", () => {
    const root = tmpRepo(`${BASE_AUTH}\n[preview.auth]\nenabled = false\n`);
    const cfg = loadConfig(root, { previewOverrides: true });
    expect(cfg.auth).toMatchObject({
      enabled: false,
      sessionMaxAge: 1234,
      bootstrapAdmin: "admin@example.com",
    });
  });

  it("places the overlay between the base config and nothing else (overlay wins over base)", () => {
    const root = tmpRepo(`[auth]\nenabled = false\n\n[preview.auth]\nenabled = true\n`);
    expect(loadConfig(root).auth?.enabled).toBe(false);
    expect(loadConfig(root, { previewOverrides: true }).auth?.enabled).toBe(true);
  });

  it("drops an unknown override key with a warning instead of applying it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = tmpRepo(`[preview.notARealKey]\nfoo = "bar"\n`);
    const cfg = loadConfig(root, { previewOverrides: true });
    expect(cfg.previewOverrides).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("notARealKey"));
  });
});

describe("readPreviewOverlayKeys", () => {
  it("returns the declared keys sorted, or [] when there is no repoos.toml", () => {
    const root = tmpRepo(`[preview.auth]\nenabled = false\n`);
    expect(readPreviewOverlayKeys(root)).toEqual(["auth.enabled"]);
    const empty = tmpRepo(" ");
    rmSync(join(empty, "repoos.toml"));
    expect(readPreviewOverlayKeys(empty)).toEqual([]);
  });
});

describe("resolvePreviewOverrides (CLI flags vs the preview-child marker)", () => {
  it("is off for an ordinary `repoos serve`", () => {
    expect(resolvePreviewOverrides([], {})).toBe(false);
  });

  it("is on inside a managed preview child", () => {
    expect(resolvePreviewOverrides([], { REPOOS_PREVIEW_CHILD: "1" })).toBe(true);
  });

  it("--no-preview-overrides is the escape hatch and beats the child marker", () => {
    expect(resolvePreviewOverrides(["--no-preview-overrides"], { REPOOS_PREVIEW_CHILD: "1" })).toBe(
      false,
    );
  });

  it("--preview-overrides forces it on for a manual UI-test preview", () => {
    expect(resolvePreviewOverrides(["--preview-overrides"], {})).toBe(true);
  });
});

describe("startServer preview-override loopback guard", () => {
  it("keeps an auth-disabled preview on loopback and reports the applied keys", async () => {
    const root = tmpRepo(`${BASE_AUTH}\n[preview.auth]\nenabled = false\n`);
    const handle = await startServer({
      root,
      port: 0,
      // The Tailscale default would otherwise be 0.0.0.0; no --host was passed.
      host: "0.0.0.0",
      previewOverrides: true,
    });
    handles.push(handle);
    expect(handle.url).toContain("127.0.0.1");
    expect(handle.previewOverrides).toEqual(["auth.enabled"]);
  });
});
