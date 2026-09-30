/**
 * Best-effort Tailscale detection, used to pick a sane default bind host.
 */
import { execFile, execFileSync } from "node:child_process";
import { connect } from "node:net";

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

// ── HTTPS via `tailscale serve` ────────────────────────────────────────────
// Over plain http on a Tailscale IP the browser is NOT a secure context, so
// crypto.randomUUID, clipboard, service workers etc. are unavailable.
// `tailscale serve` terminates TLS with a real cert for <machine>.<tailnet>.ts.net
// and proxies to us on loopback (tailnet-only; this is not Funnel).

export type TailscaleExec = (args: string[]) => Promise<string>;

/** Ports `tailscale serve` is allowed to expose HTTPS on, in preference order. */
const HTTPS_PORTS = [443, 8443, 10000];

const defaultExec: TailscaleExec = (args) =>
  new Promise((resolve, reject) => {
    execFile("tailscale", args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).toString().trim()));
      else resolve(stdout.toString());
    });
  });

function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(500, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

export interface TailscaleHttpsResult {
  /** The https URL other tailnet devices should use, when serving succeeded. */
  url?: string;
  /** Why HTTPS isn't available (shown as a hint); absent when Tailscale simply isn't usable. */
  reason?: string;
}

/**
 * Best-effort: expose `port` (on 127.0.0.1) over tailnet HTTPS. Never throws.
 * Idempotent across restarts. It never overwrites a `tailscale serve` mapping
 * that belongs to something else: an HTTPS port is taken only when it's free,
 * already ours, or proxies to a loopback port nothing is listening on (stale).
 * No teardown on exit — a stale mapping is reclaimed by the next start.
 */
export async function ensureTailscaleHttps(
  port: number,
  exec: TailscaleExec = defaultExec,
  listening: (port: number) => Promise<boolean> = isListening,
): Promise<TailscaleHttpsResult> {
  try {
    const status = JSON.parse(await exec(["status", "--json"])) as {
      BackendState?: string;
      CertDomains?: string[];
      Self?: { DNSName?: string };
    };
    const host = status.Self?.DNSName?.replace(/\.$/, "");
    if (status.BackendState !== "Running" || !host) return {};
    if (!status.CertDomains?.length) {
      return {
        reason:
          "HTTPS certificates aren't enabled for your tailnet — turn on MagicDNS and HTTPS Certificates at https://login.tailscale.com/admin/dns",
      };
    }

    let cfg: {
      TCP?: Record<string, unknown>;
      Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
    } = {};
    try {
      cfg = JSON.parse((await exec(["serve", "status", "--json"])) || "{}");
    } catch {
      // No serve config yet (older versions error on empty) — treat as empty.
    }

    const target = `http://127.0.0.1:${port}`;
    const urlFor = (p: number) => `https://${host}${p === 443 ? "" : `:${p}`}`;
    for (const p of HTTPS_PORTS) {
      const web = cfg.Web?.[`${host}:${p}`];
      const taken = web !== undefined || cfg.TCP?.[String(p)] !== undefined;
      if (taken) {
        const proxy = web?.Handlers?.["/"]?.Proxy;
        if (proxy?.replace(/\/$/, "") === target) return { url: urlFor(p) };
        const m = proxy && /^http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\/?$/.exec(proxy);
        // Someone else's mapping, or a live RepoOS on another port: leave it.
        if (!m || (await listening(Number(m[1])))) continue;
      }
      await exec(["serve", "--bg", `--https=${p}`, target]);
      return { url: urlFor(p) };
    }
    return {
      reason: "HTTPS ports 443, 8443 and 10000 are all in use by other `tailscale serve` mappings",
    };
  } catch (e) {
    const detail = (e as Error).message.split("\n")[0];
    // Only root (or the configured operator) may change serve config — the
    // usual first-run failure once the tailnet has HTTPS enabled. Say how to fix it.
    if (/access denied|permission denied|serve config denied/i.test(detail ?? "")) {
      return {
        reason:
          "this user isn't allowed to change Tailscale's serve config — run this once, then restart `repoos serve`: `sudo tailscale set --operator=$USER`",
      };
    }
    return {
      reason: `couldn't set up \`tailscale serve\`: ${detail}`,
    };
  }
}
