/**
 * Meaningful shot assertions (#0734).
 *
 * A declared shot's `highlight`/`selector` only prove an element EXISTED; a
 * nonblank screenshot with a clean console says nothing about whether the
 * feature's data actually rendered (the #0720/#0727/#0733 failures: a wrong
 * route, a missing target, or an empty list still reported a green handoff).
 * `## Shots` entries may therefore carry `assert` conditions — an element
 * must exist, an expected count must match, text must be present — and the
 * handoff gate checks each one against the live page before review.
 *
 * Deliberately page-only and dependency-free: the caller supplies a minimal
 * `AssertionPage` (Playwright's page satisfies it), so this stays testable
 * with a fake and free of Playwright types. Assertions are evaluated AFTER the
 * declared steps ran and the capture settled, on the same page session that
 * produced the PNG, so the outcome describes exactly the captured state.
 */
import { describeShotAssertion, type ShotAssertion } from "./shot-plan.js";

/** One assertion's evaluated outcome, recorded in the handoff evidence. */
export interface ShotAssertionOutcome {
  /** The assertion that was checked (as declared). */
  assertion: ShotAssertion;
  /** One-line human description (for the failure detail). */
  description: string;
  /** True when the assertion held on the captured page. */
  passed: boolean;
  /** Human-readable reason when it failed (empty when passed). */
  detail: string;
  /**
   * True when a non-optional assertion failed — the caller must block. An
   * optional assertion that failed records `passed: false` with `blocking`
   * false.
   */
  blocking: boolean;
}

export interface ShotAssertionReport {
  outcomes: ShotAssertionOutcome[];
  /** Blocking failure messages, empty when every required assertion passed. */
  failures: string[];
}

/** The minimal page surface assertion checks need. */
export interface AssertionPage {
  evaluate<T>(fn: () => T): Promise<T>;
}

/**
 * Count elements and read text in one round-trip. Runs in the page, so the
 * selectors are plain CSS (`document.querySelectorAll`) — the same vocabulary
 * the rest of the declaration uses. Returns `count` plus the concatenated
 * `textContent` of the matches, so a `text` assertion checks what a human
 * would see.
 */
interface ElementProbe {
  count: number;
  text: string;
}

async function probe(page: AssertionPage, selector: string): Promise<ElementProbe> {
  const evaluate = page as unknown as {
    evaluate: (body: (sel: string) => ElementProbe, arg: string) => Promise<ElementProbe>;
  };
  if (typeof evaluate.evaluate !== "function") {
    // A driver without evaluate (a synthetic test page) cannot prove anything:
    // report an empty match so a required assertion blocks rather than
    // silently passing.
    return { count: 0, text: "" };
  }
  return evaluate.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    return {
      count: nodes.length,
      text: nodes
        .map((n) => (n as { textContent?: string | null }).textContent ?? "")
        .join(" ")
        .trim(),
    };
  }, selector);
}

/** Evaluate one assertion against the page. */
export async function evaluateShotAssertion(
  page: AssertionPage,
  assertion: ShotAssertion,
): Promise<ShotAssertionOutcome> {
  const description = describeShotAssertion(assertion);
  const optional = assertion.optional === true;
  const fail = (detail: string): ShotAssertionOutcome => ({
    assertion,
    description,
    passed: false,
    detail,
    blocking: !optional,
  });

  if (assertion.selector) {
    let probed: ElementProbe;
    try {
      probed = await probe(page, assertion.selector);
    } catch (error) {
      return fail(
        `selector ${assertion.selector} could not be evaluated: ${(error as Error).message}`,
      );
    }
    const min = assertion.minCount ?? (assertion.count === undefined ? 1 : assertion.count);
    if (assertion.count !== undefined) {
      if (probed.count !== assertion.count) {
        return fail(
          `selector ${assertion.selector} matched ${probed.count} element(s), expected exactly ${assertion.count}`,
        );
      }
    } else if (probed.count < min) {
      return fail(
        `selector ${assertion.selector} matched ${probed.count} element(s), expected at least ${min}` +
          (probed.count === 0 ? " (nothing rendered — the feature state may be absent)" : ""),
      );
    }
    if (assertion.text !== undefined) {
      const needle = assertion.text.toLowerCase();
      if (!probed.text.toLowerCase().includes(needle)) {
        return fail(
          `selector ${assertion.selector} text does not contain ${JSON.stringify(assertion.text)}` +
            (probed.text ? ` (saw ${JSON.stringify(probed.text.slice(0, 120))})` : " (no text)"),
        );
      }
    }
    return { assertion, description, passed: true, detail: "", blocking: false };
  }

  // Text-only assertion: search the whole page body.
  if (assertion.text !== undefined) {
    let probed: ElementProbe;
    try {
      probed = await probe(page, "body");
    } catch (error) {
      return fail(`page text could not be read: ${(error as Error).message}`);
    }
    if (!probed.text.toLowerCase().includes(assertion.text.toLowerCase())) {
      return fail(`page text does not contain ${JSON.stringify(assertion.text)}`);
    }
    return { assertion, description, passed: true, detail: "", blocking: false };
  }

  // parseAssertion rejects an assertion with neither selector nor text, so this
  // is unreachable for parsed declarations; guard anyway.
  return fail("assertion has neither a selector nor text to check");
}

/** Evaluate every assertion for one capture, collecting failures. */
export async function evaluateShotAssertions(
  page: AssertionPage,
  assertions: ShotAssertion[] | undefined,
): Promise<ShotAssertionReport> {
  const outcomes: ShotAssertionOutcome[] = [];
  for (const assertion of assertions ?? []) {
    outcomes.push(await evaluateShotAssertion(page, assertion));
  }
  const failures = outcomes.filter((o) => o.blocking).map((o) => `${o.description}: ${o.detail}`);
  return { outcomes, failures };
}

/** One-line summary of a capture's assertion outcomes, for logs and evidence. */
export function formatAssertionSummary(report: ShotAssertionReport): string {
  if (report.outcomes.length === 0) return "no declared assertions";
  const passed = report.outcomes.filter((o) => o.passed).length;
  return `${passed}/${report.outcomes.length} assertion(s) passed`;
}
