/**
 * Per-shot verdicts for handoff UI verification (#0751, reshaped in #0753).
 *
 * A reviewer wants one thing from the handoff evidence: is this shot right, or
 * does it need a look? This module turns ONE captured shot's recorded outcome
 * into a glanceable verdict — `matches` when every declared step succeeded and
 * the capture landed on the declared route, `check` with a plain-words reason
 * when something did not. #0753 then moved that verdict ONTO the shot row in
 * the Changes tab (a green check / red cross icon) and folded the shot's OWN
 * issues — console errors, failed same-origin requests, overflow, blank
 * captures — into that row's popover, so the old standalone summary block is
 * gone rather than duplicated. Issues the gate records for a single capture now
 * ride on the capture (`UiHandoffCaptureEvidence.issues`); only issues tied to
 * no shot, plus run-level shot warnings, are shown once under the list.
 *
 * Deliberately display-only (#0751 Notes): nothing here changes how a shot is
 * captured or whether a handoff is gated. It reads the evidence the gate
 * already records — the per-capture `targetWarnings` (#0743 step/selector/
 * highlight misses), the route match, and the assertion outcomes (#0734) — and
 * derives a verdict. The raw messages ride along as details, so the plain-words
 * reason never hides the exact selector or timeout a debugging reviewer needs.
 */
import type {
  UiHandoffCaptureEvidence,
  UiHandoffVerificationEvidence,
  UiHandoffVerificationIssue,
} from "../types";

/** What a shot's evidence amounts to, in one word for the badge. */
export type ShotVerdict = "matches" | "check";

/** One shot's derived verdict plus its plain-words and raw detail. */
export interface ShotVerdictView {
  verdict: ShotVerdict;
  /** Plain-words reason for a `check`, e.g. "couldn't find the fullscreen toggle". Empty for `matches`. */
  reason: string;
  /** Raw recorded messages (selector matches, step timeouts, assertion details). */
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

// ── #0753: the per-shot popover text and the handoff-wide issue summary ─────

/**
 * The plain-words verdict for a shot's popover, e.g. "matches: every declared
 * step ran and the capture was taken" or "check: couldn't find the fullscreen
 * toggle". The wording is deliberately human — it names the shot's outcome, not
 * the internal verdict token.
 */
export function verdictSentence(view: ShotVerdictView): string {
  if (view.verdict === "matches") {
    return "matches: every declared step ran and the capture was taken";
  }
  return `check: ${view.reason}`;
}

/** Grouped, human-labelled handoff-wide issues for the popover (#0753). */
export interface HandoffIssueGroup {
  /** Short human label for the group, e.g. "console errors". */
  kind: string;
  /** One line per issue, prefixed with the raw kind for a debugging reviewer. */
  items: string[];
}

/**
 * Group the handoff-wide issues by kind, in a stable order, so the popover
 * lists "console errors", "failed requests", "overflow" and "blank captures"
 * as readable sections instead of a flat wall of kinds. Empty groups are
 * dropped — the popover only shows what actually happened.
 */
export function handoffIssueGroups(
  issues: UiHandoffVerificationIssue[],
  blankShots: string[],
): HandoffIssueGroup[] {
  const order = ["console", "request", "overflow", "blank"];
  const labels: Record<string, string> = {
    console: "console errors",
    request: "failed same-origin requests",
    overflow: "overflow",
    blank: "blank captures",
  };
  const byKind = new Map<string, string[]>();
  for (const issue of issues) {
    const kind = issue.kind || "issue";
    const parts = [`[${issue.kind}] ${issue.message}`];
    if (issue.viewportWidth !== undefined) parts.push(`@${issue.viewportWidth}px`);
    if (issue.url) parts.push(issue.url);
    const list = byKind.get(kind) ?? [];
    list.push(parts.join(" · "));
    byKind.set(kind, list);
  }
  if (blankShots.length > 0)
    byKind.set(
      "blank",
      blankShots.map((s) => `[blank] ${s}`),
    );

  const groups: HandoffIssueGroup[] = [];
  for (const kind of order) {
    const items = byKind.get(kind);
    if (items?.length) groups.push({ kind: labels[kind] ?? kind, items });
    byKind.delete(kind);
  }
  // Any kind we did not name still shows — honest beats tidy.
  for (const [kind, items] of byKind) {
    if (items.length) groups.push({ kind, items });
  }
  return groups;
}

/**
 * The handoff-wide issues as flat detail lines, for the popover and for the
 * footnotes under a section. Shot warnings (#0743) are handoff-level too — they
 * describe the plan the whole run used — so they ride along here.
 *
 * NOTE (#0753): the Changes tab no longer calls this — issues that belong to a
 * shot ride in that shot's popover (`captureIssueLines`) and the rest show once
 * under the list (`runLevelIssueLines`). It stays as the flat, un-split view for
 * callers that want the whole handoff's issues in one list.
 */
export function handoffIssueLines(
  evidence: UiHandoffVerificationEvidence | null | undefined,
): string[] {
  if (!evidence) return [];
  const lines: string[] = [];
  for (const group of handoffIssueGroups(evidence.issues, evidence.blankShots)) {
    lines.push(`${group.kind}:`);
    for (const item of group.items) lines.push(`  ${item}`);
  }
  for (const warn of evidence.warnings ?? []) lines.push(`[shot-warning] ${warn}`);
  return lines;
}

// ── #0753: issues belong to a shot, so the popover shows only that shot's ────

/**
 * The flat detail lines for ONE capture's own issues (#0753) — its console
 * errors, failed same-origin requests, overflow, blank capture, route and
 * assertion issues. Grouped by kind like the handoff list, so the popover reads
 * as readable sections rather than a wall of raw kinds.
 */
export function captureIssueLines(cap: UiHandoffCaptureEvidence): string[] {
  const lines: string[] = [];
  for (const group of handoffIssueGroups(cap.issues ?? [], [])) {
    lines.push(`${group.kind}:`);
    for (const item of group.items) lines.push(`  ${item}`);
  }
  return lines;
}

/**
 * The issues that belong to no single shot — the ones not carried by any
 * capture's own `issues`, plus the run-level shot warnings (#0743). These are
 * shown ONCE under the shot list, never repeated per row (#0753).
 */
export function runLevelIssueLines(
  evidence: UiHandoffVerificationEvidence | null | undefined,
): string[] {
  if (!evidence) return [];
  // Every issue a capture already owns (by kind+message+url) is excluded here.
  const owned = new Set<string>();
  for (const cap of evidence.captureDetails ?? []) {
    for (const issue of cap.issues ?? []) owned.add(issueKey(issue));
  }
  const orphans = evidence.issues.filter((issue) => !owned.has(issueKey(issue)));
  const lines: string[] = [];
  for (const group of handoffIssueGroups(orphans, [])) {
    lines.push(`${group.kind}:`);
    for (const item of group.items) lines.push(`  ${item}`);
  }
  for (const warn of evidence.warnings ?? []) lines.push(`[shot-warning] ${warn}`);
  return lines;
}

/** Stable identity for an issue, so a capture's copy is not re-shown run-level. */
function issueKey(issue: UiHandoffVerificationIssue): string {
  return `${issue.kind}\u0000${issue.message}\u0000${issue.url ?? ""}\u0000${issue.viewportWidth ?? ""}`;
}

/** One line describing where and when the handoff ran, for the popover/status line. */
export function handoffContextLine(
  evidence: UiHandoffVerificationEvidence | null | undefined,
): string {
  if (!evidence) return "";
  const parts: string[] = [];
  if (evidence.sourceIdentity) parts.push(`tested tree ${evidence.sourceIdentity}`);
  if (evidence.evidenceDir) parts.push(`PNGs at ${evidence.evidenceDir}`);
  return parts.join(" · ");
}

/**
 * The plain sentence for an orphaned handoff capture — one the handoff recorded
 * but whose shot file is no longer in the task's `shots/` list (usually because
 * a later capture replaced it). #0753 keeps the verdict rather than silently
 * dropping it: the row is marked "no longer listed" but still says why.
 */
export function orphanHandoffSentence(view: ShotVerdictView): string {
  return view.verdict === "matches"
    ? "matches, but no longer in the shot list"
    : `check: ${view.reason} (no longer in the shot list)`;
}
