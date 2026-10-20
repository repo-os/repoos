/**
 * `repoos shot` and `browserCaptureMode` (#0854 review).
 *
 * The CLI used to launch WebKit directly regardless of the configured
 * capture policy, so `browserCaptureMode` only affected handoff evidence. It
 * now routes web captures through the same server policy as the automatic
 * pass. These pin the boundary: runner modes capture remotely, while requests
 * the remote single-shot path cannot reproduce (an arbitrary URL, explicit
 * viewport/settle/full-page flags) stay local rather than silently capturing
 * something different.
 */
import { describe, expect, it } from "vitest";
import { remoteWebCaptureBlocker } from "../../commands/shot.js";

describe("repoos shot remote capture policy (#0854)", () => {
  const defaults = { fullPage: false, viewportExplicit: false, waitMsExplicit: false };

  it.each(["local", undefined] as const)("never blocks in %s mode", (mode) => {
    expect(remoteWebCaptureBlocker(mode, false, defaults)).toBeUndefined();
    expect(remoteWebCaptureBlocker(mode, true, { ...defaults, fullPage: true })).toBeUndefined();
  });

  it.each(["runner-available", "runner-only"] as const)(
    "allows a plain capture in %s mode",
    (mode) => {
      expect(remoteWebCaptureBlocker(mode, false, defaults)).toBeUndefined();
    },
  );

  it.each([
    ["an absolute URL", true, defaults, "absolute URL"],
    ["--full-page", false, { ...defaults, fullPage: true }, "--full-page"],
    ["--viewport", false, { ...defaults, viewportExplicit: true }, "--viewport"],
    ["--wait", false, { ...defaults, waitMsExplicit: true }, "--wait"],
  ])("keeps %s local with a visible reason", (_label, absolute, opts, reason) => {
    expect(remoteWebCaptureBlocker("runner-available", absolute, opts)).toContain(reason);
  });
});
