#!/usr/bin/env bun
/**
 * Refuse to publish an APK that is not signed with the configured release key.
 *
 * Usage:
 *   bun mobile/scripts/verify-release-apk.ts <path-to.apk>
 *
 * Required environment (the same variables the Gradle release build uses):
 *   REPOOS_ANDROID_KEYSTORE_PATH
 *   REPOOS_ANDROID_KEYSTORE_PASSWORD
 *   REPOOS_ANDROID_KEY_ALIAS
 *
 * `apksigner` comes from $ANDROID_HOME/$ANDROID_SDK_ROOT build-tools, or
 * $APKSIGNER; `keytool` comes from $JAVA_HOME/bin or PATH, or $KEYTOOL.
 *
 * On success the APK's certificate SHA-256 (colon-separated, uppercase) is the
 * only thing printed to stdout, so a workflow can show it in the job summary.
 * Diagnostics go to stderr.
 */
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

type CommandResult = { status: number; stdout: string; stderr: string };

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    fail(`could not run ${basename(command)}: ${result.error.message}`);
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function normalizeFingerprint(value: string): string {
  return value.replace(/[^0-9a-f]/gi, "").toUpperCase();
}

function formatFingerprint(value: string): string {
  const hex = normalizeFingerprint(value);
  const pairs = hex.match(/.{2}/g);
  if (!pairs || hex.length !== 64) {
    fail(`expected a SHA-256 certificate fingerprint (64 hex characters), got: ${value}`);
  }
  return pairs.join(":");
}

function findApksigner(): string {
  const explicit = process.env.APKSIGNER?.trim();
  if (explicit) return explicit;

  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const executable = process.platform === "win32" ? "apksigner.bat" : "apksigner";

  for (const root of sdkRoots) {
    const buildTools = join(root, "build-tools");
    if (!existsSync(buildTools)) continue;
    const versions = readdirSync(buildTools).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    for (const version of versions.reverse()) {
      const candidate = join(buildTools, version, executable);
      if (existsSync(candidate)) return candidate;
    }
  }

  // Trust PATH only after an explicit SDK lookup: in CI that lookup is the
  // build-tools version Gradle actually used.
  const onPath = spawnSync("apksigner", ["version"], { encoding: "utf8" });
  if (!onPath.error && onPath.status === 0) return "apksigner";

  fail(
    "apksigner not found. Set ANDROID_HOME/ANDROID_SDK_ROOT to an Android SDK " +
      "with build-tools installed, or point APKSIGNER at the binary.",
  );
}

function findKeytool(): string {
  const explicit = process.env.KEYTOOL?.trim();
  if (explicit) return explicit;

  const javaHome = process.env.JAVA_HOME?.trim();
  if (javaHome) {
    const candidate = join(
      javaHome,
      "bin",
      process.platform === "win32" ? "keytool.exe" : "keytool",
    );
    if (existsSync(candidate)) return candidate;
  }
  return "keytool";
}

function keystoreFingerprint(keystore: string, password: string, alias: string): string {
  const result = run(findKeytool(), [
    "-list",
    "-v",
    "-keystore",
    keystore,
    "-storepass",
    password,
    "-alias",
    alias,
  ]);
  if (result.status !== 0) {
    fail(
      `keytool could not read ${keystore} with alias "${alias}":\n` +
        `${result.stderr || result.stdout}`.trim(),
    );
  }
  const match = /SHA256:\s*([0-9A-Fa-f:]+)/.exec(result.stdout);
  if (!match) {
    fail(`keytool did not report a SHA-256 fingerprint for alias "${alias}" in ${keystore}`);
  }
  return normalizeFingerprint(match[1]);
}

/** Best-effort read: a missing or malformed debug keystore must not fail the check. */
function tryKeystoreFingerprint(keystore: string, password: string, alias: string): string | null {
  const result = spawnSync(
    findKeytool(),
    ["-list", "-v", "-keystore", keystore, "-storepass", password, "-alias", alias],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) return null;
  const match = /SHA256:\s*([0-9A-Fa-f:]+)/.exec(result.stdout ?? "");
  return match ? normalizeFingerprint(match[1]) : null;
}

function apkFingerprints(apk: string): string[] {
  const result = run(findApksigner(), ["verify", "--print-certs", apk]);
  if (result.status !== 0) {
    fail(`apksigner rejected ${apk}:\n${result.stderr || result.stdout}`.trim());
  }
  const fingerprints: string[] = [];
  const pattern = /Signer #\d+ certificate SHA-256 digest:\s*([0-9A-Fa-f:]+)/g;
  for (const match of result.stdout.matchAll(pattern)) {
    fingerprints.push(normalizeFingerprint(match[1]));
  }
  if (fingerprints.length === 0) {
    fail(`apksigner found no certificate SHA-256 digest in ${apk}`);
  }
  return fingerprints;
}

function defaultDebugKeystore(): string | null {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim();
  if (!home) return null;
  const path = join(home, ".android", "debug.keystore");
  return existsSync(path) ? path : null;
}

const apk = process.argv[2];
if (!apk) {
  fail("usage: bun mobile/scripts/verify-release-apk.ts <path-to.apk>");
}
const apkPath = resolve(apk);
if (!existsSync(apkPath)) {
  fail(`APK not found: ${apkPath}`);
}

const keystorePath = process.env.REPOOS_ANDROID_KEYSTORE_PATH?.trim();
const keystorePassword = process.env.REPOOS_ANDROID_KEYSTORE_PASSWORD?.trim();
const keyAlias = process.env.REPOOS_ANDROID_KEY_ALIAS?.trim();
if (!keystorePath || !keystorePassword || !keyAlias) {
  fail(
    "release signing is not configured. Set REPOOS_ANDROID_KEYSTORE_PATH, " +
      "REPOOS_ANDROID_KEYSTORE_PASSWORD and REPOOS_ANDROID_KEY_ALIAS " +
      "(see mobile/README.md → Release signing).",
  );
}
if (!existsSync(keystorePath)) {
  fail(`release keystore not found: ${keystorePath}`);
}

const debugKeystore = defaultDebugKeystore();
if (debugKeystore && resolve(keystorePath) === resolve(debugKeystore)) {
  fail(
    `refusing to publish: ${keystorePath} is the Android debug keystore. ` +
      "Create a dedicated release keystore (see mobile/README.md).",
  );
}

const expected = keystoreFingerprint(keystorePath, keystorePassword, keyAlias);
const actuals = apkFingerprints(apkPath);
if (actuals.length !== 1) {
  fail(
    `expected exactly one signer, found ${actuals.length}. ` +
      "A public APK must be signed only with the release key.",
  );
}
const actual = actuals[0];

if (debugKeystore) {
  // A malformed/missing debug keystore is not this APK's problem; the
  // expected-release comparison below still rejects a debug-signed APK
  // whenever the debug certificate is present.
  const debug = tryKeystoreFingerprint(debugKeystore, "android", "androiddebugkey");
  if (debug && actual === debug) {
    fail(
      `refusing to publish: ${apkPath} is signed with the Android debug certificate ` +
        `(${formatFingerprint(actual)}). Build the release variant with the release keystore.`,
    );
  }
}

if (actual !== expected) {
  fail(
    `refusing to publish: ${apkPath} is signed with ${formatFingerprint(actual)}, ` +
      `but ${keystorePath} (alias "${keyAlias}") has ${formatFingerprint(expected)}.`,
  );
}

console.error(`verified ${apkPath} is signed with the release certificate ${keyAlias}`);
console.log(formatFingerprint(actual));
