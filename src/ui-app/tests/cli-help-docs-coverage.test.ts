/**
 * QA pass: CLI help vs user-docs/cli.md (#1228).
 *
 * Every command in the CLI help table must be documented in user-docs/cli.md,
 * so a command cannot be added to `--help` while staying invisible in the
 * docs. Also pins the per-command help/behaviour pairs that previously
 * drifted (check --fix/--step, doctor --model) and the plain-English error
 * rewrites for the most confusing failure modes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GROUPS, renderHelp } from "../../cli/help";
import { nonJsonResponse } from "../../cli/repoos-api";
import { unknownConfigKeyMessage } from "../../commands/control-api";
import { unknownEnvironmentError } from "../../server/routes/project-environments";
import { parseCheckArgs } from "../../commands/check";

const docsPath = join(__dirname, "../../../user-docs/cli.md");
const docs = readFileSync(docsPath, "utf8");

/** `repoos <name>` as a standalone reference (not a longer command's prefix). */
function docsMention(command: string): boolean {
  return new RegExp(`repoos ${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(docs);
}

describe("every CLI help command is documented in user-docs/cli.md", () => {
  it("mentions each command the help table offers", () => {
    const missing: string[] = [];
    for (const group of GROUPS) {
      for (const cmd of group.commands) {
        if (!docsMention(cmd.name)) missing.push(cmd.name);
      }
    }
    expect(missing, `commands in --help but absent from user-docs/cli.md: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents the sub-commands the help table lists", () => {
    for (const sub of ["review again", "review followup", "review keep", "checks timings", "checks slots"]) {
      expect(docsMention(sub), `${sub} should be documented`).toBe(true);
    }
  });
});

describe("per-command help matches the documented flags", () => {
  it("repoos check advertises --fix and --step, which the parser accepts", () => {
    const check = GROUPS.flatMap((g) => g.commands).find((c) => c.name === "check");
    expect(check?.usage).toContain("--fix");
    expect(check?.usage).toContain("--step <name>");
    const opts = parseCheckArgs(["--fix", "--step", "tests"]);
    expect(opts.fix).toBe(true);
    expect(opts.steps).toEqual(["tests"]);
  });

  it("repoos doctor advertises --model for the opt-in --probe run", () => {
    const doctor = GROUPS.flatMap((g) => g.commands).find((c) => c.name === "doctor");
    expect(doctor?.usage).toContain("--model <id>");
    expect(doctor?.flags).toContain("--model <id>");
  });
});

describe("non-JSON API responses read in plain English", () => {
  it("an HTML page (SPA fallback on a wrong /api/ path) becomes a clear message", () => {
    const body = nonJsonResponse("/api/bogus-route", "<!DOCTYPE html>\n<html><body>app</body></html>");
    expect(body.htmlResponse).toBe(true);
    const err = String(body.error);
    expect(err).toContain("/api/bogus-route");
    expect(err).toContain("not a RepoOS API route");
    expect(err).toContain("Check the path for typos");
    expect(err).not.toContain("<!DOCTYPE");
    expect(err.length).toBeLessThan(300);
  });

  it("matches lowercase <html> without a doctype too", () => {
    const body = nonJsonResponse("/api/x", "  <html><body>shell</body></html>");
    expect(body.htmlResponse).toBe(true);
  });

  it("leaves non-HTML text alone as the raw error", () => {
    const body = nonJsonResponse("/api/x", "plain text failure");
    expect(body).toEqual({ error: "plain text failure" });
    expect(body.htmlResponse).toBeUndefined();
  });
});

describe("plain-English rewrites for common CLI errors", () => {
  it("config set on an unknown key names the key and where valid keys live", () => {
    const msg = unknownConfigKeyMessage("bogus.key");
    expect(msg).toContain('Unknown setting "bogus.key"');
    expect(msg).toContain("Settings");
  });

  it("an unknown secrets environment names the environment and the next step", () => {
    const body = unknownEnvironmentError("dev");
    expect(body.error).toContain('No project environment named "dev"');
    expect(body.error).toContain("Secrets page");
  });
});

describe("top-level help stays consistent with the docs' command set", () => {
  it("renders every GROUPS command in the help output", () => {
    const out = renderHelp(120);
    for (const group of GROUPS) {
      for (const cmd of group.commands) {
        expect(out).toContain(cmd.name);
      }
    }
  });
});
