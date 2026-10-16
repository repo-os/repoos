/**
 * Harness capability facts for routing candidate filtering (#0793).
 *
 * The router may only offer a coding-agent configuration the harness can
 * actually run: the roles it supports, the reasoning/effort settings it accepts,
 * and the context window it can hold. These are static, conservative facts about
 * each `AGENT_CLIS` driver — not a permission grant. "Available" (installed and
 * authenticated) is supplied by the caller from the detection cache, so the same
 * table serves the server and the fixture-backed tests.
 *
 * Pure and node-free: unit-testable without a filesystem or a live probe.
 */
import { AGENT_CLIS } from "../config.js";
import type { HarnessAvailability } from "./candidates.js";
import type { RoutingRole } from "./types.js";

/** Every role RepoOS runs. A drivable harness may run any of them. */
export const ALL_ROUTING_ROLES: RoutingRole[] = ["pm", "engineer", "reviewer"];

/**
 * Conservative capability per CLI. `reasoning` lists the effort levels the
 * driver forwards (empty = the harness has none), and `maxContextTokens` is a
 * floor under the harness/model window so an oversized brief is refused rather
 * than silently truncated. Values are deliberately modest, not best-case.
 */
export interface HarnessCapability {
  reasoning: string[];
  maxContextTokens: number;
}

export const HARNESS_CAPABILITIES: Record<string, HarnessCapability> = {
  opencode: { reasoning: [], maxContextTokens: 200_000 },
  "claude code": { reasoning: [], maxContextTokens: 200_000 },
  "qwen code": { reasoning: [], maxContextTokens: 128_000 },
  kiro: { reasoning: [], maxContextTokens: 200_000 },
  codex: { reasoning: ["low", "medium", "high"], maxContextTokens: 200_000 },
  "github copilot": { reasoning: [], maxContextTokens: 128_000 },
  cursor: { reasoning: [], maxContextTokens: 200_000 },
  antigravity: { reasoning: ["low", "high"], maxContextTokens: 1_000_000 },
  crush: { reasoning: [], maxContextTokens: 200_000 },
  pi: { reasoning: [], maxContextTokens: 200_000 },
};

/** Used for a drivable CLI with no explicit entry: no reasoning, modest window. */
export const DEFAULT_HARNESS_CAPABILITY: HarnessCapability = {
  reasoning: [],
  maxContextTokens: 128_000,
};

export function capabilityForCli(cli: string): HarnessCapability {
  return HARNESS_CAPABILITIES[cli] ?? DEFAULT_HARNESS_CAPABILITY;
}

/** A drivable `AGENT_CLIS` value. A CLI outside this set is never a candidate. */
export function isDrivableCli(cli: string): boolean {
  return (AGENT_CLIS as readonly string[]).includes(cli);
}

/**
 * Build the `cli → HarnessAvailability` map the candidate filter consumes.
 *
 * @param clis        CLIs to describe (usually the candidate clis + configured agents).
 * @param isAvailable Predicate: is this CLI installed and authenticated right now?
 */
export function buildHarnessAvailability(
  clis: Iterable<string>,
  isAvailable: (cli: string) => boolean,
): Record<string, HarnessAvailability> {
  const out: Record<string, HarnessAvailability> = {};
  for (const cli of clis) {
    if (out[cli]) continue;
    const capability = capabilityForCli(cli);
    out[cli] = {
      available: isDrivableCli(cli) && isAvailable(cli),
      supportedReasoning: capability.reasoning,
      supportedRoles: isDrivableCli(cli) ? [...ALL_ROUTING_ROLES] : [],
      maxContextTokens: capability.maxContextTokens,
    };
  }
  return out;
}
