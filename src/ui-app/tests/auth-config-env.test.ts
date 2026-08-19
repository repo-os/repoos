/**
 * #0246 follow-up: repoos.toml is git-tracked, so auth secrets shouldn't
 * have to live in it. loadConfig accepts REPOOS_AUTH_SESSION_SECRET,
 * REPOOS_RESEND_API_KEY, and REPOOS_GOOGLE_CLIENT_SECRET as fallbacks for
 * the corresponding TOML fields, same precedence as [whisper].apiKey:
 * TOML wins when both are set, env fills in when TOML omits it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config";

const tmpRoots: string[] = [];
const ENV_KEYS = [
  "REPOOS_AUTH_SESSION_SECRET",
  "REPOOS_RESEND_API_KEY",
  "REPOOS_GOOGLE_CLIENT_SECRET",
] as const;

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  for (const k of ENV_KEYS) delete process.env[k];
});

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-auth-env-"));
  tmpRoots.push(dir);
  return dir;
}

function writeToml(root: string, body: string): void {
  writeFileSync(join(root, "repoos.toml"), body, "utf8");
}

describe("loadConfig [auth] secret env fallbacks", () => {
  it("falls back to REPOOS_AUTH_SESSION_SECRET when sessionSecret is absent from TOML", () => {
    const root = tmpDir();
    writeToml(root, '[auth]\nenabled = true\nbootstrapAdmin = "a@b.com"\n');
    process.env.REPOOS_AUTH_SESSION_SECRET = "env-session-secret";
    expect(loadConfig(root).auth?.sessionSecret).toBe("env-session-secret");
  });

  it("TOML sessionSecret wins over the env var", () => {
    const root = tmpDir();
    writeToml(root, '[auth]\nenabled = true\nsessionSecret = "toml-secret"\n');
    process.env.REPOOS_AUTH_SESSION_SECRET = "env-session-secret";
    expect(loadConfig(root).auth?.sessionSecret).toBe("toml-secret");
  });

  it("falls back to REPOOS_RESEND_API_KEY when emailProvider.apiKey is absent from TOML", () => {
    const root = tmpDir();
    writeToml(
      root,
      '[auth]\nenabled = true\n\n[auth.emailProvider]\ntype = "resend"\nfromAddress = "noreply@x.com"\n',
    );
    process.env.REPOOS_RESEND_API_KEY = "re_env_key";
    const config = loadConfig(root);
    expect(config.auth?.emailProvider).toEqual({
      type: "resend",
      apiKey: "re_env_key",
      fromAddress: "noreply@x.com",
    });
  });

  it("does not register emailProvider when neither TOML nor env supplies an apiKey", () => {
    const root = tmpDir();
    writeToml(
      root,
      '[auth]\nenabled = true\n\n[auth.emailProvider]\ntype = "resend"\nfromAddress = "noreply@x.com"\n',
    );
    expect(loadConfig(root).auth?.emailProvider).toBeUndefined();
  });

  it("TOML emailProvider.apiKey wins over the env var", () => {
    const root = tmpDir();
    writeToml(
      root,
      '[auth]\nenabled = true\n\n[auth.emailProvider]\ntype = "resend"\napiKey = "re_toml_key"\nfromAddress = "noreply@x.com"\n',
    );
    process.env.REPOOS_RESEND_API_KEY = "re_env_key";
    expect(loadConfig(root).auth?.emailProvider?.apiKey).toBe("re_toml_key");
  });

  it("falls back to REPOOS_GOOGLE_CLIENT_SECRET when google.clientSecret is absent from TOML", () => {
    const root = tmpDir();
    writeToml(root, '[auth]\nenabled = true\n\n[auth.google]\nclientId = "id-123"\n');
    process.env.REPOOS_GOOGLE_CLIENT_SECRET = "env-google-secret";
    expect(loadConfig(root).auth?.google).toEqual({
      clientId: "id-123",
      clientSecret: "env-google-secret",
    });
  });

  it("does not register google config when neither TOML nor env supplies a clientSecret", () => {
    const root = tmpDir();
    writeToml(root, '[auth]\nenabled = true\n\n[auth.google]\nclientId = "id-123"\n');
    expect(loadConfig(root).auth?.google).toBeUndefined();
  });

  it("TOML google.clientSecret wins over the env var", () => {
    const root = tmpDir();
    writeToml(
      root,
      '[auth]\nenabled = true\n\n[auth.google]\nclientId = "id-123"\nclientSecret = "toml-secret"\n',
    );
    process.env.REPOOS_GOOGLE_CLIENT_SECRET = "env-google-secret";
    expect(loadConfig(root).auth?.google?.clientSecret).toBe("toml-secret");
  });
});
