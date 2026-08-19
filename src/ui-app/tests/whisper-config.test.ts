/**
 * Tests for the [whisper] voice-transcription config (0197): TOML + env
 * parsing in `loadConfig`, and the `/api/config` redaction contract — the
 * apiKey must never reach the browser while the provider + enabled state do.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config";
import { startServer, type ServerHandle } from "../../server/server";

const tmpRoots: string[] = [];
const ENV_KEYS = ["REPOOS_WHISPER_KEY", "GROQ_API_KEY", "OPENAI_API_KEY"] as const;

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  for (const k of ENV_KEYS) delete process.env[k];
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-whisper-"));
  tmpRoots.push(dir);
  return dir;
}

function writeToml(root: string, body: string): void {
  writeFileSync(join(root, "repoos.toml"), body, "utf8");
}

describe("getConfigSchema voice promotion (#0236)", () => {
  it("exposes whisper fields in the visible voice group, not behind Advanced", () => {
    const schema = getConfigSchema();
    const provider = schema.find((f) => f.key === "whisper.provider");
    const apiKey = schema.find((f) => f.key === "whisper.apiKey");

    // Promoted out of the guarded (Advanced) tier so they render on the main
    // Settings view and are autosaved without opening the disclosure.
    expect(provider).toMatchObject({ tier: "live", group: "voice" });
    expect(apiKey).toMatchObject({ tier: "live", group: "voice" });

    // The only tier the UI gates behind Advanced is "guarded".
    const guardedKeys = schema.filter((f) => f.tier === "guarded").map((f) => f.key);
    expect(guardedKeys).not.toContain("whisper.provider");
    expect(guardedKeys).not.toContain("whisper.apiKey");

    // Being `tier: "live"`, both fields land in the searchable/⌘K index
    // (indexed as everything outside the Advanced disclosure).
    const searchable = schema.filter((f) => f.tier !== "guarded").map((f) => f.key);
    expect(searchable).toContain("whisper.provider");
    expect(searchable).toContain("whisper.apiKey");
  });

  it("keeps every non-voice guard low-frequency/risky or developer-facing", () => {
    const guardedKeys = getConfigSchema()
      .filter((f) => f.tier === "guarded")
      .map((f) => f.key);
    // ntfy base URL, the directory layout, and the task extension filter are
    // all operationally risky/developer-facing and stay in Advanced.
    expect(guardedKeys).toEqual(
      expect.arrayContaining([
        "ntfyBaseUrl",
        "workDir",
        "docsDir",
        "skillsDir",
        "taskExtensions",
        "cacheDir",
      ]),
    );
  });
});

describe("loadConfig [whisper] parsing", () => {
  it("parses provider + apiKey from repoos.toml", () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "groq"\napiKey = "gsk_test_123"\n');
    const config = loadConfig(root);
    expect(config.whisper).toEqual({ provider: "groq", apiKey: "gsk_test_123" });
  });

  it("falls back to REPOOS_WHISPER_KEY env var when no TOML key is set", () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "openai"\n');
    process.env.REPOOS_WHISPER_KEY = "sk-env-999";
    expect(loadConfig(root).whisper?.apiKey).toBe("sk-env-999");
  });

  it("uses the provider-specific env var when the generic one is absent", () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "openai"\n');
    process.env.OPENAI_API_KEY = "sk-openai-1";
    process.env.GROQ_API_KEY = "gsk-groq-1";
    expect(loadConfig(root).whisper?.apiKey).toBe("sk-openai-1");
  });

  it("never sends a different provider's key (OPENAI_API_KEY must not feed Groq)", () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "groq"\n');
    process.env.OPENAI_API_KEY = "sk-openai-1";
    expect(loadConfig(root).whisper?.apiKey).toBe("");
  });

  it("TOML apiKey wins over any env var", () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "groq"\napiKey = "gsk_toml"\n');
    process.env.REPOOS_WHISPER_KEY = "sk-env-999";
    process.env.GROQ_API_KEY = "gsk-groq-1";
    expect(loadConfig(root).whisper?.apiKey).toBe("gsk_toml");
  });

  it("defaults to provider none / no key when nothing is configured", () => {
    const config = loadConfig(tmpDir());
    expect(config.whisper?.provider).toBe("none");
    expect(config.whisper?.apiKey).toBe("");
  });
});

async function withServer(root: string, fn: (s: ServerHandle) => Promise<void>): Promise<void> {
  const server = await startServer({ root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

describe("GET /api/config whisper redaction", () => {
  it("never returns the apiKey and exposes provider + whisperEnabled flat", async () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "groq"\napiKey = "gsk_secret_42"\n');
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(JSON.stringify(body)).not.toContain("gsk_secret_42");
      expect(body.config["whisper.provider"]).toBe("groq");
      expect(body.config.whisperEnabled).toBe(true);
      expect((body.config.whisper as { apiKey?: string } | undefined)?.apiKey).toBeUndefined();
    });
  });

  it("reports whisperEnabled false when a provider is set but no key exists", async () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "groq"\n');
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(body.config["whisper.provider"]).toBe("groq");
      expect(body.config.whisperEnabled).toBe(false);
    });
  });

  it("reports whisperEnabled false when nothing is configured", async () => {
    await withServer(tmpDir(), async (s) => {
      const res = await fetch(`${s.url}/api/config`);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(body.config["whisper.provider"]).toBe("none");
      expect(body.config.whisperEnabled).toBe(false);
    });
  });
});

describe("GET /api/config strips theme/uiTheme (#0254)", () => {
  it("never returns theme or uiTheme even when repoos.toml contains them", async () => {
    const root = tmpDir();
    writeToml(root, 'theme = "dark"\nuiTheme = "jelly"\n');
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(body.config).not.toHaveProperty("theme");
      expect(body.config).not.toHaveProperty("uiTheme");
    });
  });
});

describe("PATCH /api/config ignores theme/uiTheme (#0254)", () => {
  it("does not persist theme or uiTheme when sent in the request body", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "dark", uiTheme: "jelly", ntfyTopic: "test_topic" }),
      });
      expect(res.status).toBe(200);
      // theme/uiTheme must not appear in repoos.toml
      const toml = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(toml).not.toContain("theme");
      expect(toml).not.toContain("uiTheme");
      // ntfyTopic should still be persisted
      expect(toml).toContain("test_topic");
    });
  });
});

describe("PATCH /api/config select persistence", () => {
  it("persists the active-task limit as a number and keeps it after reload", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxActiveTasks: "5" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(body.config.maxActiveTasks).toBe(5);
    });
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).toContain("maxActiveTasks = 5");
    expect(loadConfig(root).maxActiveTasks).toBe(5);
  });
});

describe("PATCH /api/config whisper", () => {
  it("returns a sanitized config (no apiKey) and enables transcription end-to-end", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "whisper.provider": "groq", "whisper.apiKey": "gsk_new_1" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { config: Record<string, unknown> };
      expect(JSON.stringify(body)).not.toContain("gsk_new_1");
      expect(body.config.whisperEnabled).toBe(true);
      expect(body.config["whisper.provider"]).toBe("groq");

      // The key persisted server-side: a fresh read reports enabled.
      const read = (await (await fetch(`${s.url}/api/config`)).json()) as {
        config: Record<string, unknown>;
      };
      expect(read.config.whisperEnabled).toBe(true);
    });
  });

  it("accepts an empty apiKey without clearing an existing key or erroring", async () => {
    const root = tmpDir();
    writeToml(root, '[whisper]\nprovider = "groq"\napiKey = "gsk_existing"\n');
    await withServer(root, async (s) => {
      const res = await fetch(`${s.url}/api/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "whisper.apiKey": "" }),
      });
      expect(res.status).toBe(200);

      // Existing key intact (server side), still enabled.
      const read = (await (await fetch(`${s.url}/api/config`)).json()) as {
        config: Record<string, unknown>;
      };
      expect(read.config.whisperEnabled).toBe(true);
      expect(JSON.stringify(read)).not.toContain("gsk_existing");
    });
  });
});
