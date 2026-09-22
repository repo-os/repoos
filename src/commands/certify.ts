/**
 * `repoos certify <cli> [--yes] [--json]` — run the adapter contract suite and,
 * when every seam passes, write the certification evidence back into
 * `src/core/agent-compatibility.json` automatically.
 *
 * This is the maintainer-facing counterpart to `repoos doctor --probe`: doctor
 * shows you the result; certify also commits it to the manifest so the next
 * RepoOS release ships the updated compatibility status to all users.
 *
 * The command resolves the manifest path the same way `agent-compatibility.ts`
 * does — src/core/ in a dev checkout, dist/core/ in a built install — and
 * writes back to whichever file it loaded from.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { runAdapterContract } from "../core/agent-contract.js";
import type { AgentCompatibilityContract } from "../core/agent-compatibility.js";
import { parseAgentVersion } from "../core/agent-compatibility.js";
import { c } from "../cli/colors.js";

export interface CertifyCliArgs {
  cli: string | null;
  yes: boolean;
  json: boolean;
  missingCli: boolean;
}

export function parseCertifyArgs(argv: string[]): CertifyCliArgs {
  const yes = argv.includes("--yes");
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const cli = positional[0] ?? null;
  return { cli, yes, json, missingCli: !cli };
}

/** Locate the live manifest file on disk (src or dist). */
function findManifestPath(): string | null {
  const manifestUrl = new URL("../core/agent-compatibility.json", import.meta.url);
  const candidates: string[] = [];
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
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      /* skip */
    }
  }
  return null;
}

interface Manifest {
  schemaVersion: number;
  contracts: AgentCompatibilityContract[];
}

function loadManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function saveManifest(path: string, manifest: Manifest): void {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export async function cmdCertify(argv: string[]): Promise<void> {
  const { cli, yes, json: asJson, missingCli } = parseCertifyArgs(argv);

  if (missingCli || !cli) {
    console.error(c.red("  repoos certify needs a harness id, e.g. `repoos certify opencode`."));
    process.exitCode = 1;
    return;
  }

  const WARNING = [
    "",
    c.yellow(c.bold("⚠ Live compatibility probe + manifest write")),
    "    This runs the adapter contract suite against the installed harness and,",
    "    if every seam passes, writes the certification evidence into",
    "    src/core/agent-compatibility.json. It may use your provider credentials",
    "    and spend tokens. It never reads task files or project content.",
    "",
  ].join("\n");

  if (!yes) {
    if (!process.stdin.isTTY) {
      console.error(c.red("  repoos certify requires --yes when stdin is not a terminal."));
      console.error(c.dim("    repoos certify " + cli + " --yes"));
      process.exitCode = 1;
      return;
    }
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(WARNING);
    const answer = await new Promise<string>((resolve) => {
      rl.question(
        c.bold(`  Run the ${cli} probe and write results to the manifest? [y/N] `),
        resolve,
      );
    });
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(c.dim("  Cancelled."));
      return;
    }
  } else if (!asJson) {
    console.log(WARNING);
  }

  // Run the probe.
  const result = await runAdapterContract({ cli, mode: "live" });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  // Print probe output (same as doctor --probe).
  console.log("");
  console.log(
    "  " +
      c.bold(c.cyan("Adapter contract probe")) +
      c.dim(" — " + result.cli) +
      c.dim(" (" + result.binary + ")"),
  );
  for (const cap of result.capabilities) {
    const icon = cap.ok ? c.green("✔") : c.red("✗");
    console.log("    " + icon + " " + cap.label + c.dim("  (" + cap.id + ")"));
    console.log("      " + c.dim(cap.detail));
  }
  const passCount = result.capabilities.filter((cap) => cap.ok).length;
  const verdict = result.passed
    ? c.green(`PASSED — ${result.capabilities.length}/${result.capabilities.length} seams`)
    : c.red(`FAILED — ${passCount}/${result.capabilities.length} seams`);
  console.log("");
  console.log("  " + verdict + c.dim(`  (${Math.round(result.durationMs / 1000)}s)`));

  if (!result.passed) {
    console.log("");
    console.log(c.dim("  Manifest not updated — probe must pass all seams to certify."));
    console.log("");
    process.exitCode = 1;
    return;
  }

  // Locate the manifest and update it.
  const manifestPath = findManifestPath();
  if (!manifestPath) {
    console.error(c.red("  Cannot find agent-compatibility.json to write certification."));
    console.error(c.dim("  Run from the repoos source checkout, or set REPOOS_ROOT."));
    process.exitCode = 1;
    return;
  }

  const manifest = loadManifest(manifestPath);
  const versionStr = result.detectedVersion ? result.detectedVersion.join(".") : null;
  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const source = `repoos certify ${cli} live probe — ${result.capabilities.length}/${result.capabilities.length} seams passed on ${result.startedAt} against binary ${result.binary}`;

  let contract = manifest.contracts.find((c) => c.cli === cli);
  if (!contract) {
    // Bootstrap a minimal contract for a harness that has no entry yet.
    const major = result.detectedVersion?.[0] ?? 0;
    contract = {
      cli,
      name: cli,
      supportedMajor: major,
      supportedRange: `>=${major}.0.0 <${major + 1}.0.0`,
      newestCertifiedVersion: versionStr,
      knownIncompatibleRanges: [],
      requiredCapabilities: result.capabilities.filter((c) => c.ok).map((c) => c.id),
      verifiedAt: now,
      verificationSource: source,
      upgradeGuidance: `Install the current ${cli} release and re-run \`repoos certify ${cli}\`.`,
      officialUrl: "",
    };
    manifest.contracts.push(contract);
    console.log("");
    console.log("  " + c.yellow("⚠ No existing contract — bootstrapped a new entry."));
    console.log(c.dim("    Review src/core/agent-compatibility.json before committing:"));
    console.log(c.dim(`    officialUrl, upgradeGuidance, and supportedRange may need editing.`));
  } else {
    // Update the three certification fields.
    const prev = contract.newestCertifiedVersion;
    const prevParsed = prev ? parseAgentVersion(prev) : null;
    const thisParsed = result.detectedVersion;

    // Only advance newestCertifiedVersion — never roll it back.
    if (
      !prevParsed ||
      !thisParsed ||
      thisParsed[0] > prevParsed[0] ||
      (thisParsed[0] === prevParsed[0] && thisParsed[1] > prevParsed[1]) ||
      (thisParsed[0] === prevParsed[0] &&
        thisParsed[1] === prevParsed[1] &&
        thisParsed[2] >= prevParsed[2])
    ) {
      contract.newestCertifiedVersion = versionStr;
    }
    contract.verifiedAt = now;
    contract.verificationSource = source;
  }

  saveManifest(manifestPath, manifest);

  console.log("");
  console.log("  " + c.green("✔ Manifest updated") + c.dim(" — " + manifestPath));
  if (versionStr) {
    console.log(c.dim(`    newestCertifiedVersion: ${versionStr}`));
  }
  console.log(c.dim(`    verifiedAt: ${now}`));
  console.log("");
  console.log(c.dim("  Next: review the diff, then commit:"));
  console.log(c.dim(`    git diff src/core/agent-compatibility.json`));
  console.log(
    c.dim(
      `    git add src/core/agent-compatibility.json && git commit -m "cert(${cli}): certify ${versionStr ?? "unknown"}"`,
    ),
  );
  console.log("");
}
