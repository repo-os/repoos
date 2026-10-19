import { describe, expect, it } from "vitest";
import type { RepoOSConfig } from "../../core/types.js";
import {
  isBrowserGateStepName,
  localBrowserGateOffloaded,
  offloadBrowserStepsEnabled,
  REPOOS_BROWSER_STEPS_REMOTE,
} from "../../core/browser-offload.js";

function config(offload: boolean): RepoOSConfig {
  return {
    root: "/tmp",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    remoteValidation: { enabled: true, offloadBrowserSteps: offload },
  };
}

describe("browser offload (#0836)", () => {
  it("is enabled only when remote validation and the flag are on", () => {
    expect(offloadBrowserStepsEnabled(config(true))).toBe(true);
    expect(offloadBrowserStepsEnabled(config(false))).toBe(false);
    expect(
      offloadBrowserStepsEnabled({
        ...config(true),
        remoteValidation: { enabled: false, offloadBrowserSteps: true },
      }),
    ).toBe(false);
  });

  it("skips local browser gate steps when the remote env flag is set", () => {
    expect(localBrowserGateOffloaded({})).toBe(false);
    expect(localBrowserGateOffloaded({ [REPOOS_BROWSER_STEPS_REMOTE]: "1" })).toBe(true);
    expect(isBrowserGateStepName("ui-smoke")).toBe(true);
    expect(isBrowserGateStepName("rendered-contrast")).toBe(true);
    expect(isBrowserGateStepName("tests")).toBe(false);
  });
});
