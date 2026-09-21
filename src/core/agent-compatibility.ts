import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DetectedAgent } from "./detect.js";

export type CompatibilityStatus =
  | "verified"
  | "upgrade_recommended"
  | "newer_than_verified"
  | "unsupported"
  | "not_probed";

export interface AgentCompatibilityContract {
  cli: string;
  name: string;
  supportedMajor: number;
  supportedRange: string;
  /**
   * Newest release with recorded certification evidence, or `null` when the
   * line is tracked but nothing has been certified yet. This pairs with
   * `verifiedAt`/`verificationSource`: a non-null value without evidence, or
   * evidence without a value, is a manifest inconsistency.
   */
  newestCertifiedVersion: string | null;
  knownIncompatibleRanges: string[];
  requiredCapabilities: string[];
  verifiedAt: string | null;
  verificationSource: string | null;
  upgradeGuidance: string;
  officialUrl: string;
}

export interface AgentCompatibility {
  status: CompatibilityStatus;
  label: string;
  explanation: string;
  installedVersion: string | null;
  newestCertifiedVersion: string | null;
  contract: AgentCompatibilityContract | null;
  capabilities: string[];
}

const manifestUrl = new URL("./agent-compatibility.json", import.meta.url);

let warnedMissingManifest = false;

/**
 * Resolve the compatibility manifest from disk, honoring every way the module
 * can be loaded:
 *   - built  — dist/core/agent-compatibility.js → ./agent-compatibility.json
 *              (copied into dist/ by scripts/copy-assets.mjs; tsc never emits
 *              JSON siblings itself)
 *   - dev    — src/core/agent-compatibility.ts at module load time, plus
 *              cwd-relative candidates for `bun repoos <cmd>` launcher runs
 *   - linked — dist installed side-by-side with a src checkout via
 *              REPOOS_ROOT (the self-hosted `bun link` layout)
 * Never throws: a build that predates the copy step, or a source checkout
 * without the manifest, degrades to an empty manifest instead of crashing the
 * CLI/server at import time. The `repoos check` dist-artifact test catches a
 * missing copy.
 */
function resolveManifestPath(): string | null {
  const candidates: string[] = [];
  // In some environments (vitest's transformed modules) import.meta.url is not
  // a file: URL; those get skipped and the cwd-relative candidates below win.
  if (manifestUrl.protocol === "file:") {
    candidates.push(fileURLToPath(manifestUrl));
  }
  candidates.push(
    join(process.cwd(), "src/core/agent-compatibility.json"),
    join(process.cwd(), "dist/core/agent-compatibility.json"),
  );
  const root = process.env.REPOOS_ROOT;
  if (root) {
    candidates.push(
      join(root, "src/core/agent-compatibility.json"),
      join(root, "dist/core/agent-compatibility.json"),
    );
  }
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      /* per-candidate failures are ignored; keep scanning */
    }
  }
  return null;
}

function loadManifest(): {
  schemaVersion: number;
  contracts: AgentCompatibilityContract[];
} {
  const path = resolveManifestPath();
  if (!path) {
    if (!warnedMissingManifest) {
      warnedMissingManifest = true;
      // Debug-level noise, not a hard failure: an empty manifest makes every
      // harness render "not yet probed" rather than crashing the process.
      console.error(
        "[repoos] agent-compatibility.json not found in build or source tree; compatibility statuses will report 'not yet probed'. Rebuild (scripts/copy-assets.mjs copies it into dist/) or restore the file under src/core/.",
      );
    }
    return { schemaVersion: 1, contracts: [] };
  }
  return JSON.parse(readFileSync(path, "utf8")) as {
    schemaVersion: number;
    contracts: AgentCompatibilityContract[];
  };
}

export const AGENT_COMPATIBILITY_MANIFEST = loadManifest();

const VERSION_RE = /(?:^|[^0-9])v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i;
const EXPLICIT_VERSION_RE = /\bv(\d+(?:\.\d+){0,2})\b/i;
const DOTTED_VERSION_RE = /(?:^|[^0-9])(\d+\.\d+(?:\.\d+)?)(?:[^0-9]|$)/;

/**
 * Reject a bare integer version token when it is longer than three digits.
 * Bare numbers that long are overwhelmingly build numbers or dates
 * (`20260921`, `2026`), and reading them as a major version would label a
 * current release "newer than verified" or "unsupported" on a parser artifact.
 * Dotted and `v`-prefixed forms are handled by the explicit/dotted paths and
 * are not affected.
 */
function isPlausibleBareMajor(token: string): boolean {
  return /^\d{1,3}$/.test(token);
}

export function parseAgentVersion(value: string | null): [number, number, number] | null {
  if (!value) return null;
  const explicit = EXPLICIT_VERSION_RE.exec(value)?.[1];
  const dotted = DOTTED_VERSION_RE.exec(value)?.[1];
  const preferred = explicit ?? dotted;
  if (preferred) {
    const parts = preferred.split(".");
    return [Number(parts[0]), Number(parts[1] ?? 0), Number(parts[2] ?? 0)];
  }
  const match = VERSION_RE.exec(value);
  if (!match || !isPlausibleBareMajor(match[1])) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersion(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function parseRangeOperatorToken(
  token: string,
): { op: string; value: [number, number, number] } | null {
  const match = token.match(/^(>=|<=|==|=|>|<)\s*(\d+(?:\.\d+){0,2})$/i);
  if (!match) return null;
  const value = parseAgentVersion(match[2]);
  if (!value) return null;
  return { op: match[1], value };
}

/**
 * Expand a semver-ish token that is not a plain operator-prefixed version into
 * one or more operator tokens:
 *   `*`        → any             `^2` / `^2.1` / `^2.1.3` → >=lower <next-major
 *   `1.2.*`    → >=1.2.0 <1.3.0  `~1.2` / `~1.2.3`       → >=lower <next-minor
 *   `1.*`/`1.x` → >=1.0.0 <2.0.0 (a lone-major wildcard is <next-major, not <1.1.0)
 *   `a || b`   → handled by the caller as an OR clause
 * Returns null when the token is not a recognized shape.
 */
function expandSemverToken(token: string): Array<{ op: string; value: [number, number, number] }> {
  const trimmed = token.trim();
  if (trimmed === "*" || trimmed === "x" || trimmed === "X") return [];
  const caret = trimmed.match(/^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (caret) {
    const [a, b, c] = caret.slice(1).map((n) => (n === undefined ? 0 : Number(n)));
    // ^0.y.z is <0.(y+1).0 (the first non-zero component is the defining one).
    if (a === 0) {
      const upper = b + 1;
      return [
        { op: ">=", value: [0, b, c] },
        { op: "<", value: [0, upper, 0] },
      ];
    }
    return [
      { op: ">=", value: [a, b, c] },
      { op: "<", value: [a + 1, 0, 0] },
    ];
  }
  const tilde = trimmed.match(/^~(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (tilde) {
    const [a, b, c] = tilde.slice(1).map((n) => (n === undefined ? 0 : Number(n)));
    return [
      { op: ">=", value: [a, b, c] },
      { op: "<", value: [a, b + 1, 0] },
    ];
  }
  // Wildcard component ranges: `1.*` / `1.x` means any 1.y (npm: <2.0.0),
  // and `1.2.*` / `1.2.x` means any 1.2.z. Only tokens that actually contain a
  // wildcard marker are treated as ranges, so a plain `1.2.3` still falls
  // through to exact matching.
  if (/[xX*]/.test(trimmed)) {
    const parts = trimmed.split(".");
    const valid =
      parts.length >= 2 &&
      parts.length <= 3 &&
      parts.every((part) => /^\d+$/.test(part) || /^[xX*]$/.test(part));
    if (valid) {
      const major = Number(parts[0]);
      if (/^[xX*]$/.test(parts[1])) {
        return [
          { op: ">=", value: [major, 0, 0] },
          { op: "<", value: [major + 1, 0, 0] },
        ];
      }
      const minor = Number(parts[1]);
      return [
        { op: ">=", value: [major, minor, 0] },
        { op: "<", value: [major, minor + 1, 0] },
      ];
    }
  }
  return null as unknown as Array<{ op: string; value: [number, number, number] }>;
}

function tokensSatisfy(
  version: [number, number, number],
  checks: Array<{ op: string; value: [number, number, number] }>,
): boolean {
  return checks.every(({ op, value }) => {
    const cmp = compareVersion(version, value);
    if (op === ">=") return cmp >= 0;
    if (op === ">") return cmp > 0;
    if (op === "<=") return cmp <= 0;
    if (op === "<") return cmp < 0;
    return cmp === 0;
  });
}

/** True when `version` falls inside the semver `range` (e.g. `>=2.0.0 <3.0.0`, `^2.1`, `1.2.*`, `a || b`). */
export function versionSatisfiesRange(version: [number, number, number], range: string): boolean {
  const normalized = range.trim();
  if (!normalized) return false;

  // `a || b` — any alternative clause may satisfy.
  const alternatives = normalized.split("||").map((s) => s.trim());
  if (alternatives.length > 1) {
    return alternatives.some((alt) => versionSatisfiesRange(version, alt));
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const checks: Array<{ op: string; value: [number, number, number] }> = [];
  for (const token of tokens) {
    const operator = parseRangeOperatorToken(token);
    if (operator) {
      checks.push(operator);
      continue;
    }
    const expanded = expandSemverToken(token);
    if (expanded === null) {
      // Not an operator or a semver shape — fall back to exact match.
      const exact = parseAgentVersion(normalized);
      return exact ? compareVersion(version, exact) === 0 : false;
    }
    checks.push(...expanded);
  }
  return tokensSatisfy(version, checks);
}

/**
 * Classify one detected installation against a single contract. Exported so the
 * full status ladder — including `verified` and the `newer_than_verified`
 * rungs — can be tested against synthetic contracts without touching the live
 * manifest.
 */
export function compatibilityForContract(
  contract: AgentCompatibilityContract,
  agent: Pick<DetectedAgent, "version" | "drivable">,
): AgentCompatibility {
  const installed = parseAgentVersion(agent.version);
  const hasEvidence = !!contract.verifiedAt && !!contract.verificationSource;
  const certified = contract.newestCertifiedVersion
    ? parseAgentVersion(contract.newestCertifiedVersion)
    : null;
  // `verifiedAt`/`verificationSource` and `newestCertifiedVersion` must be set
  // together: evidence without a certified version (or vice versa) is a manifest
  // bug, and an unparseable value is too. Report it honestly instead of quietly
  // returning a normal status.
  const manifestInconsistent =
    hasEvidence !== (contract.newestCertifiedVersion !== null) ||
    (contract.newestCertifiedVersion !== null && certified === null);

  if (!agent.drivable) {
    return {
      status: "unsupported",
      label: "unsupported",
      explanation: "RepoOS does not have a drivable adapter for this installation.",
      installedVersion: agent.version,
      newestCertifiedVersion: contract.newestCertifiedVersion,
      contract,
      capabilities: contract.requiredCapabilities,
    };
  }
  if (!installed) {
    return {
      status: "not_probed",
      label: "not yet probed",
      explanation: "RepoOS could not parse a version from the installed binary.",
      installedVersion: agent.version,
      newestCertifiedVersion: contract.newestCertifiedVersion,
      contract,
      capabilities: contract.requiredCapabilities,
    };
  }
  if (manifestInconsistent) {
    return {
      status: "not_probed",
      label: "not yet probed",
      explanation: `The ${contract.name} compatibility manifest is inconsistent: verifiedAt/verificationSource and newestCertifiedVersion must be recorded together, and the version must parse. Review src/core/agent-compatibility.json before relying on this status.`,
      installedVersion: agent.version,
      newestCertifiedVersion: contract.newestCertifiedVersion,
      contract,
      capabilities: contract.requiredCapabilities,
    };
  }

  const isKnownIncompatible = contract.knownIncompatibleRanges.some((range) =>
    versionSatisfiesRange(installed, range),
  );
  const isSupportedRange = versionSatisfiesRange(installed, contract.supportedRange);
  const isNewer = certified !== null && compareVersion(installed, certified) > 0;
  // A major above the supported line is a newer release we have not certified —
  // visible uncertainty, not a *known* break. It must not hard-fail (`unsupported`
  // → doctor exit 1); the task's non-goal is to prefer uncertainty plus a probe.
  const isNewerMajor = installed[0] > contract.supportedMajor;

  let status: CompatibilityStatus;
  let explanation: string;
  if (isKnownIncompatible) {
    // Checked before the old-major branch so a known-bad family is reported
    // unsupported even when it also sits below the supported major.
    status = "unsupported";
    explanation = `This version family is known incompatible with the ${contract.name} adapter.`;
  } else if (installed[0] < contract.supportedMajor) {
    status = "upgrade_recommended";
    explanation = `This is older than the supported ${contract.name} v${contract.supportedMajor} line. Local capability checks may still permit work.`;
  } else if (isNewerMajor || isNewer) {
    status = "newer_than_verified";
    explanation = certified
      ? `This release is newer than the newest certified ${contract.name} release (${contract.newestCertifiedVersion}). It is not blocked; run \`repoos doctor --probe ${contract.cli}\` for a deliberate compatibility probe before important work.`
      : `This is a newer ${contract.name} major than the supported v${contract.supportedMajor} line, which RepoOS has not certified yet. It is not blocked; run \`repoos doctor --probe ${contract.cli}\` for a deliberate compatibility probe before important work.`;
  } else if (isSupportedRange && hasEvidence && certified !== null) {
    status = "verified";
    explanation = `The ${contract.name} v${contract.supportedMajor} contract is certified through ${contract.newestCertifiedVersion}.`;
  } else if (isSupportedRange) {
    status = "not_probed";
    explanation = `RepoOS tracks ${contract.name} v${contract.supportedMajor} in its compatibility manifest, but this release family has not yet been proven by a RepoOS adapter contract suite.`;
  } else {
    status = "unsupported";
    explanation = `This version family is outside the supported ${contract.name} range (${contract.supportedRange}).`;
  }
  return {
    status,
    label: status.replaceAll("_", " "),
    explanation,
    installedVersion: agent.version,
    newestCertifiedVersion: contract.newestCertifiedVersion,
    contract,
    capabilities: contract.requiredCapabilities,
  };
}

export function compatibilityForAgent(
  agent: Pick<DetectedAgent, "cli" | "version" | "drivable">,
): AgentCompatibility {
  const contract = agent.cli
    ? (AGENT_COMPATIBILITY_MANIFEST.contracts.find((entry) => entry.cli === agent.cli) ?? null)
    : null;

  if (!contract) {
    return {
      status: agent.drivable ? "not_probed" : "unsupported",
      label: agent.drivable ? "not yet probed" : "unsupported",
      explanation: agent.drivable
        ? "RepoOS has not certified this harness yet."
        : "RepoOS does not have a drivable adapter for this installation.",
      installedVersion: agent.version,
      newestCertifiedVersion: null,
      contract: null,
      capabilities: [],
    };
  }
  return compatibilityForContract(contract, agent);
}

export function compatibilityForDetectedAgent(agent: DetectedAgent): AgentCompatibility {
  return compatibilityForAgent(agent);
}
