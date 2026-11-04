import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { afterEach } from "vitest";
import { launcherScript } from "../../commands/upgrade.js";
import { standaloneUninstallPlan } from "../../commands/uninstall.js";
import { classifyMachineState, defaultStandaloneInstallDir } from "../../core/install-layout.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(installDir?: string): {
  home: string;
  installDir: string;
  binDir: string;
  entry: string;
} {
  const home = mkdtempSync(join(tmpdir(), "repoos-uninstall-"));
  dirs.push(home);
  const resolved = installDir ?? defaultStandaloneInstallDir(home);
  const binDir = join(home, ".local", "bin");
  const entry = join(resolved, "cli", "index.js");
  mkdirSync(join(resolved, "cli"), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(entry, "// standalone entry\n");
  return { home, installDir: resolved, binDir, entry };
}

describe("install.sh layout", () => {
  const script = readFileSync(new URL("../../../install.sh", import.meta.url), "utf8");

  it("installs outside ~/.repoos and refuses Node older than 20.6", () => {
    expect(script).toContain('INSTALL_DIR="${REPOOS_INSTALL_DIR:-$HOME/.local/share/repoos}"');
    expect(script).not.toContain('rm -rf "$STATE_DIR"\n');
    expect(script).toContain("p[0]===20&&(p[1]>6||(p[1]===6))");
    expect(script).toContain("| bash");
    expect(script).not.toContain("| sh`");
  });
});

describe("standaloneUninstallPlan", () => {
  it("selects the standalone runtime and its matching launcher", () => {
    const { home, installDir, binDir, entry } = fixture();
    const launcher = join(binDir, "repoos");
    writeFileSync(launcher, launcherScript(entry));

    expect(standaloneUninstallPlan(entry, home, binDir)).toEqual({
      installDir,
      legacyCombined: false,
      launcherPath: launcher,
      stateDir: join(home, ".repoos"),
    });
  });

  it("recognizes a legacy install that still lives in ~/.repoos", () => {
    const home = mkdtempSync(join(tmpdir(), "repoos-uninstall-"));
    dirs.push(home);
    const installDir = join(home, ".repoos");
    const binDir = join(home, ".local", "bin");
    const entry = join(installDir, "cli", "index.js");
    mkdirSync(join(installDir, "cli"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(entry, "// legacy\n");
    writeFileSync(join(binDir, "repoos"), launcherScript(entry));
    mkdirSync(join(installDir, "servers"), { recursive: true });
    writeFileSync(join(installDir, "notes.txt"), "keep me\n");

    expect(standaloneUninstallPlan(entry, home, binDir)).toMatchObject({
      installDir,
      legacyCombined: true,
      stateDir: installDir,
    });
    expect(classifyMachineState(installDir)).toEqual({
      remove: ["servers"],
      keep: ["notes.txt"],
    });
  });

  it("does not remove a launcher the installer does not own", () => {
    const { home, installDir, binDir, entry } = fixture();
    writeFileSync(join(binDir, "repoos"), "#!/bin/sh\necho custom\n");

    expect(standaloneUninstallPlan(entry, home, binDir)).toEqual({
      installDir,
      legacyCombined: false,
      launcherPath: null,
      stateDir: join(home, ".repoos"),
    });
  });

  it("refuses source and package-manager paths", () => {
    const { home, binDir } = fixture();
    expect(
      standaloneUninstallPlan(join(home, "project", "src", "cli", "index.ts"), home, binDir),
    ).toBeNull();
    expect(
      standaloneUninstallPlan(
        join(home, "node_modules", "@repo-os", "repoos", "dist", "cli", "index.js"),
        home,
        binDir,
      ),
    ).toBeNull();
  });
});
