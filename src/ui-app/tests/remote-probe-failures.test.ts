/**
 * #1256 — Test connection failures for remote runners. `describeHostProbeFailure`
 * turns one host's failed prerequisite probe into a plain-English cause and the
 * next step. Table-driven: the rows use the probe's own fixed messages (taken
 * from `prereqProbeCommand`) and ssh's stderr, so a wording change in either
 * fails here instead of quietly falling back to the generic line.
 */
import { describe, expect, it } from "vitest";
import { describeHostProbeFailure, prereqProbeCommand } from "../../server/remote-validation.js";

const host = { host: "mac1", user: "nick" };

interface Row {
  name: string;
  run: { code: number | null; output: string; timedOut?: boolean };
  cause: RegExp;
  next: RegExp;
}

const rows: Row[] = [
  {
    name: "host does not answer within the probe timeout",
    run: { code: null, output: "", timedOut: true },
    cause: /mac1 did not answer within 15 seconds/,
    next: /awake and connected to Tailscale/,
  },
  {
    name: "wrong SSH user (publickey refused)",
    run: { code: 255, output: "nick@mac1: Permission denied (publickey)." },
    cause: /SSH refused the login as nick@mac1/,
    next: /SSH user for mac1 in repoos\.toml.*authorized_keys/,
  },
  {
    name: "host name does not resolve",
    run: {
      code: 255,
      output: "ssh: Could not resolve hostname mac1: nodename nor servname provided",
    },
    cause: /mac1 is not a name this machine can resolve/,
    next: /100\.x\.x\.x Tailscale address/,
  },
  {
    name: "connection refused",
    run: { code: 255, output: "ssh: connect to host 100.64.0.2 port 22: Connection refused" },
    cause: /mac1 did not accept an SSH connection/,
    next: /running SSH/,
  },
  {
    name: "connection timed out at the network layer",
    run: { code: 255, output: "ssh: connect to host mac1 port 22: Operation timed out" },
    cause: /did not accept an SSH connection/,
    next: /Then Test again/,
  },
  {
    name: "git missing from PATH",
    run: { code: 1, output: "git not found on PATH" },
    cause: /git is not installed on mac1, or is not on its login PATH/,
    next: /Install git on that machine/,
  },
  {
    name: "docker missing from PATH",
    run: { code: 1, output: "docker not found on PATH" },
    cause: /Docker is not installed on mac1/,
    next: /Install docker on that machine/,
  },
  {
    name: "docker installed but the daemon is stopped",
    run: { code: 1, output: "docker daemon not reachable (is docker running?)" },
    cause: /Docker is installed on mac1 but is not running/,
    next: /Start Docker on that machine/,
  },
  {
    name: "native host missing bun on the login PATH",
    run: { code: 1, output: "bun not found on login PATH" },
    cause: /bun is not installed on mac1/,
    next: /Install bun/,
  },
  {
    name: "runner image not pulled or built",
    run: {
      code: 1,
      output: "image 'repoos-ci' not found — build it or fix remoteValidation.containerImage",
    },
    cause: /runner image is not on mac1/,
    next: /containerImage/,
  },
  {
    name: "runner image is missing a required tool",
    run: { code: 1, output: "one or more required tools are unavailable in runner image" },
    cause: /runner image on mac1 is missing a required tool/,
    next: /Rebuild the runner image/,
  },
  {
    name: "bun cache directory is not writable",
    run: { code: 1, output: "bun cache dir $HOME/.cache/repoos-bun is not writable" },
    cause: /Bun cache on mac1 is not writable/,
    next: /permissions/,
  },
  {
    name: "unrecognised failure keeps a generic line and points at the details",
    run: { code: 3, output: "something unexpected" },
    cause: /setup check failed on mac1/,
    next: /Read the details below/,
  },
  {
    // Regression for the review: the remote `touch` prints a bare "Permission
    // denied" before the probe's own cache message. That is a cache problem,
    // not a login problem.
    name: "unwritable Bun cache with a remote 'Permission denied' line is a cache problem",
    run: {
      code: 1,
      output:
        "touch: /home/nick/.cache/repoos-bun/.repoos-probe: Permission denied\nbun cache dir $HOME/.cache/repoos-bun is not writable",
    },
    cause: /Bun cache on mac1 is not writable/,
    next: /permissions/,
  },
  {
    name: "docker's own 'permission denied' socket error is not an SSH login failure",
    run: {
      code: 1,
      output: "docker: permission denied while trying to connect to the Docker daemon socket",
    },
    cause: /setup check failed on mac1/,
    next: /Read the details below/,
  },
  {
    name: "missing runner script",
    run: {
      code: 1,
      output: "missing runner script at /opt/repoos/validate.sh or ~/.local/bin/repoos-validate",
    },
    cause: /runner script is not installed on mac1/,
    next: /per-host install/,
  },
  {
    name: "outdated runner script",
    run: {
      code: 1,
      output:
        "outdated runner script: project command support is required; re-run the per-host install",
    },
    cause: /runner script on mac1 is out of date/,
    next: /Re-run the per-host install/,
  },
];

describe("describeHostProbeFailure (#1256)", () => {
  it.each(rows)("explains $name", ({ run, cause, next }) => {
    const { cause: c, next: n } = describeHostProbeFailure(run, host);
    expect(c).toMatch(cause);
    expect(n).toMatch(next);
  });

  it("never returns an empty cause or next step", () => {
    for (const { run } of rows) {
      const { cause, next } = describeHostProbeFailure(run, host);
      expect(cause.trim().length).toBeGreaterThan(0);
      expect(next.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps the probe's own missing-tool wording matched by the classifier", () => {
    // If the probe's messages change, the rows above stop matching. Assert the
    // probe still prints the phrases the classifier keys on.
    const probe = prereqProbeCommand("docker", "repoos-ci", [], false);
    expect(probe).toContain("docker not found on PATH");
    expect(probe).toContain("git not found on PATH");
    expect(probe).toContain("docker daemon not reachable");
    const native = prereqProbeCommand("native", "repoos-ci", [], false);
    expect(native).toContain("not found on login PATH");
  });
});
