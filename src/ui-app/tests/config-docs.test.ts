import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config.js";

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

  it("documents every variable the tracked .env.example lists", () => {
    const names = envExample
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.slice(0, line.indexOf("=")).trim());
    expect(names.length).toBeGreaterThan(0);
    const undocumented = names.filter((name) => !environmentDoc.includes(name));
    expect(undocumented).toEqual([]);
  });

  it("keeps .env.example to placeholders, never live-looking values", () => {
    const valueFor = (line: string) => line.slice(line.indexOf("=") + 1).trim();
    const safeValues = new Set([
      "re_...",
      "...",
      "your-local-code",
      "/absolute/path/to/private_key",
      "auto",
      "/path/to/bun",
    ]);
    for (const raw of envExample.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      expect(safeValues.has(valueFor(line)), `unexpected value in .env.example: ${line}`).toBe(
        true,
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
      expect(cfg.release?.enabled).toBe(true);
      expect(cfg.deployments?.[0]?.dashboardUrl).toBe("https://dash.cloudflare.com/…");
      expect(cfg.distribution?.[0]?.kind).toBe("npm");
      expect(cfg.tunnelEnabled).toBe(false);
      expect(cfg.remoteValidation?.enabled).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
