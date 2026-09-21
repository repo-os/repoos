import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { parseTunnelSection } from "../../core/tunnel.js";

const repoRoot = resolve(__dirname, "../../..");

const configurationDoc = readFileSync(join(repoRoot, "user-docs/configuration.md"), "utf8");

const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");

const environmentDoc = readFileSync(join(repoRoot, "user-docs/environment-and-secrets.md"), "utf8");

/**
 * The repoos.toml reference must not drift from the config the code actually
 * reads. `getConfigSchema()` is the Settings UI's source of truth, so every
 * field it exposes has to be documented; the annotated starter has to parse
 * through the real `loadConfig`; and `.env.example` has to stay placeholders.
 */
describe("repoos.toml and environment docs", () => {
  it("documents every field in the config schema", () => {
    const missing = getConfigSchema()
      .map((field) => field.key)
      .filter((key) => !configurationDoc.includes(key));
    expect(missing).toEqual([]);
  });

  it("documents every key the parser supports, including parser-only sections", () => {
    // Normalize the doc's `preview.targets[]` array notation so it matches the
    // dotted parser keys.
    const normalized = configurationDoc.replace(/\[\]/g, "");
    const missing = SUPPORTED_TOML_KEYS.filter((key) => !normalized.includes(key));
    expect(missing).toEqual([]);
  });

  it("documents the [tunnel] keys the tunnel parser actually reads", () => {
    const match = configurationDoc.match(/## Tunnels\n[\s\S]*?```toml\n([\s\S]*?)```/);
    expect(match, "Tunnels example toml block not found").not.toBeNull();
    const tunnel = parseTunnelSection(match![1]);
    expect(tunnel.name).toBe("repoos-local");
    // `tunnel_id` is snake_case; a camelCase `tunnelId` in the docs would be
    // silently ignored and leave this at the default empty string.
    expect(tunnel.tunnelId).toBe("<your-tunnel-uuid>");
  });

  it("documents every variable the tracked .env.example lists", () => {
    // Include commented example lines: the runtime overrides are shipped
    // commented so copying the file doesn't set a bogus value.
    const names = envExample
      .split("\n")
      .map((line) => line.trim().replace(/^#\s*/, ""))
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.slice(0, line.indexOf("=")).trim());
    expect(names.length).toBeGreaterThan(0);
    const undocumented = names.filter((name) => !environmentDoc.includes(name));
    expect(undocumented).toEqual([]);
  });

  it("keeps the embedded .env.example block in sync with the tracked file", () => {
    const match = environmentDoc.match(/## `\.env\.example`\n[\s\S]*?```bash\n([\s\S]*?)```/);
    expect(match, "embedded .env.example block not found").not.toBeNull();
    expect(match![1].trim()).toBe(envExample.trim());
  });

  it("keeps .env.example to placeholders, never live-looking values", () => {
    // Real credentials are long opaque tokens. Check every line — commented
    // examples included — while allowing placeholders (`...`, `<...>`), paths,
    // and URLs.
    const liveLooking = /[A-Za-z0-9_-]{24,}/;
    for (const raw of envExample.split("\n")) {
      const line = raw.trim().replace(/^#\s*/, "");
      if (!/^[A-Z][A-Z0-9_]*=/.test(line)) continue;
      const value = line
        .slice(line.indexOf("=") + 1)
        .split(/\s+#/)[0]
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (!value || value.includes("...") || value.includes("<")) continue;
      if (value.startsWith("/") || /^https?:\/\//.test(value)) continue;
      expect(liveLooking.test(value), `live-looking value in .env.example: ${raw.trim()}`).toBe(
        false,
      );
    }
  });

  it("has an annotated starter repoos.toml that the real parser accepts", () => {
    const match = configurationDoc.match(
      /## Annotated starter[^\n]*\n[\s\S]*?```toml\n([\s\S]*?)```/,
    );
    expect(match, "annotated starter toml block not found").not.toBeNull();

    const dir = mkdtempSync(join(tmpdir(), "repoos-config-docs-"));
    try {
      writeFileSync(join(dir, "repoos.toml"), match![1]);
      const cfg = loadConfig(dir);
      expect(cfg.workDir).toBe("work");
      expect(cfg.defaultStatus).toBe("inbox");
      expect(cfg.servePort).toBe(7171);
      expect(cfg.strictBuild).toBe(false);
      expect(cfg.maxConcurrentAgents).toBe(5);
      expect(cfg.worktreeWarnThreshold).toBe(20);
      expect(cfg.boardColumns?.draft).toBe("Ideas");
      expect(cfg.worktrees?.inheritEnv).toBe(false);
      expect(cfg.watchdog?.stalenessMs).toBe(300000);
      expect(cfg.whisper?.provider).toBe("none");
      expect(cfg.preview?.command).toBe("bun run dev --port {port}");
      expect(cfg.preview?.targets).toHaveLength(1);
      expect(cfg.check?.uiSmoke).toBe("bun run smoke");
      expect(cfg.check?.themeScopes?.[0]?.selector).toBe(":root");
      expect(cfg.check?.contrastPairs?.[0]?.fg).toBe("--txt");
      expect(cfg.auth?.enabled).toBe(false);
      expect(cfg.release?.enabled).toBe(false);
      expect(cfg.release?.provider).toBe("git-tag");
      expect(cfg.stories?.enabled).toBe(false);
      expect(cfg.deployments?.[0]?.dashboardUrl).toBe("https://dash.cloudflare.com/…");
      expect(cfg.distribution?.[0]?.kind).toBe("npm");
      expect(cfg.tunnelEnabled).toBe(false);
      expect(cfg.remoteValidation?.enabled).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
