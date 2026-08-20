/**
 * `repoos upgrade` — self-update for standalone (curl-installed) builds.
 * Downloads the latest GitHub release's dist tarball and swaps it into place.
 *
 * Package-manager installs (npm/bun, living under node_modules/) are not
 * touched here — those update through the package manager itself.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { c } from "../cli/colors.js";

const REPO = "repo-os/repoos";

/** The directory containing cli/, core/, server/, ui/, .build-info.json — dist/ in a source checkout, or the whole install root for a standalone install. */
function installRoot(): string {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

function readVersion(root: string): string | null {
  try {
    const info = JSON.parse(readFileSync(join(root, ".build-info.json"), "utf8")) as { version?: string };
    return info.version ?? null;
  } catch {
    return null;
  }
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}
interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

export async function cmdUpgrade(_args: string[]): Promise<void> {
  const root = installRoot();

  if (root.includes("node_modules")) {
    console.log(c.yellow("  repoos was installed via a package manager."));
    console.log(c.dim("  Update it the same way:"));
    console.log(c.dim("    bun update -d repoos") + c.dim("   or   ") + c.dim("npm update repoos"));
    return;
  }

  const current = readVersion(root);
  if (!current) {
    console.log(c.yellow("  repoos appears to be running from a source checkout, not a standalone install."));
    console.log(c.dim("  Update it with: git pull && bun run build"));
    return;
  }

  console.log(c.dim(`  Current version: v${current}`));
  console.log(c.dim("  Checking latest release…"));

  let release: Release;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    release = (await res.json()) as Release;
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

  const tmpTar = join(mkdtempSync(join(tmpdir(), "repoos-upgrade-")), "repoos-dist.tar.gz");
  execFileSync("curl", ["-fsSL", asset.browser_download_url, "-o", tmpTar], { stdio: "inherit" });

  // Extract as a sibling of the install root so the final swap is a same-filesystem
  // rename, not a cross-device copy.
  const staged = `${root}.upgrade-staged`;
  if (existsSync(staged)) rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  execFileSync("tar", ["-xzf", tmpTar, "-C", staged]);
  execFileSync("chmod", ["+x", join(staged, "cli", "index.js")]);

  const displaced = `${root}.upgrade-old`;
  if (existsSync(displaced)) rmSync(displaced, { recursive: true, force: true });
  renameSync(root, displaced);
  try {
    renameSync(staged, root);
  } catch (e) {
    renameSync(displaced, root);
    throw e;
  }
  rmSync(displaced, { recursive: true, force: true });
  rmSync(dirname(tmpTar), { recursive: true, force: true });

  console.log(c.green(`  Upgraded to v${latest}.`));
}
