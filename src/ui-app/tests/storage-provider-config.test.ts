/**
 * Attachment-storage provider selection (#0659): the `[storage] provider`
 * config key, the server-side availability report the UI trusts, the wiring
 * that makes a configured provider take effect (and fall back to local when it
 * is not ready), and the Settings copy that must never claim cloud is active
 * when it isn't.
 */
import { describe, expect, it, afterEach } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import {
  DEFAULT_STORAGE_PROVIDER_ID,
  describeStorage,
  registerStorageProvider,
  unregisterStorageProvider,
} from "../../core/storage/registry.js";
import type { StorageProvider } from "../../core/storage/types.js";
import { createRepoOS } from "../../core/repoos";
import { patchConfig } from "../../server/routes/config.js";
import { resolveScreenshot, saveScreenshot } from "../../server/attachments";
import { isGeneralSchemaFieldKey, resolveSettingLocation } from "../src/settings-location";
import {
  storageExplanation,
  storageProviderOptions,
  storageStatusChip,
} from "../src/lib/storage-status";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-storage-config-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function load(toml: string): ReturnType<typeof loadConfig> {
  const root = tempRoot();
  writeFileSync(join(root, "repoos.toml"), toml, "utf8");
  return loadConfig(root);
}

/** A minimal provider that never touches disk, for registry status tests. */
function stubProvider(id: string, status?: StorageProvider["status"]): StorageProvider {
  return {
    id,
    status,
    put: () => ({}),
    get: () => null,
    list: () => [],
    remove: () => false,
    removeNamespace: () => {},
  };
}

describe("storage.provider config key (#0659)", () => {
  it("is a restart-tier select with local + neon, defaulting to local", () => {
    expect(getConfigSchema().find((f) => f.key === "storage.provider")).toMatchObject({
      label: "Attachment storage",
      type: "select",
      tier: "restart",
      restartRequired: true,
      default: DEFAULT_STORAGE_PROVIDER_ID,
      options: [
        { value: "local", label: "Local filesystem" },
        { value: "neon", label: "Neon Object Storage" },
      ],
    });
    expect(SUPPORTED_TOML_KEYS).toContain("storage.provider");
  });

  it("defaults to local when the [storage] section is absent", () => {
    expect(load('workDir = "work"\n').storage?.provider).toBe("local");
  });

  it("parses a configured provider id", () => {
    expect(load('[storage]\nprovider = "neon"\n').storage?.provider).toBe("neon");
  });

  it("accepts an unrecognized id syntactically without crashing", () => {
    expect(load('[storage]\nprovider = "s3"\n').storage?.provider).toBe("s3");
  });

  it("keeps the local default for an empty provider value", () => {
    expect(load('[storage]\nprovider = ""\n').storage?.provider).toBe("local");
  });
});

describe("describeStorage — the server never lets the UI guess (#0659)", () => {
  it("reports local as always available", () => {
    expect(describeStorage("local", tempRoot())).toEqual({
      configured: "local",
      effective: "local",
      available: true,
      reason: "",
    });
    expect(describeStorage(undefined, tempRoot())).toMatchObject({
      configured: "local",
      effective: "local",
      available: true,
    });
  });

  it("falls back to local for an unknown provider id with a reason", () => {
    const status = describeStorage("no-such-provider", tempRoot());
    expect(status.configured).toBe("no-such-provider");
    expect(status.effective).toBe("local");
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/no-such-provider/);
  });

  it("falls back when a registered provider reports itself unavailable", () => {
    registerStorageProvider("cloud-unconfigured", () =>
      stubProvider("cloud-unconfigured", () => ({
        available: false,
        reason: "Neon Object Storage isn't configured yet.",
      })),
    );
    try {
      const status = describeStorage("cloud-unconfigured", tempRoot());
      expect(status).toMatchObject({
        configured: "cloud-unconfigured",
        effective: "local",
        available: false,
      });
      expect(status.reason).toBe("Neon Object Storage isn't configured yet.");
    } finally {
      unregisterStorageProvider("cloud-unconfigured");
    }
  });

  it("reports a registered, configured provider as effective", () => {
    registerStorageProvider("cloud-ready", () =>
      stubProvider("cloud-ready", () => ({ available: true })),
    );
    try {
      expect(describeStorage("cloud-ready", tempRoot())).toEqual({
        configured: "cloud-ready",
        effective: "cloud-ready",
        available: true,
        reason: "",
      });
    } finally {
      unregisterStorageProvider("cloud-ready");
    }
  });
});

describe("configured provider is actually used, with a local fallback (#0659)", () => {
  it("an upload through an unavailable configured provider still succeeds via local", () => {
    const root = tempRoot();
    const repoos = createRepoOS(root);
    // `neon` is not registered in this slice (#0660 adds it), so the registry
    // must fall back to local — an upload that would otherwise fail instead
    // lands on disk, and describeStorage agrees local is in effect.
    repoos.config.storage = { provider: "neon" };
    const task = repoos.createTask({ title: "fallback shot" });
    const saved = saveScreenshot(repoos.config, task, {
      name: "fallback.png",
      mime: "image/png",
      data: PNG_1PX,
    });
    expect("error" in saved).toBe(false);
    expect(resolveScreenshot(repoos.config, task.id, "screenshot-1.png")).toBe(
      join(root, "work", ".attachments", task.id, "screenshot-1.png"),
    );
    expect(describeStorage("neon", join(root, "work"))).toMatchObject({
      effective: "local",
      available: false,
    });
  });
});

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

describe("Settings PATCH persists [storage] (#0659)", () => {
  it("writes provider through the standard config path", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "storage.provider": "neon" });
    expect(res.status).toBe(200);
    expect(loadConfig(root).storage?.provider).toBe("neon");
  });

  it("updates the leaf in place when a [storage] section already exists", async () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "repoos.toml"),
      'workDir = "work"\n\n[storage]\nprovider = "local"\n',
      "utf8",
    );
    const res = await patch(root, { "storage.provider": "neon" });
    expect(res.status).toBe(200);
    const text = readFileSync(join(root, "repoos.toml"), "utf8");
    expect(text).toMatch(/\[storage\]/);
    expect(text).toMatch(/^provider\s*=\s*"neon"/m);
    // The section leaf is rewritten, never duplicated as a root dotted key.
    expect(text).not.toContain('storage.provider = "neon"');
    expect(loadConfig(root).storage?.provider).toBe("neon");
  });

  it("rejects a value outside the select options", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n', "utf8");
    const res = await patch(root, { "storage.provider": "not-a-provider" });
    expect(res.status).toBe(400);
  });
});

describe("Settings placement (#0659)", () => {
  it("has a dedicated General card, not a duplicate schema row", () => {
    const field = getConfigSchema().find((f) => f.key === "storage.provider");
    expect(isGeneralSchemaFieldKey("storage.provider")).toBe(false);
    expect(resolveSettingLocation("storage.provider", field, { inspectorAvailable: true })).toEqual(
      {
        tab: "general",
        hasUiRow: true,
      },
    );
  });
});

describe("Settings attachment-storage copy (#0659)", () => {
  const options = storageProviderOptions(
    getConfigSchema().find((f) => f.key === "storage.provider"),
  );

  it("describes local as the default and says where files live", () => {
    const status = {
      configured: "local",
      effective: "local",
      available: true,
      reason: "",
    };
    const text = storageExplanation("local", status, options);
    expect(text).toMatch(/gitignored/);
    expect(text).toContain(".attachments/");
    expect(storageStatusChip(status, options)).toBe("Local filesystem in effect");
  });

  it("explains an unconfigured cloud provider without claiming cloud is active", () => {
    const status = {
      configured: "neon",
      effective: "local",
      available: false,
      reason: "Neon Object Storage isn't configured yet. Add credentials to enable it.",
    };
    const text = storageExplanation("neon", status, options);
    expect(text).toContain("isn't configured yet");
    expect(text).toMatch(/local/i);
    expect(text.toLowerCase()).not.toContain("is active");
    expect(storageStatusChip(status, options)).toBe("Local filesystem in effect");
  });

  it("does not claim cloud is active when a cloud provider is merely selected", () => {
    const status = {
      configured: "local",
      effective: "local",
      available: true,
      reason: "",
    };
    const text = storageExplanation("neon", status, options);
    expect(text).toContain("isn't configured yet");
    expect(text).not.toContain("is configured and in effect");
    expect(storageStatusChip(status, options)).toBe("Local filesystem in effect");
  });

  it("only states a cloud provider is active when the server reports it effective", () => {
    const status = {
      configured: "neon",
      effective: "neon",
      available: true,
      reason: "",
    };
    expect(storageExplanation("neon", status, options)).toContain("is configured and in effect");
    expect(storageStatusChip(status, options)).toBe("Neon Object Storage");
  });
});
