import { describe, expect, it } from "vitest";
import { commandUsage, renderHelp } from "../cli/help.js";
import { parseCheckArgs } from "./check.js";
import { parseDoctorArgs } from "./doctor.js";
import { parseShotArgs } from "./shot.js";

describe("CLI help usage stays aligned with implemented flags", () => {
  it.each([
    ["check", "--profile", () => parseCheckArgs(["--profile", "fast"]).profile],
    ["check", "-p", () => parseCheckArgs(["-p", "fast"]).profile],
    ["check", "--changed", () => parseCheckArgs(["--changed", "main"]).changed],
    ["check", "--print-plan", () => parseCheckArgs(["--print-plan"]).printPlan],
    ["check", "--fix", () => parseCheckArgs(["--fix"]).fix],
    ["check", "--step", () => parseCheckArgs(["--step", "build"]).steps],
    ["check", "--steps", () => parseCheckArgs(["--steps", "build"]).steps],
    ["check", "--local-tests", () => parseCheckArgs(["--local-tests"]).localTestsOnly],
    ["doctor", "--json", () => parseDoctorArgs(["--json"]).json],
    ["doctor", "--verbose", () => parseDoctorArgs(["--verbose"]).verbose],
    ["doctor", "--probe", () => parseDoctorArgs(["--probe", "cursor"]).probe],
    ["doctor", "--model", () => parseDoctorArgs(["--model", "model-id"]).model],
    ["doctor", "--yes", () => parseDoctorArgs(["--yes"]).yes],
    ["doctor", "--binary", () => parseDoctorArgs(["--binary", "/bin/tool"]).binary],
    ["shot", "--target", () => parseShotArgs(["--target", "default"]).target],
    ["shot", "--selector", () => parseShotArgs(["--selector", "body"]).selector],
    ["shot", "--env", () => parseShotArgs(["--env", "MODE=test"]).env],
    ["shot", "--glob", () => parseShotArgs(["--glob", "src/**/*.ts"]).glob],
    ["shot", "--task", () => parseShotArgs(["--task", "1"]).taskId],
    ["shot", "--base", () => parseShotArgs(["--base", "main"]).base],
    ["shot", "--wait", () => parseShotArgs(["--wait", "10"]).waitMsExplicit],
    ["shot", "--viewport", () => parseShotArgs(["--viewport", "800x600"]).viewportExplicit],
    ["shot", "--full-page", () => parseShotArgs(["--full-page"]).fullPage],
  ] as const)("%s documents parser flag %s in banner and command usage", (command, flag, parse) => {
    expect(parse()).toBeTruthy();
    expect(renderHelp()).toContain(flag);
    expect(commandUsage(command) ?? "").toContain(flag);
  });
});
