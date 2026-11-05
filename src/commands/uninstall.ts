/**
 * `repoos uninstall` — remove a standalone install created by install.sh.
 *
 * Removes the install directory (`~/.local/share/repoos`, or a legacy
 * `~/.repoos` payload) and the machine state entries RepoOS created there.
 * Per-repo files (`repoos.toml`, a repo's `.repoos/` cache) are not touched.
 * A package-manager install is not deleted; the command names the package
 * manager command and any machine state that remains.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { c } from "../cli/colors.js";
import {
  STANDALONE_INSTALL_PAYLOAD,
  classifyMachineState,
  isStandaloneInstallDir,
  machineStateDir,
} from "../core/install-layout.js";
import { launcherScript, packageManagerUpgrade } from "./upgrade.js";

export interface StandaloneUninstallPlan {
  installDir: string;
  /** True when the tarball was unpacked into the state directory (pre-split installs). */
  legacyCombined: boolean;
  launcherPath: string | null;
  stateDir: string;
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
  if (
    !isStandaloneInstallDir(installDir, home) ||
    !existsSync(join(installDir, "cli", "index.js"))
  ) {
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

  const stateDir = machineStateDir(home);
  return {
    installDir,
    legacyCombined: installDir === stateDir,
    launcherPath: ownsLauncher ? launcherPath : null,
    stateDir,
  };
}

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question("  Remove the standalone RepoOS install and its machine state? [y/N] ")
    )
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function printPackageManagerRemoval(home: string): void {
  console.log(c.yellow("  repoos was installed via a package manager."));
  console.log(c.dim("  Remove the package with the same package manager:"));
  console.log(c.dim("    npm uninstall -g @repo-os/repoos"));
  console.log(c.dim("    bun remove -g @repo-os/repoos"));
  console.log(c.dim("    pnpm remove -g @repo-os/repoos"));
  console.log(c.dim("    brew uninstall repoos"));
  console.log(
    c.dim("  mise is not a supported install method. If you used it anyway, remove the shim with:"),
  );
  console.log(c.dim("    mise unuse --global npm:@repo-os/repoos && mise prune"));
  const stateDir = machineStateDir(home);
  const { remove, keep } = classifyMachineState(stateDir);
  if (remove.length === 0 && keep.length === 0 && !existsSync(join(stateDir, "cli", "index.js"))) {
    console.log(c.dim("  No machine state was found in ~/.repoos."));
    return;
  }
  console.log(c.dim("  This command did not delete machine state. Still on disk:"));
  for (const name of remove) console.log(c.dim(`    ${join(stateDir, name)}`));
  for (const name of keep) console.log(c.dim(`    ${join(stateDir, name)}`));
  if (existsSync(join(stateDir, "cli", "index.js"))) {
    console.log(c.dim(`    ${join(stateDir, "cli")} (legacy install payload)`));
  }
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

function removeStandalone(plan: StandaloneUninstallPlan): {
  removedState: string[];
  keptState: string[];
} {
  if (plan.launcherPath) rmSync(plan.launcherPath, { force: true });
  if (plan.legacyCombined) {
    for (const name of STANDALONE_INSTALL_PAYLOAD) {
      rmSync(join(plan.installDir, name), { recursive: true, force: true });
    }
  } else {
    rmSync(plan.installDir, { recursive: true, force: true });
    for (const name of STANDALONE_INSTALL_PAYLOAD) {
      rmSync(join(plan.stateDir, name), { recursive: true, force: true });
    }
  }
  const { remove, keep } = classifyMachineState(plan.stateDir);
  const removedState: string[] = [];
  for (const name of remove) {
    rmSync(join(plan.stateDir, name), { recursive: true, force: true });
    removedState.push(name);
  }
  if (existsSync(plan.stateDir) && readdirSync(plan.stateDir).length === 0) {
    rmSync(plan.stateDir, { recursive: true, force: true });
  }
  return { removedState, keptState: keep };
}

export async function cmdUninstall(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "\n  Usage: repoos uninstall [--yes]\n\n  Remove the standalone install created by install.sh (~/.local/share/repoos,\n  or a legacy ~/.repoos payload) and machine state under ~/.repoos\n  (servers, services.json, local-check-slots, agent-run-tmp).\n  Other files in ~/.repoos are listed and left in place.\n  Per-repo files are not removed. A package-manager install is not deleted;\n  the command prints that package manager's uninstall and any state left behind.\n",
    );
    return;
  }

  const entryPath = fileURLToPath(import.meta.url);
  const root = dirname(dirname(entryPath));
  if (packageManagerUpgrade(root)) {
    printPackageManagerRemoval(homedir());
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
      console.log(c.dim("  Kept the standalone RepoOS install and machine state."));
      return;
    }
  }

  let removed: { removedState: string[]; keptState: string[] };
  try {
    removed = removeStandalone(plan);
  } catch (e) {
    console.error(c.red("  Failed to remove the standalone install: " + (e as Error).message));
    process.exitCode = 1;
    return;
  }

  console.log(c.green(`  Removed the standalone RepoOS install at ${plan.installDir}.`));
  if (plan.launcherPath) {
    console.log(c.dim(`  Removed launcher: ${plan.launcherPath}`));
  } else {
    console.log(
      c.dim("  Kept ~/.local/bin/repoos because it is not the launcher this install created."),
    );
  }
  if (removed.removedState.length > 0) {
    console.log(c.dim("  Removed machine state:"));
    for (const name of removed.removedState) {
      console.log(c.dim(`    ${join(plan.stateDir, name)}`));
    }
  } else {
    console.log(c.dim("  No RepoOS machine state entries were present under ~/.repoos."));
  }
  if (removed.keptState.length > 0) {
    console.log(c.dim("  Left these entries in ~/.repoos (not created by RepoOS):"));
    for (const name of removed.keptState) console.log(c.dim(`    ${join(plan.stateDir, name)}`));
  }
  console.log(
    c.dim("  Per-repo files were not removed (repoos.toml and each repo's .repoos/ directory)."),
  );
}
