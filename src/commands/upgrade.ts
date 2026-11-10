/**
 * `repoos upgrade` — self-update for standalone (curl-installed) builds.
 * Downloads the latest GitHub release's dist tarball and swaps it into place.
 *
 * Package-manager installs are not touched here — those update through the
 * same package manager. We detect the usual global-install locations so the
 * command can give an actionable, source-specific instruction.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { c } from "../cli/colors.js";
import { launcherScript } from "../core/launcher-runtime.js";

export { launcherScript } from "../core/launcher-runtime.js";

const REPO = "repo-os/repoos";

/**
 * The directory containing cli/, core/, server/, ui/, .build-info.json — dist/
 * in a source checkout, or the whole install root for a standalone install.
 * Exported so the server's install detection starts from the same root.
 */
export function installRoot(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * The version in the install's own `.build-info.json`, or null when there is
 * none — the same read `cmdUpgrade` uses. Exported so the server's install
 * detection passes identical input to `upgradeInstruction` and never disagrees
 * with the CLI on the same checkout (#1073 review).
 */
export function readInstallVersion(root: string): string | null {
  try {
    const info = JSON.parse(readFileSync(join(root, ".build-info.json"), "utf8")) as {
      version?: string;
    };
    return info.version ?? null;
  } catch {
    return null;
  }
}

export interface PackageManagerUpgrade {
  label: string;
  command: string;
}

/** How this RepoOS was installed, as far as `repoos upgrade` can tell (#1073). */
export type InstallKind = "standalone" | "source" | "package-manager";

/** The upgrade instruction a user should run, and how we decided it. */
export interface UpgradeInstruction {
  installKind: InstallKind;
  /** Package-manager label (e.g. "Homebrew") — only set for `package-manager`. */
  packageManager: string | null;
  /** The exact command/instruction, ready to copy into a terminal. */
  command: string;
}

/** The command shown for a source checkout — the same one `repoos upgrade` prints. */
export const SOURCE_UPGRADE_COMMAND = "git pull && bun install && bun run build";

/**
 * Whether `root` is a source checkout's build output rather than a standalone
 * install (#1073 review).
 *
 * The version alone cannot tell them apart: `scripts/copy-assets.mjs` writes
 * `package.json`'s version into `dist/.build-info.json` on every source build,
 * so a built checkout looks exactly like a curl install. The reliable signal is
 * structure: a checkout's install root is `<repo>/dist` (or `<repo>/src` for a
 * `bun src/...` run), and its parent holds `src/` + `package.json`, or a `.git`
 * directory. A standalone install's parent holds neither.
 */
export function isSourceCheckout(root: string): boolean {
  const parent = dirname(root);
  try {
    if (existsSync(join(parent, ".git"))) return true;
    return existsSync(join(parent, "src")) && existsSync(join(parent, "package.json"));
  } catch {
    return false;
  }
}

/**
 * The prerelease channel a version belongs to (`0.6.0-beta.1` → `"beta"`), or
 * null for a stable version. Release tags carry the channel as the prerelease
 * identifier, so an installed channel build is how the update dialog knows to
 * offer `repoos upgrade --channel <name>` (docs/releases.md).
 */
export function channelFromVersion(version: string | null): string | null {
  if (!version) return null;
  const match = version.trim().match(/^\d+\.\d+\.\d+-([A-Za-z]+)\./);
  return match ? match[1] : null;
}

/**
 * The install instruction for a checkout, matching `cmdUpgrade`'s own
 * detection so the dashboard dialog and the CLI never disagree (#1073).
 * Pure and exported: the server calls it to fill `upgradeCommand` /
 * `installKind` on `GET /api/release/available`, and #1072 reuses it.
 *
 * Detection order mirrors `cmdUpgrade`:
 *   1. a recognized package-manager path → that manager's update command;
 *   2. a source checkout (`isSourceCheckout`) or no `.build-info.json`
 *      (`version` is null) → the source-checkout command;
 *   3. otherwise → standalone (curl) install, with the channel form when the
 *      installed version is a prerelease.
 *
 * `sourceCheckout` overrides the filesystem probe for tests; production callers
 * omit it.
 */
export function upgradeInstruction(input: {
  installRoot: string;
  version: string | null;
  channel?: string | null;
  sourceCheckout?: boolean;
}): UpgradeInstruction {
  const packageManager = packageManagerUpgrade(input.installRoot);
  if (packageManager) {
    return {
      installKind: "package-manager",
      packageManager: packageManager.label,
      command: packageManager.command,
    };
  }
  const source = input.sourceCheckout ?? isSourceCheckout(input.installRoot);
  if (source || input.version === null) {
    return { installKind: "source", packageManager: null, command: SOURCE_UPGRADE_COMMAND };
  }
  const channel = input.channel ?? null;
  return {
    installKind: "standalone",
    packageManager: null,
    command: channel ? `repoos upgrade --channel ${channel}` : "repoos upgrade",
  };
}

/**
 * Infer the package manager from the installed package path. `root` is the
 * compiled dist/ directory, so it keeps enough of the global-install path to
 * distinguish Homebrew, mise, Bun, pnpm, and npm.
 */
export function packageManagerUpgrade(root: string): PackageManagerUpgrade | null {
  const path = root.replaceAll("\\", "/");
  if (/(^|\/)(?:opt\/homebrew|homebrew|linuxbrew)\/Cellar\/repoos\//.test(path)) {
    return {
      label: "Homebrew",
      command: "brew update && brew upgrade repo-os/tap/repoos",
    };
  }
  if (/(^|\/)(?:\.mise|mise)\/installs\//.test(path)) {
    return { label: "mise", command: "mise upgrade npm:@repo-os/repoos" };
  }
  if (/(^|\/)\.bun(?:\/|$)|\/bun\/install\/global\//.test(path)) {
    return { label: "Bun", command: "bun update -g @repo-os/repoos" };
  }
  if (/(^|\/)pnpm\/global\//.test(path)) {
    return { label: "pnpm", command: "pnpm update -g @repo-os/repoos" };
  }
  if (/(^|\/)node_modules\//.test(path)) {
    return { label: "npm", command: "npm update -g @repo-os/repoos" };
  }
  return null;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}
export interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
  prerelease?: boolean;
  html_url?: string;
  /** GitHub release body — the notes authored in the "Cut a release" modal (#0361), when set. */
  body?: string | null;
}

/**
 * The release notes to print after an upgrade, or null when there's nothing
 * to show — GitHub returns `body` as `null`/absent for a release cut with an
 * empty notes field (#0361's UI leaves the field optional), and this must
 * stay silent then, not print an empty line or "no notes available" filler.
 */
export function releaseNotesToPrint(body: string | null | undefined): string | null {
  const trimmed = body?.trim();
  return trimmed ? trimmed : null;
}

/** `--channel beta|canary|rc` from argv, or null for the default stable channel. */
function parseChannel(args: string[]): string | null {
  const flag = args.indexOf("--channel");
  const value = flag !== -1 ? args[flag + 1] : undefined;
  return value && !value.startsWith("--") ? value : null;
}

/**
 * `GET /releases/latest` always excludes prereleases (GitHub's own rule, not
 * configurable) — release.yml marks any tag with a "-" (v0.6.0-beta.1,
 * -canary.N, -rc.N) as a prerelease, exactly so stable users never get handed
 * one from this endpoint. A channel opt-in has to use the list endpoint
 * instead and find its own match.
 *
 * Exported so the update dialog's banner (#1073) compares against exactly the
 * release `repoos upgrade --channel <name>` would install.
 */
export async function fetchLatestRelease(
  channel: string | null,
  signal?: AbortSignal,
): Promise<Release> {
  if (!channel) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { signal });
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    return (await res.json()) as Release;
  }
  // Newest first by default; the first tag matching "-<channel>." wins.
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { signal });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  const releases = (await res.json()) as Release[];
  const match = releases.find((r) => r.tag_name.includes(`-${channel}.`));
  if (!match) throw new Error(`No "${channel}" release found in the last 30 releases.`);
  return match;
}

export async function cmdUpgrade(args: string[]): Promise<void> {
  const root = installRoot();
  const channel = parseChannel(args);

  const instruction = upgradeInstruction({
    installRoot: root,
    version: readInstallVersion(root),
    channel,
  });
  if (instruction.installKind === "package-manager") {
    console.log(c.yellow(`  repoos was installed with ${instruction.packageManager}.`));
    console.log(c.dim("  Update it with:"));
    console.log(c.dim(`    ${instruction.command}`));
    if (channel) {
      console.log(c.dim(`  --channel ${channel} only applies to standalone curl installs.`));
    }
    return;
  }
  if (instruction.installKind === "source") {
    console.log(
      c.yellow("  repoos appears to be running from a source checkout, not a standalone install."),
    );
    console.log(c.dim(`  Update it with: ${instruction.command}`));
    return;
  }

  const current = readInstallVersion(root)!;
  console.log(c.dim(`  Current version: v${current}`));
  console.log(
    c.dim(channel ? `  Checking latest "${channel}" release…` : "  Checking latest release…"),
  );

  let release: Release;
  try {
    release = await fetchLatestRelease(channel);
  } catch (e) {
    console.error(c.red("  Failed to check for updates: " + (e as Error).message));
    process.exitCode = 1;
    return;
  }

  const latest = release.tag_name.replace(/^v/, "");
  if (latest === current) {
    console.log(c.green(`  Already up to date (v${current}).`));
    return;
  }

  const asset = release.assets.find((a) => a.name === "repoos-dist.tar.gz");
  if (!asset) {
    console.error(c.red(`  No repoos-dist.tar.gz asset found on release v${latest}.`));
    process.exitCode = 1;
    return;
  }

  console.log(c.dim(`  Upgrading v${current} → v${latest}…`));

  // Do all the work in siblings of the install root, never in the system temp
  // dir: `/tmp` is often a small tmpfs (or has a per-user quota — Omarchy sets
  // one), and a multi-MB download there fails with `curl: (23)`. Siblings of
  // `root` are on the same filesystem as the install, so there's space and the
  // final swap is a plain rename.
  const work = `${root}.upgrade-download`;
  const staged = `${root}.upgrade-staged`;
  const displaced = `${root}.upgrade-old`;
  for (const dir of [work, staged, displaced]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(work, { recursive: true });
  const tmpTar = join(work, "repoos-dist.tar.gz");
  try {
    execFileSync("curl", ["-fsSL", asset.browser_download_url, "-o", tmpTar], { stdio: "inherit" });

    mkdirSync(staged, { recursive: true });
    execFileSync("tar", ["-xzf", tmpTar, "-C", staged]);
    execFileSync("chmod", ["+x", join(staged, "cli", "index.js")]);

    renameSync(root, displaced);
    try {
      renameSync(staged, root);
    } catch (e) {
      renameSync(displaced, root);
      throw e;
    }
    rmSync(displaced, { recursive: true, force: true });
  } finally {
    rmSync(work, { recursive: true, force: true });
    if (existsSync(staged)) rmSync(staged, { recursive: true, force: true });
  }

  regenerateLauncher(root);

  console.log(c.green(`  Upgraded to v${latest}.`));
  const notes = releaseNotesToPrint(release.body);
  if (notes) {
    console.log("");
    console.log(notes);
  }
}

/**
 * Rewrite the `repoos` launcher script install.sh created, so an existing
 * curl install picks up launcher-level fixes (e.g. the Bun-first runtime
 * choice) without needing to re-run install.sh. Silent
 * no-op if the launcher isn't where install.sh puts it — e.g. a custom setup
 * that symlinks straight to cli/index.js instead.
 */
function regenerateLauncher(root: string): void {
  const binDir = process.env.REPOOS_BIN_DIR || join(homedir(), ".local", "bin");
  const launcherPath = join(binDir, "repoos");
  if (!existsSync(launcherPath)) return;
  try {
    writeFileSync(launcherPath, launcherScript(join(root, "cli", "index.js")));
    chmodSync(launcherPath, 0o755);
  } catch {
    // Best-effort — an upgrade that fails to touch the launcher isn't worth failing over.
  }
}
