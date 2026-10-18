import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../core/config.js";
import {
  scheduleHostileReason,
  shouldRunScheduledTaskAutomation,
} from "../../server/schedule-automation.js";

describe("schedule automation guards", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("defaults to off and refuses automation until enabled on the control plane", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-sched-guard-"));
    mkdirSync(join(root, ".git"), { recursive: true });
    const config = loadConfig(root);
    expect(config.scheduledTasks?.enabled).toBe(false);
    expect(shouldRunScheduledTaskAutomation(config, {}, 7171)).toBe(false);

    config.scheduledTasks = { enabled: true };
    expect(shouldRunScheduledTaskAutomation(config, {}, 7171)).toBe(true);
  });

  it("blocks preview children, preview overrides, linked worktrees, and ephemeral ports", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-sched-guard-"));
    const mainGit = join(root, "main");
    mkdirSync(join(mainGit, ".git"), { recursive: true });
    const wt = join(root, "wt");
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(wt, ".git"), `gitdir: ${join(mainGit, ".git", "worktrees", "wt")}\n`);
    mkdirSync(join(mainGit, ".git", "worktrees", "wt"), { recursive: true });

    const mainConfig = loadConfig(mainGit);
    mainConfig.scheduledTasks = { enabled: true };

    expect(scheduleHostileReason(mainConfig, { REPOOS_PREVIEW_CHILD: "1" }, 7171)).toBe(
      "preview-child",
    );
    mainConfig.previewOverrides = ["auth.enabled"];
    expect(scheduleHostileReason(mainConfig, {}, 7171)).toBe("preview-overrides");
    mainConfig.previewOverrides = [];

    const wtConfig = loadConfig(wt);
    wtConfig.scheduledTasks = { enabled: true };
    expect(scheduleHostileReason(wtConfig, {}, 7171)).toBe("linked-worktree");
    expect(shouldRunScheduledTaskAutomation(wtConfig, {}, 7171)).toBe(false);

    expect(scheduleHostileReason(mainConfig, {}, 0)).toBe("ephemeral-port");
    expect(shouldRunScheduledTaskAutomation(mainConfig, { VITEST: "true" }, 7171)).toBe(false);
  });
});
