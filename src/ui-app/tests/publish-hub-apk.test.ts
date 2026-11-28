import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { publishHubApkPaths } from "../../../mobile/scripts/publish-hub-apk-paths.js";

const script = resolve(process.cwd(), "mobile/scripts/publish-hub-apk.ts");
const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-hub-publish-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function invoke(env: NodeJS.ProcessEnv) {
  return spawnSync("bun", [script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("publish-hub-apk credential refusals", () => {
  it("resolves the APK and verifier to the paths produced by the release recipe", () => {
    const paths = publishHubApkPaths(process.cwd());
    expect(paths.apk).toBe(join(process.cwd(), "mobile/app-release.apk"));
    expect(paths.verifier).toBe(join(process.cwd(), "mobile/scripts/verify-release-apk.ts"));
  });

  it("fails before building when release signing values are missing", () => {
    const home = tempDir();
    const result = invoke({
      HOME: home,
      USERPROFILE: home,
      REPOOS_ANDROID_KEYSTORE_PATH: "",
      REPOOS_ANDROID_KEYSTORE_PASSWORD: "",
      REPOOS_ANDROID_KEY_ALIAS: "",
      REPOOS_ANDROID_KEY_PASSWORD: "",
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_ACCOUNT_ID: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Android release signing is incomplete");
    expect(result.stderr).toContain("REPOOS_ANDROID_KEYSTORE_PASSWORD");
  });

  it("fails before building when Cloudflare credentials are missing and never prints signing values", () => {
    const home = tempDir();
    const keystore = join(home, "release.keystore");
    writeFileSync(keystore, "fixture");
    const secret = "test-only-password-never-print";
    const result = invoke({
      HOME: home,
      USERPROFILE: home,
      REPOOS_ANDROID_KEYSTORE_PATH: keystore,
      REPOOS_ANDROID_KEYSTORE_PASSWORD: secret,
      REPOOS_ANDROID_KEY_ALIAS: "test-alias",
      REPOOS_ANDROID_KEY_PASSWORD: "test-key-password",
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_ACCOUNT_ID: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cloudflare publishing credentials are missing");
    expect(result.stderr).not.toContain(secret);
  });
});
