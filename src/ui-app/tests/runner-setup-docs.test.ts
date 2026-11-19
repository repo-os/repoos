// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const setupDocs = readFileSync(new URL("../../../docs/remote-validation.md", import.meta.url), "utf8");
const checkDocs = readFileSync(new URL("../../../user-docs/check.md", import.meta.url), "utf8");
const justfile = readFileSync(new URL("../../../justfile", import.meta.url), "utf8");

describe("remote runner setup documentation", () => {
  it("distinguishes the RepoOS service account from the remote SSH account", () => {
    expect(setupDocs).toContain("The RepoOS server's local Unix account is a");
    expect(setupDocs).toContain("that service account needs its own SSH key/config");
    expect(checkDocs).toContain("The `user@host` shown for a runner is the SSH login");
    expect(checkDocs).toContain("not the Unix account running the RepoOS server");
  });

  it("documents setup destinations and privilege requirements from the maintained recipes", () => {
    expect(justfile).toContain("just _setup-runner bee arch");
    expect(justfile).toContain("just _setup-runner thinkpad arch");
    expect(justfile).toContain("just _setup-runner mini macos");
    expect(justfile).toContain("cp ~/.repoos-build/validate-macos.sh ~/.local/bin/repoos-validate");
    expect(setupDocs).toContain("install `/opt/repoos/validate.sh` with `sudo`");
    expect(setupDocs).toContain("`validate-macos.sh` as `~/.local/bin/repoos-validate`");
    expect(setupDocs).toMatch(/non-login\s+SSH environment/);
  });
});
