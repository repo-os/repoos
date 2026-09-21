import manifest from "./agent-compatibility.json" with { type: "json" };
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
  verifiedAt: string;
  verificationSource: string;
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

export const AGENT_COMPATIBILITY_MANIFEST = manifest as {
  schemaVersion: number;
  contracts: AgentCompatibilityContract[];
};

const VERSION_RE = /(?:^|[^0-9])v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i;

export function parseAgentVersion(value: string | null): [number, number, number] | null {
  if (!value) return null;
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

export function compatibilityForAgent(
  agent: Pick<DetectedAgent, "cli" | "version" | "drivable">,
): AgentCompatibility {
  const contract = agent.cli
    ? (AGENT_COMPATIBILITY_MANIFEST.contracts.find((entry) => entry.cli === agent.cli) ?? null)
    : null;
  const installed = parseAgentVersion(agent.version);

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

  const newest = parseAgentVersion(contract.newestCertifiedVersion)!;
  let status: CompatibilityStatus;
  let explanation: string;
  if (installed[0] < contract.supportedMajor) {
    status = "upgrade_recommended";
    explanation = `This is older than the certified ${contract.name} v${contract.supportedMajor} line. Local capability checks may still permit work.`;
  } else if (
    contract.knownIncompatibleRanges.some(
      (range) => range.includes(">=") && installed[0] >= Number(range.match(/\d+/)?.[0] ?? 0),
    )
  ) {
    status = "unsupported";
    explanation = `This version family is known incompatible with the ${contract.name} adapter.`;
  } else if (compareVersion(installed, newest) > 0) {
    status = "newer_than_verified";
    explanation = `This release is newer than the newest certified ${contract.name} release (${contract.newestCertifiedVersion}). Run the optional probe before important work.`;
  } else if (installed[0] === contract.supportedMajor) {
    status = "verified";
    explanation = `The ${contract.name} v${contract.supportedMajor} contract is certified through ${contract.newestCertifiedVersion}.`;
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
