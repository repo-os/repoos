import { describe, expect, it } from "vitest";
import { commandUsage } from "../cli/help.js";
import { assertSecretMutationAllowed, SECRET_ACTIONS, SECRETS_USAGE } from "./secrets.js";

describe("repoos secrets inherited keys", () => {
  it.each(["replace", "delete"] as const)(
    "refuses %s of inherited-only keys before reading a value",
    (action) => {
      expect(() => assertSecretMutationAllowed(action, { status: "set", inherited: true })).toThrow(
        "Key is inherited from an earlier source and cannot be changed",
      );
    },
  );
});

// The usage strings have drifted from the real CLI before (#1227 review pass 2:
// both omitted `bind`/`bindings` while the actions were implemented). Pin every
// usage surface to the full implemented action set so the next subcommand
// cannot land without appearing in them.
describe("repoos secrets usage strings cover every implemented action", () => {
  it.each(SECRET_ACTIONS)("the self-help banner mentions %s", (action) => {
    expect(commandUsage("secrets") ?? "").toContain(action);
  });

  it.each(SECRET_ACTIONS)("the bad-invocation usage line mentions %s", (action) => {
    expect(SECRETS_USAGE).toContain(action);
  });
});

