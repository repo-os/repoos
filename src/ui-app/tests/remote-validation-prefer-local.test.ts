/**
 * #0917 — prefer-local gate skips host retry and falls back immediately.
 */
import { describe, it, expect } from "vitest";
import { remoteValidationMayRetryOnAnotherHost } from "../../server/remote-validation.js";
import type { CheckSummary } from "../../server/done.js";

describe("remoteValidationMayRetryOnAnotherHost (#0917)", () => {
  it("does not retry when the laptop chose local gate", () => {
    const summary: CheckSummary = {
      ok: false,
      transient: true,
      infraFailure: true,
      preferLocalGate: true,
      detail: "slow uplink 2.5 Mbps: running locally",
    };
    expect(remoteValidationMayRetryOnAnotherHost(summary)).toBe(false);
  });

  it("still retries ordinary transient infra failures", () => {
    const summary: CheckSummary = {
      ok: false,
      transient: true,
      infraFailure: true,
      detail: "remote validation unavailable: host unreachable",
    };
    expect(remoteValidationMayRetryOnAnotherHost(summary)).toBe(true);
  });
});
