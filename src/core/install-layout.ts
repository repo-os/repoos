/**
 * Standalone curl install vs machine-wide runtime state.
 *
 * The release tarball used to unpack into `~/.repoos`, which is also where
 * servers, services, check slots, and agent temp dirs live. A reinstall's
 * `rm -rf` then wiped that state. New installs go to
 * `~/.local/share/repoos`. `~/.repoos` stays the state directory.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Top-level names inside `repoos-dist.tar.gz` (`tar -C dist`). */
export const STANDALONE_INSTALL_PAYLOAD = [
  "cli",
  "commands",
  "core",
  "server",
  "ui",
  ".build-info.json",
] as const;

/** Machine state `repoos uninstall` removes. Anything else under `~/.repoos` is reported and kept. */
export const MACHINE_STATE_ENTRIES = [
  "servers",
  "services.json",
  "local-check-slots",
  "agent-run-tmp",
] as const;

export function defaultStandaloneInstallDir(home: string): string {
  return join(home, ".local", "share", "repoos");
}

export function machineStateDir(home: string): string {
  return join(home, ".repoos");
}

export function isStandaloneInstallDir(installDir: string, home: string): boolean {
  return installDir === defaultStandaloneInstallDir(home) || installDir === machineStateDir(home);
}

export function classifyMachineState(stateDir: string): { remove: string[]; keep: string[] } {
  if (!existsSync(stateDir)) return { remove: [], keep: [] };
  const remove: string[] = [];
  const keep: string[] = [];
  for (const name of readdirSync(stateDir)) {
    if ((MACHINE_STATE_ENTRIES as readonly string[]).includes(name)) remove.push(name);
    else if (!(STANDALONE_INSTALL_PAYLOAD as readonly string[]).includes(name)) keep.push(name);
  }
  remove.sort();
  keep.sort();
  return { remove, keep };
}
