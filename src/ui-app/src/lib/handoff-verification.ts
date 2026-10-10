/**
 * Per-shot verdicts for the handoff UI-verification block (#0751).
 *
 * The Changes tab's "Handoff UI verification" block used to print the raw
 * capture log — a wall of `[shot-warning] highlight … matched nothing on …`
 * lines that a reviewer had to decode. This module turns ONE captured shot's
 * recorded outcome into a glanceable verdict: `matches` when every declared
 * step succeeded and the capture landed on the declared route, or `check` with
 * a plain-words reason when something did not.
 *
 * Deliberately display-only (#0751 Notes): nothing here changes how a shot is
 * captured or whether a handoff is gated. It reads the evidence the gate
 * already records — the per-capture `targetWarnings` (#0743 step/selector/
 * highlight misses), the route match, and the assertion outcomes (#0734) — and
 * derives a verdict. The raw messages stay available, collapsed under a
 * "details" toggle, so the plain-words reason never hides the exact selector
 * or timeout a debugging reviewer needs.
 */
import type { UiHandoffCaptureEvidence } from "../types";

/** What a shot's evidence amounts to, in one word for the badge. */
export type ShotVerdict = "matches" | "check";

/** One shot's derived verdict plus its plain-words and raw detail. */
export interface ShotVerdictView {
  verdict: ShotVerdict;
  /** Plain-words reason for a `check`, e.g. "couldn't find the fullscreen toggle". Empty for `matches`. */
  reason: string;
  /** Raw recorded messages (selector matches, step timeouts, assertion details), for the details toggle. */
  details: string[];
}

/**
 * Turn one capture's raw `targetWarnings` message into a plain-words phrase.
 *
 * The capture records misses as strings built in two places:
 *   - `shot-page.ts` step misses: `click <sel>: <playwright error>` (and the
 *     `fill`/`waitFor` equivalents), where the error half is a raw timeout;
 *   - `shot-capture.ts` selector/highlight misses: `selector <sel> matched
 *     nothing on <route>` / `highlight <sel> matched nothing on <route>`.
 *
 * Only the leading verb and selector survive into the human phrase — the raw
 * message rides along in `details` — so a reviewer reads what failed, not a
 * Playwright stack line.
 */
function plainReasonForWarning(warning: string): string | undefined {
  const step = /^(click|fill|waitFor)\s+(.+?):\s/.exec(warning);
  if (step) {
    const [, verb, selector] = step;
    if (verb === "click") return `couldn't find ${selector} to click`;
    if (verb === "fill") return `couldn't find ${selector} to fill`;
    return `couldn't find ${selector}`;
  }
  const selectorMiss = /^selector\s+(.+?)\s+matched nothing/.exec(warning);
  if (selectorMiss) return `couldn't find ${selectorMiss[1]}`;
  const highlightMiss = /^highlight\s+(.+?)\s+matched nothing/.exec(warning);
  if (highlightMiss) return `couldn't find ${highlightMiss[1]} to highlight`;
  // Any other warning keeps its own wording — better an honest raw line than a
  // mislabelled one.
  return warning;
}

/**
 * Derive the verdict for one captured shot. A shot `matches` when it landed on
 * its declared route and recorded no step/selector/highlight miss and no failed
 * blocking assertion; otherwise it needs a `check`, named in plain words.
 *
 * `matches` deliberately tolerates an OPTIONAL assertion failure (#0734): an
 * optional assertion is recorded as best-effort and never blocks a handoff, so
 * it must not flip a shot to `check`. A non-optional (blocking) assertion
 * failure is a real miss and does.
 */
export function shotVerdict(cap: UiHandoffCaptureEvidence): ShotVerdictView {
  const warnings = cap.targetWarnings ?? [];
  const details: string[] = [...warnings];

  // Route mismatch (#0734): the PNG is not the evidence the shot declared.
  const routeFailed = !cap.routeMatched;
  if (routeFailed && cap.redirectNote) details.push(cap.redirectNote);

  // Blocking assertion failures: a required check that did not hold.
  const blockingFailures = cap.assertions.filter((a) => a.blocking && !a.passed);
  for (const failure of blockingFailures) details.push(`${failure.description}: ${failure.detail}`);

  if (!routeFailed && warnings.length === 0 && blockingFailures.length === 0) {
    return { verdict: "matches", reason: "", details };
  }

  let reason: string;
  if (routeFailed) {
    reason = `landed on ${cap.finalRoute} instead of ${cap.route}`;
  } else if (warnings.length > 0) {
    // The step/selector miss is the most actionable thing to name.
    reason = plainReasonForWarning(warnings[0]!) ?? warnings[0]!;
  } else {
    reason = blockingFailures[0]!.description;
  }
  return { verdict: "check", reason, details };
}

/** Counts and a one-sentence summary for the block header. */
export interface HandoffSummary {
  total: number;
  matching: number;
  checking: number;
  /** One sentence, e.g. "2 shots, both captured, 2 need checking". */
  sentence: string;
}

/**
 * Summarise a set of capture verdicts as one header sentence (#0751). Example:
 * "3 shots, all 3 captured, none need checking" / "2 shots, both captured, 1
 * needs checking".
 */
export function handoffSummary(verdicts: ShotVerdictView[]): HandoffSummary {
  const total = verdicts.length;
  const checking = verdicts.filter((v) => v.verdict === "check").length;
  const matching = total - checking;
  const shotWord = `shot${total === 1 ? "" : "s"}`;
  const capturedWord =
    total === 0
      ? "none captured"
      : matching === total
        ? `all ${total} captured`
        : matching === 0
          ? `none matched`
          : `${matching} of ${total} captured`;
  const checkingWord =
    checking === 0
      ? "none need checking"
      : checking === 1
        ? "1 needs checking"
        : `${checking} need checking`;
  return { total, matching, checking, sentence: `${total} ${shotWord}, ${capturedWord}, ${checkingWord}` };
}
