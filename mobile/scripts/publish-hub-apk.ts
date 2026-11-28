#!/usr/bin/env bun
/** Build and publish the signed Android Hub APK from the maintainer's Mac. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { publishHubApkPaths } from "./publish-hub-apk-paths.js";

const root = resolve(import.meta.dir, "../..");
const { apk, verifier } = publishHubApkPaths(root);
const signingNames = [
  "REPOOS_ANDROID_KEYSTORE_PATH",
  "REPOOS_ANDROID_KEYSTORE_PASSWORD",
  "REPOOS_ANDROID_KEY_ALIAS",
  "REPOOS_ANDROID_KEY_PASSWORD",
];
const dryRun = process.argv.includes("--dry-run");

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function loadSigningFile(): void {
  const file = join(homedir(), ".config/repoos-hub/release-signing.env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(REPOOS_ANDROID_[A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || !signingNames.includes(match[1]) || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function run(command: string, args: string[], env = process.env): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`;
    fail(`${command} failed: ${reason}`);
  }
  return result.stdout ?? "";
}

loadSigningFile();
const missingSigning = signingNames.filter((name) => !process.env[name]?.trim());
if (missingSigning.length) {
  fail(
    `Android release signing is incomplete (${missingSigning.join(", ")}). Set them in the environment or ~/.config/repoos-hub/release-signing.env.`,
  );
}
if (
  !process.env.REPOOS_ANDROID_KEYSTORE_PATH ||
  !existsSync(process.env.REPOOS_ANDROID_KEYSTORE_PATH)
) {
  fail("REPOOS_ANDROID_KEYSTORE_PATH does not point to an existing keystore.");
}
if (!dryRun) {
  const missingCloudflare = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingCloudflare.length)
    fail(
      `Cloudflare publishing credentials are missing (${missingCloudflare.join(", ")}). Set them in your environment.`,
    );
}

console.log(
  dryRun
    ? "Building signed APK (dry run; no upload will occur)…"
    : "Building and verifying signed APK…",
);
run("just", ["build-android-release"]);
if (!existsSync(apk)) fail(`Expected release APK was not produced at ${apk}.`);

const sdkRoot =
  process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || `${homedir()}/Library/Android/sdk`;
const buildToolsDir = join(sdkRoot, "build-tools");
if (!existsSync(buildToolsDir)) fail(`Android build-tools not found under ${buildToolsDir}.`);
const aaptName = process.platform === "win32" ? "aapt.exe" : "aapt";
const versions = readdirSync(buildToolsDir)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .reverse();
const aapt = versions.map((version) => join(buildToolsDir, version, aaptName)).find(existsSync);
if (!aapt) fail(`aapt not found under ${buildToolsDir}. Install Android build-tools.`);
const badging = run(aapt, ["dump", "badging", apk]);
const versionName = /\bversionName='([^']+)'/.exec(badging)?.[1];
const versionCode = Number(/\bversionCode='(\d+)'/.exec(badging)?.[1]);
if (!versionName || !Number.isSafeInteger(versionCode))
  fail("Could not read APK version metadata.");
if (/application-debuggable/.test(badging)) fail("Refusing to publish a debuggable APK.");
const certificateSha256 = run("bun", [verifier, apk]).trim();
const stat = run(
  "stat",
  process.platform === "darwin" ? ["-f", "%z", apk] : ["-c", "%s", apk],
).trim();
const sha256 = run("shasum", ["-a", "256", apk]).trim().split(/\s+/)[0];
const metadata = {
  versionName,
  versionCode,
  size: Number(stat),
  sha256,
  certificateSha256,
  buildTime: new Date().toISOString(),
};
console.log(
  `Verified RepoOS Hub v${versionName} (${metadata.size} bytes), certificate SHA-256 ${certificateSha256}.`,
);
if (dryRun) {
  console.log(`Dry run complete. Metadata that would be uploaded: ${JSON.stringify(metadata)}`);
  process.exit(0);
}

const metadataPath = join(tmpdir(), `repoos-hub-version-${process.pid}.json`);
await Bun.write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
const wrangler = ["--bun", "wrangler", "r2", "object", "put"];
const config = join(root, "landing/wrangler.jsonc");
run("bunx", [
  ...wrangler,
  `repoos-hub-downloads/repoos-hub.apk`,
  "--file",
  apk,
  "--content-type",
  "application/vnd.android.package-archive",
  "--remote",
  "--config",
  config,
]);
run("bunx", [
  ...wrangler,
  "repoos-hub-downloads/version.json",
  "--file",
  metadataPath,
  "--content-type",
  "application/json",
  "--remote",
  "--config",
  config,
]);
console.log(`Published RepoOS Hub v${versionName} to https://repoos.org/downloads/repoos-hub.apk`);
