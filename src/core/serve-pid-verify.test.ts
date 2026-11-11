import { describe, expect, it } from "vitest";
import { verifyPidServesRepo } from "./serve-pid-verify.js";

/** `ps` stub answering `command=` and `lstart=` for one pid. */
function ps(command: string, lstart: string) {
  return ((_cmd: string, args: string[]) => {
    if (args.includes("command=")) return `${command}\n`;
    if (args.includes("lstart=")) return `${lstart}\n`;
    throw new Error("unexpected");
  }) as never;
}

const ROOT = "/projects/kamrai";
// Installed RepoOS: the parsed root is the install dir, not the project.
const INSTALLED = "/usr/bin/bun /opt/node_modules/repoos/dist/cli/index.js serve --port 7272";

describe("verifyPidServesRepo (#1091)", () => {
  it("rejects an installed-RepoOS serve without a lock proof", () => {
    expect(verifyPidServesRepo(42, ROOT, ps(INSTALLED, "Wed Nov 12 05:00:00 2026"))).toBe(false);
  });

  it("accepts it when the lock started after the process (lock is the ownership proof)", () => {
    const lock = new Date("Wed Nov 12 05:00:30 2026").toISOString();
    expect(verifyPidServesRepo(42, ROOT, ps(INSTALLED, "Wed Nov 12 05:00:00 2026"), lock)).toBe(
      true,
    );
  });

  it("rejects a recycled pid: the process started long after the lock was written", () => {
    const lock = new Date("Wed Nov 12 03:00:00 2026").toISOString();
    expect(verifyPidServesRepo(42, ROOT, ps(INSTALLED, "Wed Nov 12 05:00:00 2026"), lock)).toBe(
      false,
    );
  });

  it("rejects a non-serve process even with a matching lock time", () => {
    const lock = new Date("Wed Nov 12 05:00:30 2026").toISOString();
    expect(
      verifyPidServesRepo(42, ROOT, ps("/usr/bin/vim notes.txt", "Wed Nov 12 05:00:00 2026"), lock),
    ).toBe(false);
  });

  it("accepts a bare `repoos serve` shim with the lock proof", () => {
    const lock = new Date("Wed Nov 12 05:00:30 2026").toISOString();
    expect(
      verifyPidServesRepo(
        42,
        ROOT,
        ps("repoos serve --port 7272", "Wed Nov 12 05:00:00 2026"),
        lock,
      ),
    ).toBe(true);
  });

  it("still accepts a command line whose root parses to this repo", () => {
    const cmd = `/usr/bin/bun ${ROOT}/dist/cli/index.js serve --port 7272`;
    expect(verifyPidServesRepo(42, ROOT, ps(cmd, "Wed Nov 12 05:00:00 2026"))).toBe(true);
  });
});
