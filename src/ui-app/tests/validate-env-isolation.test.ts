/**
 * Keeps the test-worker cleanup list in sync with the remote runner (#0905).
 *
 * `scripts/remote-runner/validate.sh` passes a set of REPOOS_* variables into
 * the `repoos-ci` container. A test that spawns `repoos check` inherits them,
 * and a variable that is not cleared changes which branch the check takes — the
 * gate then passes locally and fails only on the runner. The scan below fails
 * when validate.sh gains a new `-e REPOOS_*` line that
 * `tests/setup/validate-injected-env.ts` does not clear.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  VALIDATE_INJECTED_ENV_KEYS,
  clearValidateInjectedEnv,
} from "./setup/validate-injected-env.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const validateScript = readFileSync(
  join(repoRoot, "scripts/remote-runner/validate.sh"),
  "utf8",
);

/** Every `-e REPOOS_...=` the runner hands to the test container. */
function injectedKeys(): string[] {
  return [...validateScript.matchAll(/^\s*-e\s+"?(REPOOS_[A-Z0-9_]+)=/gm)].map(
    (match) => match[1],
  );
}

describe("remote-runner env isolation (#0905)", () => {
  it("clears every REPOOS_* variable validate.sh injects into the container", () => {
    const keys = injectedKeys();
    // Guard the parser too: if validate.sh's shape changes this test must not
    // silently pass by extracting nothing.
    expect(keys).toContain("REPOOS_ROOT");
    expect(keys).toContain("REPOOS_OFFLOAD_BROWSER_STEPS");
    expect(keys).toContain("REPOOS_BROWSER_CAPTURE_MODE");
    for (const key of keys) {
      expect(VALIDATE_INJECTED_ENV_KEYS, `${key} is injected but not cleared`).toContain(key);
    }
  });

  it("deletes the whole injected set", () => {
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      VALIDATE_INJECTED_ENV_KEYS.map((key) => [key, "set"]),
    );
    env.UNRELATED = "keep";
    clearValidateInjectedEnv(env);
    for (const key of VALIDATE_INJECTED_ENV_KEYS) expect(env[key]).toBeUndefined();
    expect(env.UNRELATED).toBe("keep");
  });
});
