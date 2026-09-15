/**
 * The `repoos` launcher a curl install puts on PATH. install.sh writes it with
 * a shell heredoc and `repoos upgrade` regenerates it from launcherScript(), so
 * the two must stay identical. It must pick Bun when it's installed and Node
 * otherwise, deciding each time `repoos` runs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { launcherScript } from "../../commands/upgrade.js";
import { resolveBun } from "../../core/runtime.js";

const ROOT = resolve(__dirname, "../../..");

/**
 * A PATH whose first `node` is really Node. Under `bun --bun`, Bun puts its own
 * `node` alias at the front of PATH, which would make the launcher's Node
 * fallback run Bun and the Node cases below meaningless. Null when no real
 * Node is installed.
 */
const REAL_NODE_PATH: string | null = (() => {
  const entries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (let i = 0; i < entries.length; i++) {
    const candidate = join(entries[i], "node");
    try {
      const kind = execFileSync(candidate, ["-p", "typeof process.versions.bun"], {
        encoding: "utf8",
        timeout: 10_000,
      }).trim();
      if (kind === "undefined")
        return [entries[i], ...entries.filter((_, j) => j !== i)].join(delimiter);
    } catch {
      /* not here, or not runnable */
    }
  }
  return null;
})();

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-launcher-"));
  dirs.push(d);
  return d;
}

/** Run install.sh's launcher heredoc through a real shell, as the installer does. */
function renderInstallShLauncher(installDir: string, binDir: string): string {
  const src = readFileSync(join(ROOT, "install.sh"), "utf8");
  const heredoc = /^cat > "\$BIN_DIR\/repoos" <<EOF\n[\s\S]*?\nEOF$/m.exec(src);
  if (!heredoc) throw new Error("launcher heredoc not found in install.sh");
  execFileSync("sh", ["-c", heredoc[0]], {
    env: { ...process.env, INSTALL_DIR: installDir, BIN_DIR: binDir },
  });
  return readFileSync(join(binDir, "repoos"), "utf8");
}

describe("repoos launcher", () => {
  it("install.sh and launcherScript() write the same script", () => {
    const d = tmp();
    const installDir = join(d, "install");
    expect(renderInstallShLauncher(installDir, d)).toBe(
      launcherScript(join(installDir, "cli", "index.js")),
    );
  });

  describe("runtime choice", () => {
    function launch(env: Record<string, string>): string {
      const d = tmp();
      const entry = join(d, "index.js");
      writeFileSync(
        entry,
        'console.log(typeof process.versions.bun === "string" ? "bun" : "node");\n',
      );
      const launcher = join(d, "repoos");
      writeFileSync(launcher, launcherScript(entry));
      chmodSync(launcher, 0o755);
      const base: NodeJS.ProcessEnv = { ...process.env, PATH: REAL_NODE_PATH ?? process.env.PATH };
      delete base.REPOOS_RUNTIME;
      delete base.REPOOS_BUN_PATH;
      return execFileSync(launcher, [], { encoding: "utf8", env: { ...base, ...env } }).trim();
    }

    it.runIf(REAL_NODE_PATH !== null)("pins Node with REPOOS_RUNTIME=node", () => {
      expect(launch({ REPOOS_RUNTIME: "node" })).toBe("node");
    });

    it.runIf(REAL_NODE_PATH !== null)("falls back to Node when the Bun path doesn't exist", () => {
      expect(launch({ REPOOS_BUN_PATH: "/nonexistent/bun" })).toBe("node");
    });

    it.runIf(resolveBun() !== null)("uses Bun when it's installed", () => {
      expect(launch({})).toBe("bun");
    });
  });
});
