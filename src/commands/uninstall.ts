/**
 * `repoos uninstall` — remove a standalone install created by install.sh.
 *
 * This deliberately has a narrow scope. It never removes a source checkout or
 * a package-manager install, and it leaves project data and user configuration
 * alone. Package-manager installs must be removed by their package manager.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { c } from "../cli/colors.js";
import { launcherScript } from "./upgrade.js";

export interface StandaloneUninstallPlan {
  installDir: string;
  launcherPath: string | null;
}

/**
 * Return the files owned by a default curl install, or null for every other
 * kind of execution (source checkout, npm/Bun, custom installation, etc.).
 *
 * The launcher is removed only when its exact contents match the launcher this
 * installation owns. A user's replacement launcher is never deleted.
 */
export function standaloneUninstallPlan(
  entryPath: string,
  home = homedir(),
  binDir = join(home, ".local", "bin"),
): StandaloneUninstallPlan | null {
  const installDir = dirname(dirname(entryPath));
  const expectedInstallDir = join(home, ".repoos");
  if (installDir !== expectedInstallDir || !existsSync(join(installDir, "cli", "index.js"))) {
    return null;
  }

  const launcherPath = join(binDir, "repoos");
  let ownsLauncher = false;
  try {
    ownsLauncher =
      existsSync(launcherPath) &&
      readFileSync(launcherPath, "utf8") === launcherScript(join(installDir, "cli", "index.js"));
  } catch {
    // A launcher we cannot read is not safe to remove.
  }

  return { installDir, launcherPath: ownsLauncher ? launcherPath : null };
}

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("  Remove the standalone RepoOS install? [y/N] "))
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function printPackageManagerRemoval(): void {
  console.log(c.yellow("  repoos was installed via a package manager."));
  console.log(c.dim("  Remove it with the same package manager:"));
  console.log(c.dim("    npm uninstall -g @repo-os/repoos"));
  console.log(c.dim("    bun remove -g @repo-os/repoos"));
  console.log(c.dim("    pnpm remove -g @repo-os/repoos"));
  console.log(c.dim("    mise unuse --global npm:@repo-os/repoos"));
}

function printSourceRemoval(): void {
  console.log(
    c.yellow("  repoos appears to be running from a source checkout, not a standalone install."),
  );
  console.log(
    c.dim(
      "  There is nothing for RepoOS to uninstall. Remove the checkout only if you no longer need it.",
    ),
  );
}

export async function cmdUninstall(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "\n  Usage: repoos uninstall [--yes]\n\n  Remove the default standalone install created by install.sh.\n  Project data and user configuration are left untouched.\n",
    );
    return;
  }

  const entryPath = fileURLToPath(import.meta.url);
  const root = dirname(dirname(entryPath));
  if (root.includes("node_modules")) {
    printPackageManagerRemoval();
    return;
  }

  const plan = standaloneUninstallPlan(entryPath);
  if (!plan) {
    printSourceRemoval();
    return;
  }

  const yes = args.includes("--yes") || args.includes("-y");
  if (!yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error(
        c.red("  Refusing to uninstall without confirmation in a non-interactive terminal."),
      );
      console.error(c.dim("  Re-run with: repoos uninstall --yes"));
      process.exitCode = 1;
      return;
    }
    if (!(await confirm())) {
      console.log(c.dim("  Kept the standalone RepoOS install."));
      return;
    }
  }

  try {
    if (plan.launcherPath) rmSync(plan.launcherPath, { force: true });
    rmSync(plan.installDir, { recursive: true, force: true });
  } catch (e) {
    console.error(c.red("  Failed to remove the standalone install: " + (e as Error).message));
    process.exitCode = 1;
    return;
  }

  console.log(c.green("  Removed the standalone RepoOS install."));
  if (plan.launcherPath) {
    console.log(c.dim(`  Removed launcher: ${plan.launcherPath}`));
  } else {
    console.log(
      c.dim("  Kept ~/.local/bin/repoos because it is not the launcher this install created."),
    );
  }
  console.log(c.dim("  Your RepoOS projects and user configuration were not changed."));
}
