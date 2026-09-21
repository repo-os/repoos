import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  newestCertifiedVersion: string;
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
const manifestPath =
  manifestUrl.protocol === "file:"
    ? manifestUrl
    : ([
        join(process.cwd(), "src/core/agent-compatibility.json"),
        join(process.cwd(), "../../src/core/agent-compatibility.json"),
      ].find((candidate) => existsSync(candidate)) ??
      join(process.cwd(), "src/core/agent-compatibility.json"));

export const AGENT_COMPATIBILITY_MANIFEST = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  schemaVersion: number;
  contracts: AgentCompatibilityContract[];
};

const VERSION_RE = /(?:^|[^0-9])v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i;
const EXPLICIT_VERSION_RE = /\bv(\d+(?:\.\d+){0,2})\b/i;
const DOTTED_VERSION_RE = /(?:^|[^0-9])(\d+\.\d+(?:\.\d+)?)(?:[^0-9]|$)/;

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
  if (!match) return null;
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

function versionSatisfiesRange(version: [number, number, number], range: string): boolean {
  const normalized = range.trim();
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  if (tokens.length === 1) {
    const operator = parseRangeOperatorToken(tokens[0]);
    if (!operator) {
      const exact = parseAgentVersion(tokens[0]);
      return exact ? compareVersion(version, exact) === 0 : false;
    }
    const cmp = compareVersion(version, operator.value);
    if (operator.op === ">=") return cmp >= 0;
    if (operator.op === ">") return cmp > 0;
    if (operator.op === "<=") return cmp <= 0;
    if (operator.op === "<") return cmp < 0;
    return cmp === 0;
  }

  const rangeChecks = tokens.map((token) => parseRangeOperatorToken(token)).filter(Boolean) as {
    op: string;
    value: [number, number, number];
  }[];
  if (rangeChecks.length !== tokens.length) {
    const exact = parseAgentVersion(normalized);
    return exact ? compareVersion(version, exact) === 0 : false;
  }

  return rangeChecks.every(({ op, value }) => {
    const cmp = compareVersion(version, value);
    if (op === ">=") return cmp >= 0;
    if (op === ">") return cmp > 0;
    if (op === "<=") return cmp <= 0;
    if (op === "<") return cmp < 0;
    return cmp === 0;
  });
}

export function compatibilityForAgent(
  agent: Pick<DetectedAgent, "cli" | "version" | "drivable">,
): AgentCompatibility {
  const contract = agent.cli
    ? (AGENT_COMPATIBILITY_MANIFEST.contracts.find((entry) => entry.cli === agent.cli) ?? null)
    : null;
  const installed = parseAgentVersion(agent.version);
  const hasEvidence = !!contract?.verifiedAt && !!contract?.verificationSource;

  if (!contract || !agent.drivable) {
    return {
      status: contract ? "unsupported" : "not_probed",
      label: contract ? "unsupported" : "not yet probed",
      explanation: contract
        ? "RepoOS does not have a drivable adapter for this installation."
        : "RepoOS has not certified this harness yet.",
      installedVersion: agent.version,
      newestCertifiedVersion: contract?.newestCertifiedVersion ?? null,
      contract,
      capabilities: contract?.requiredCapabilities ?? [],
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

  const newest = parseAgentVersion(contract.newestCertifiedVersion);
  if (!newest) {
    return {
      status: "not_probed",
      label: "not yet probed",
      explanation: `The ${contract.name} compatibility manifest has an invalid newest certified version; review the manifest before relying on this status.`,
      installedVersion: agent.version,
      newestCertifiedVersion: contract.newestCertifiedVersion ?? null,
      contract,
      capabilities: contract.requiredCapabilities,
    };
  }
  const isKnownIncompatible = contract.knownIncompatibleRanges.some((range) =>
    versionSatisfiesRange(installed, range),
  );
  const isSupportedRange = versionSatisfiesRange(installed, contract.supportedRange);

  let status: CompatibilityStatus;
  let explanation: string;
  if (installed[0] < contract.supportedMajor) {
    status = "upgrade_recommended";
    explanation = `This is older than the certified ${contract.name} v${contract.supportedMajor} line. Local capability checks may still permit work.`;
  } else if (isKnownIncompatible) {
    status = "unsupported";
    explanation = `This version family is known incompatible with the ${contract.name} adapter.`;
  } else if (compareVersion(installed, newest) > 0) {
    status = "newer_than_verified";
    explanation = `This release is newer than the newest tracked ${contract.name} release (${contract.newestCertifiedVersion}). Review the release guidance before important work; RepoOS has no live compatibility probe yet.`;
  } else if (isSupportedRange && hasEvidence) {
    status = "verified";
    explanation = `The ${contract.name} v${contract.supportedMajor} contract is certified through ${contract.newestCertifiedVersion}.`;
  } else if (isSupportedRange) {
    status = "not_probed";
    explanation = `RepoOS tracks ${contract.name} v${contract.supportedMajor} in its compatibility manifest, but this release family has not yet been proven by a RepoOS adapter contract suite.`;
  } else {
    status = "unsupported";
    explanation = `This version family is outside the certified ${contract.name} range (${contract.supportedRange}).`;
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

export function compatibilityForDetectedAgent(agent: DetectedAgent): AgentCompatibility {
  return compatibilityForAgent(agent);
}
