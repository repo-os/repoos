/**
 * Canary counter for the end-to-end flow smoke test (draft → inbox → ready →
 * active → review → merge → done). The only thing a canary task does is bump
 * this number, wrapping 9 back to 0 — see CANARY_PROMPT below, which is the
 * exact, unchanging freeform explanation used to create that task every time.
 * A trivial, single-line diff means any failure surfaced by the run is the
 * pipeline's fault, not the change's.
 */
export const CANARY_COUNTER = 1;

export const CANARY_PROMPT =
  "This is the repoos canary task: a deliberately trivial change used to smoke-test the full flow " +
  "(draft, inbox, ready, active, review, merge, done) end to end. The only change to make is in " +
  "src/core/canary.ts: increment the exported CANARY_COUNTER constant by 1, wrapping from 9 back to 0. " +
  "Do not touch anything else, do not add tests or comments beyond what's already there, and do not " +
  "change CANARY_PROMPT itself.";
