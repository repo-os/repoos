// @vitest-environment node
/**
 * #1238 — a refused or failed deploy names what happened and the next step in
 * plain English. The server's raw git output stays on screen beside it; this
 * table pins which kind of failure gets which next step.
 */
import { describe, expect, it } from "vitest";
import { deployFailureHint } from "../src/lib/deployment-failure";

describe("deployFailureHint", () => {
  it.each([
    [
      "a diverged fast-forward refusal",
      "Could not fast-forward main to origin/prod — the branches have diverged, so the deploy was refused.",
      /different commits.*never force-pushes.*deploy again/s,
    ],
    [
      "a non-fast-forward push rejection",
      "! [rejected] main -> prod (non-fast-forward)",
      /never force-pushes/,
    ],
    [
      "a dirty checkout",
      "The checkout has uncommitted changes — commit or stash them before deploying.",
      /Commit or stash this checkout's changes, then deploy again\./,
    ],
    [
      "a missing local branch",
      'No local branch "prod" exists in this checkout — fetch or create it before deploying.',
      /Fetch or create the branch in this checkout/,
    ],
    [
      "a push that failed after the fast-forward",
      "Fast-forwarded main to prod, but the push to origin failed — the remote may have moved.",
      /Nothing was force-pushed/,
    ],
    [
      "an authentication failure on push",
      "fatal: Authentication failed for 'https://example.test/repo.git'",
      /git access to origin/,
    ],
    [
      "output we do not recognise",
      "something unexpected happened",
      /Find the cause in the git output below/,
    ],
  ])("%s gets a plain next step", (_name, output, expected) => {
    expect(deployFailureHint(output)).toMatch(expected);
  });

  it("returns null when there is no output to explain", () => {
    expect(deployFailureHint("")).toBeNull();
    expect(deployFailureHint("   \n  ")).toBeNull();
  });
});
