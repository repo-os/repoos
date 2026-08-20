/**
 * Best-effort Tailscale detection, used to pick a sane default bind host.
 */
import { execFileSync } from "node:child_process";

/** This machine's Tailscale IPv4 address, or null if Tailscale isn't installed/running. */
export function detectTailscaleIPv4(): string | null {
  try {
    const out = execFileSync("tailscale", ["ip", "-4"], {
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}
