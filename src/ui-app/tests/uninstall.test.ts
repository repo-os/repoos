import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { afterEach } from "vitest";
import { launcherScript } from "../../commands/upgrade.js";
import { standaloneUninstallPlan } from "../../commands/uninstall.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { home: string; installDir: string; binDir: string; entry: string } {
  const home = mkdtempSync(join(tmpdir(), "repoos-uninstall-"));
  dirs.push(home);
  const installDir = join(home, ".repoos");
  const binDir = join(home, ".local", "bin");
  const entry = join(installDir, "cli", "index.js");
  mkdirSync(join(installDir, "cli"), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(entry, "// standalone entry\n");
  return { home, installDir, binDir, entry };
}

describe("standaloneUninstallPlan", () => {
  it("selects the standalone runtime and its matching launcher", () => {
    const { home, installDir, binDir, entry } = fixture();
    const launcher = join(binDir, "repoos");
    writeFileSync(launcher, launcherScript(entry));

    expect(standaloneUninstallPlan(entry, home, binDir)).toEqual({
      installDir,
      launcherPath: launcher,
    });
  });

  it("does not remove a launcher the installer does not own", () => {
    const { home, installDir, binDir, entry } = fixture();
    writeFileSync(join(binDir, "repoos"), "#!/bin/sh\necho custom\n");

    expect(standaloneUninstallPlan(entry, home, binDir)).toEqual({
      installDir,
      launcherPath: null,
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
