/**
 * Settings import/export (#0779): the six Hetzner remote-validation details
 * have schema entries (which is what makes them PATCH-able) so an import can
 * apply a full `[remoteValidation]` section without a hand edit. They carry
 * no Settings rows — the Import/Export tab transfers them — and
 * SettingsView's buildBody skips them so an unrelated save never
 * materialises their defaults.
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config.js";
import { patchConfig } from "../../server/routes/config.js";

const roots: string[] = [];
function repo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-rvimport-"));
  roots.push(root);
  writeFileSync(join(root, "repoos.toml"), toml);
  return root;
}
async function cleanup(): Promise<void> {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
}

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: any }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: any = {
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
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  let payload: any = {};
  try {
    payload = JSON.parse(res.payload ?? "{}");
  } catch {
    /* non-JSON body */
  }
  return { status: res.statusCode, payload };
}

describe("remoteValidation Hetzner details schema entries (#0779)", () => {
  it("declares the six keys with restart-tier types matching the loader", () => {
    const schema = getConfigSchema();
    expect(schema.find((f) => f.key === "remoteValidation.serverType")).toMatchObject({
      type: "string",
      restartRequired: true,
      default: "cax31",
    });
    expect(schema.find((f) => f.key === "remoteValidation.location")).toMatchObject({
      type: "string",
      restartRequired: true,
      default: "hil",
    });
    expect(schema.find((f) => f.key === "remoteValidation.snapshotId")).toMatchObject({
      type: "string",
      restartRequired: true,
      default: "",
    });
    expect(schema.find((f) => f.key === "remoteValidation.sshKeyName")).toMatchObject({
      type: "string",
      restartRequired: true,
      default: "",
    });
    expect(schema.find((f) => f.key === "remoteValidation.idleShutdownMinutes")).toMatchObject({
      type: "number",
      restartRequired: true,
      default: 8,
    });
    expect(schema.find((f) => f.key === "remoteValidation.maxServerLifetimeMinutes")).toMatchObject(
      {
        type: "number",
        restartRequired: true,
        default: 120,
      },
    );
  });

  it("applies a full imported [remoteValidation] section through PATCH", async () => {
    const root = repo('workDir = "work"\n');
    const res = await patch(root, {
      "remoteValidation.enabled": true,
      "remoteValidation.provider": "hetzner",
      "remoteValidation.serverType": "cpx41",
      "remoteValidation.location": "fsn1",
      "remoteValidation.snapshotId": "snap-123",
      "remoteValidation.sshKeyName": "deploy-key",
      "remoteValidation.idleShutdownMinutes": 10,
      "remoteValidation.maxServerLifetimeMinutes": 60,
    });
    expect(res.status).toBe(200);
    const cfg = loadConfig(root);
    expect(cfg.remoteValidation).toMatchObject({
      enabled: true,
      provider: "hetzner",
      serverType: "cpx41",
      location: "fsn1",
      snapshotId: "snap-123",
      sshKeyName: "deploy-key",
      idleShutdownMinutes: 10,
      maxServerLifetimeMinutes: 60,
    });
    await cleanup();
  });
});
