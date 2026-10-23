import { describe, expect, it } from "vitest";
import { assertSecretMutationAllowed } from "./secrets.js";

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
