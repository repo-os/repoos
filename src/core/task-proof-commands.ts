/**
 * Parse finite proof/verification commands named in a task body (#0697).
 * Used when the check gate skipped so the reviewer can still run explicit proof.
 */

const INFINITE_PATTERNS =
  /\b(repoos\s+serve|serve\s+--|bun\s+run\s+dev|npm\s+run\s+dev|\bwatch\b|--watch\b|tail\s+-f|&\s*$)/i;

/**
 * Extract shell commands from a `## Proof` / `## Verification` section or a
 * `Proof command:` line. Only returns finite, single-line commands safe for a
 * reviewer to run once.
 */
export function extractTaskProofCommands(body: string): string[] {
  const out: string[] = [];
  const lines = body.split("\n");
  let inProofSection = false;
  let inFence = false;
  let fenceLang = "";

  for (const line of lines) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1].toLowerCase();
      inProofSection = /^(proof|verification)\b/.test(title);
      inFence = false;
      continue;
    }

    const proofLine = line.match(/^\s*proof\s+command\s*:\s*`([^`]+)`/i);
    if (proofLine) {
      maybePush(out, proofLine[1]);
      continue;
    }

    if (!inProofSection) continue;

    const fenceOpen = line.match(/^```(\w*)/);
    if (fenceOpen) {
      if (!inFence) {
        inFence = true;
        fenceLang = fenceOpen[1].toLowerCase();
      } else {
        inFence = false;
        fenceLang = "";
      }
      continue;
    }
    if (inFence && (fenceLang === "" || fenceLang === "bash" || fenceLang === "sh")) {
      const cmd = line.trim();
      if (cmd && !cmd.startsWith("#")) maybePush(out, cmd);
    }
  }

  return [...new Set(out)];
}

function maybePush(out: string[], raw: string): void {
  const cmd = raw.trim();
  if (!cmd || cmd.includes("\n")) return;
  if (INFINITE_PATTERNS.test(cmd)) return;
  out.push(cmd);
}
