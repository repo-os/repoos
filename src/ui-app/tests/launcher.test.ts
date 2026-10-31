/**
 * The `repoos` launcher a curl install puts on PATH. install.sh writes it with
 * a shell heredoc and `repoos upgrade` regenerates it from launcherScript(), so
 * the two must stay identical. It must pick Bun when it's installed and Node
 * otherwise, deciding each time `repoos` runs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import {
  launcherScript,
  launcherScriptInstallShHeredoc,
  LAUNCHER_RUNTIME_PROBE_SUMMARY,
} from "../../core/launcher-runtime.js";
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

function realNodeBinary(): string | null {
  if (!REAL_NODE_PATH) return null;
  const dir = REAL_NODE_PATH.split(delimiter)[0];
  return dir ? join(dir, "node") : null;
}

const STRIPPED_PATH = "/usr/bin:/bin";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-launcher-"));
  dirs.push(d);
  return d;
}

function extractInstallShLauncherHeredoc(): string {
  const src = readFileSync(join(ROOT, "install.sh"), "utf8");
  const m = /^cat > "\$BIN_DIR\/repoos" <<EOF\n([\s\S]*?)EOF$/m.exec(src);
  if (!m) throw new Error("launcher heredoc not found in install.sh");
  return m[1];
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
  it("install.sh heredoc matches launcherScriptInstallShHeredoc()", () => {
    expect(extractInstallShLauncherHeredoc()).toBe(launcherScriptInstallShHeredoc());
  });

  it("install.sh and launcherScript() write the same script", () => {
    const d = tmp();
    const installDir = join(d, "install");
    expect(renderInstallShLauncher(installDir, d)).toBe(
      launcherScript(join(installDir, "cli", "index.js")),
    );
  });

  describe("runtime choice", () => {
    function fixtureEntry(root: string): string {
      const entry = join(root, "cli", "index.js");
      mkdirSync(join(root, "cli"), { recursive: true });
      writeFileSync(
        entry,
        'console.log(typeof process.versions.bun === "string" ? "bun" : "node");\n',
      );
      return entry;
    }

    function launchWith(entry: string, launcherDir: string, env: Record<string, string>): string {
      const launcher = join(launcherDir, "repoos");
      writeFileSync(launcher, launcherScript(entry));
      chmodSync(launcher, 0o755);
      const base: NodeJS.ProcessEnv = { ...process.env, PATH: REAL_NODE_PATH ?? process.env.PATH };
      delete base.REPOOS_RUNTIME;
      delete base.REPOOS_BUN_PATH;
      return execFileSync(launcher, [], { encoding: "utf8", env: { ...base, ...env } }).trim();
    }

    function launch(env: Record<string, string>): string {
      const d = tmp();
      return launchWith(fixtureEntry(d), d, env);
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

    it.runIf(realNodeBinary() !== null)("finds mise node when PATH is stripped", () => {
      const node = realNodeBinary()!;
      const d = tmp();
      const home = join(d, "home");
      const installRoot = join(home, ".repoos");
      const entry = fixtureEntry(installRoot);
      const shims = join(home, ".local/share/mise/shims");
      mkdirSync(shims, { recursive: true });
      cpSync(node, join(shims, "node"));
      expect(
        launchWith(entry, d, { HOME: home, PATH: STRIPPED_PATH, REPOOS_RUNTIME: "node" }),
      ).toBe("node");
    });

    function nvmNodeFixture(
      home: string,
      node: string,
      layout: {
        defaultAlias: string;
        versionDir: string;
        aliasFiles?: Record<string, string>;
      },
    ): void {
      const nvmDir = join(home, ".nvm");
      mkdirSync(join(nvmDir, "alias"), { recursive: true });
      writeFileSync(join(nvmDir, "alias/default"), `${layout.defaultAlias}\n`);
      for (const [name, target] of Object.entries(layout.aliasFiles ?? {})) {
        const aliasFile = join(nvmDir, "alias", name);
        mkdirSync(dirname(aliasFile), { recursive: true });
        writeFileSync(aliasFile, `${target}\n`);
      }
      const binDir = join(nvmDir, "versions/node", layout.versionDir, "bin");
      mkdirSync(binDir, { recursive: true });
      cpSync(node, join(binDir, "node"));
    }

    it.runIf(realNodeBinary() !== null)(
      "finds nvm default node when the version dir uses a v prefix",
      () => {
        const node = realNodeBinary()!;
        const d = tmp();
        const home = join(d, "home");
        const entry = fixtureEntry(join(home, ".repoos"));
        nvmNodeFixture(home, node, { defaultAlias: "20.10.0", versionDir: "v20.10.0" });
        expect(
          launchWith(entry, d, { HOME: home, PATH: STRIPPED_PATH, REPOOS_RUNTIME: "node" }),
        ).toBe("node");
      },
    );

    it.runIf(realNodeBinary() !== null)("finds nvm default through an lts alias hop", () => {
      const node = realNodeBinary()!;
      const d = tmp();
      const home = join(d, "home");
      const entry = fixtureEntry(join(home, ".repoos"));
      nvmNodeFixture(home, node, {
        defaultAlias: "lts/iron",
        versionDir: "v20.10.0",
        aliasFiles: { "lts/iron": "20.10.0" },
      });
      expect(
        launchWith(entry, d, { HOME: home, PATH: STRIPPED_PATH, REPOOS_RUNTIME: "node" }),
      ).toBe("node");
    });

    it.runIf(resolveBun() !== null)("finds ~/.bun/bin/bun when PATH is stripped", () => {
      const bun = resolveBun()!;
      const d = tmp();
      const home = join(d, "home");
      const installRoot = join(home, ".repoos");
      const entry = fixtureEntry(installRoot);
      const bunDir = join(home, ".bun/bin");
      mkdirSync(bunDir, { recursive: true });
      cpSync(bun, join(bunDir, "bun"));
      expect(launchWith(entry, d, { HOME: home, PATH: STRIPPED_PATH })).toBe("bun");
    });

    it("documents an actionable error when no runtime is found", () => {
      const script = launcherScript(join(tmp(), "cli", "index.js"));
      expect(script).toContain("no JavaScript runtime found");
      for (const line of LAUNCHER_RUNTIME_PROBE_SUMMARY) {
        expect(script).toContain(line);
      }
      expect(script).toMatch(/exit 1\n$/);
    });

    it("exits non-zero with probe list on stderr when no runtime exists", () => {
      const d = tmp();
      const home = join(d, "home");
      mkdirSync(home);
      const emptyPath = join(d, "empty-path");
      mkdirSync(emptyPath);
      const entry = fixtureEntry(join(home, ".repoos"));
      const launcher = join(d, "repoos");
      writeFileSync(launcher, launcherScript(entry));
      chmodSync(launcher, 0o755);
      let stderr = "";
      let status = 0;
      try {
        execFileSync("/bin/bash", [launcher], {
          env: { HOME: home, PATH: emptyPath, REPOOS_RUNTIME: "node" },
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { status?: number; stderr?: Buffer };
        status = e.status ?? 1;
        stderr = e.stderr?.toString() ?? "";
      }
      expect(status).not.toBe(0);
      expect(stderr).toContain("no JavaScript runtime found");
      expect(stderr).toContain(LAUNCHER_RUNTIME_PROBE_SUMMARY[3]);
    });
  });
});
