/**
 * `repoos serve` — start the local RepoOS server: in-memory live index, file
 * watcher, JSON API, and SSE event stream. Stays running until interrupted.
 */
import { basename } from "node:path";
import { startServer } from "../server/server.js";
import { PREVIEW_REQUEST_SIGNAL } from "../server/agents.js";
import { isBun } from "../core/runtime.js";
import { findRepoRoot } from "../core/config.js";
import { c, statusColor } from "../cli/colors.js";
import { kv } from "../cli/layout.js";
import type { RepoEvent } from "../server/live-index.js";
import { readVersion } from "../core/version.js";
import { detectTailscaleIPv4, ensureTailscaleHttps } from "../core/tailscale.js";

/**
 * The OS-visible process title for a `repoos serve` instance:
 * `repoos-<project>`, where `<project>` is the managed root's directory name.
 * This is the same display name the rest of RepoOS uses (`basename(root)` — the
 * PWA manifest, login emails, the instance icon), so `ps`/Activity Monitor can
 * tell which project an instance belongs to without `lsof`/`/api/config`.
 */
export function serveProcessTitle(root: string = findRepoRoot()): string {
  return `repoos-${basename(root) || "repoos"}`;
}

type ExecveFn = (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => never;

/** One-shot marker so the Bun re-exec below can never loop. */
const TITLE_GUARD = "REPOOS_PROCESS_TITLE";

/**
 * Set the OS-visible process title so `ps`/Activity Monitor name the project.
 *
 * Node's `process.title` writes through to the OS directly, but Bun's does NOT
 * (verified on 1.3.x/macOS: the JS property sticks but the kernel argv is
 * untouched, so `ps` still shows `bun … serve`). The mechanism that does work
 * under Bun is `process.execve` — a true exec (same PID, same cwd, same stdio)
 * with a custom argv[0] — so we re-exec once, guarded by {@link TITLE_GUARD}.
 * On the relabeled second pass the marker is deleted immediately, before any
 * child is spawned, so reload replacements and preview children start clean and
 * relabel themselves instead of inheriting a stale "already titled" flag.
 *
 * `execve` is injectable purely so tests can observe the call without replacing
 * the test runner's own process image.
 */
export function setServeProcessTitle(
  title: string,
  execve: ExecveFn | undefined = (process as { execve?: ExecveFn }).execve,
): void {
  process.title = title;
  if (process.env[TITLE_GUARD] === "1") {
    delete process.env[TITLE_GUARD];
    return;
  }
  if (!isBun() || typeof execve !== "function") return; // Node's process.title already reached the OS
  const script = process.argv[1];
  if (!script) return; // no entry path to hand to the re-exec — stay put
  try {
    execve(process.execPath, [title, script, ...process.argv.slice(2)], {
      ...process.env,
      [TITLE_GUARD]: "1",
    });
  } catch {
    // execve failed (platform/permission) — the process is intact and
    // process.title above still stands. Never let a display-only nicety stop
    // the server from starting.
  }
}

/**
 * Picks the bind host: an explicit `--host` always wins; otherwise, if
 * Tailscale is running on this machine, default to 0.0.0.0 (all interfaces)
 * so the server is reachable both from other Tailscale devices AND from
 * localhost — binding to the Tailscale IP alone would leave nothing
 * listening on 127.0.0.1, silently breaking anything on this same machine
 * that assumes localhost reachability (Cloudflare Tunnel's local origin,
 * RepoOS's own tunnel readiness check, etc.). Falls back to localhost-only
 * when Tailscale isn't detected. `tailscaleIP` is surfaced separately (even
 * though the actual bind is 0.0.0.0) so callers can show the address other
 * tailnet devices should actually use.
 */
export function resolveServeHost(explicitHost?: string): {
  host: string;
  tailscaleDetected: boolean;
  tailscaleIP?: string;
} {
  if (explicitHost) return { host: explicitHost, tailscaleDetected: false };
  const tailscaleIP = detectTailscaleIPv4();
  if (tailscaleIP) return { host: "0.0.0.0", tailscaleDetected: true, tailscaleIP };
  return { host: "127.0.0.1", tailscaleDetected: false };
}

/**
 * Whether this `repoos serve` should apply the repo's preview-only
 * `[preview.*]` config overlay (#0464).
 *
 * Precedence, lowest to highest: the REPOOS_PREVIEW_CHILD=1 marker (set by
 * PreviewManager on every managed preview child) turns it on; an explicit
 * `--no-preview-overrides`/`--preview-overrides` flag always wins. An ordinary
 * `repoos serve` has neither, so it resolves the base configuration unchanged.
 * Exported for tests.
 */
export function resolvePreviewOverrides(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  let explicit: boolean | undefined;
  for (const arg of args) {
    if (arg === "--preview-overrides") explicit = true;
    else if (arg === "--no-preview-overrides") explicit = false;
  }
  return explicit ?? env.REPOOS_PREVIEW_CHILD === "1";
}

/**
 * True when this process is a managed agent (REPOOS_AGENT=1) attempting to
 * launch `repoos serve` directly, as opposed to a preview child or a reload
 * replacement spawned by the main server. The AgentRunner sets REPOOS_AGENT=1
 * on every agent spawn; the preview/reload markers are exempt so RepoOS-owned
 * processes keep working. Exported for the defense-in-depth tests (#0096).
 */
export function directServeBlockedByAgent(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REPOOS_AGENT === "1" && env.REPOOS_PREVIEW_CHILD !== "1" && env.REPOOS_RELOAD !== "1";
}

export interface BannerRow {
  label: string;
  /** May contain ANSI codes. */
  value: string;
}

/**
 * The startup banner: a title line with the running version, an aligned
 * label/value table, and — when Tailscale HTTPS could not be set up — a
 * highlighted warning block that separates the problem from its fix. Pure
 * (returns a string) so tests can assert on it with colors off.
 */
export function renderServeBanner(
  version: string,
  rows: readonly BannerRow[],
  httpsWarning?: string,
): string {
  const out: string[] = [
    "",
    `  ${c.bold(c.cyan("◆ RepoOS"))} ${c.dim("v" + version)}  ${c.green("● running")}`,
    "",
    // Shared label/value layout (#0591) so long URLs wrap at the terminal width
    // instead of running off the edge.
    kv(
      rows.map((r) => ({ label: c.dim(r.label), value: r.value })),
      { indent: 2 },
    ),
  ];
  if (httpsWarning) {
    // Reasons read "<problem> — <fix> <url>": put the problem, the fix and the
    // link on their own lines so the actionable part isn't buried.
    const [problem, ...rest] = httpsWarning.split(" — ");
    const fixText = rest.join(" — ");
    const url = /https?:\/\/\S+/.exec(fixText)?.[0];
    // A `backticked` span in the fix is a shell command: show it on its own line.
    const command = /`([^`]+)`\s*$/.exec(fixText)?.[1];
    let fix = fixText;
    if (url) fix = fix.replace(url, "");
    if (command) fix = fix.replace(/`[^`]+`\s*$/, "");
    fix = fix
      .replace(/\s*\bat\s*$/, "")
      .replace(/:\s*$/, "")
      .trim();
    out.push("", `  ${c.yellow("▲")} ${c.bold(c.yellow("Tailscale HTTPS unavailable"))}`);
    out.push(`    ${c.dim(problem ?? "")}`);
    if (fix) out.push(`    ${c.bold("Fix:")} ${fix}${url ? c.dim(" at") : ""}`);
    if (url) out.push(`         ${c.cyan(url)}`);
    if (command) out.push(`         ${c.dim("$")} ${c.cyan(c.bold(command))}`);
    out.push(
      `    ${c.dim("or pass")} ${c.cyan("--no-tailscale-https")} ${c.dim("to silence this")}`,
    );
  }
  out.push("", c.dim("  press ^C to stop"), "");
  return out.join("\n");
}

export async function cmdServe(
  args: string[],
  opts: { onShutdown?: () => void; onReady?: (url: string) => void } = {},
): Promise<void> {
  // Defense in depth (#0096): a managed agent process must never start its own
  // `repoos serve`. An agent that ignores the mission and runs `repoos serve`
  // directly is rejected here BEFORE binding, so it can never grab the main
  // server port.
  if (directServeBlockedByAgent()) {
    console.error(c.red("  ✗ Managed agent processes may not launch `repoos serve`."));
    console.error(
      c.dim(
        "    RepoOS owns previews and the control-plane port. Request a managed preview instead:",
      ),
    );
    console.error(
      c.dim(`      include this exact line in your response: ${PREVIEW_REQUEST_SIGNAL}`),
    );
    console.error(
      c.dim(
        "    RepoOS starts the preview from your worktree, probes it server-side, and records the URL + result in your transcript.",
      ),
    );
    process.exitCode = 1;
    return;
  }

  // Undefined = "no --port flag"; startServer then resolves it from
  // repoos.toml's `servePort` or a stable per-repo derived port. Explicit
  // `--port` still wins.
  let port: number | undefined;
  let explicitHost: string | undefined;
  let quiet = false;
  let tailscaleHttps = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") port = Number(args[++i]);
    else if (args[i] === "--host") explicitHost = args[++i];
    else if (args[i] === "--quiet" || args[i] === "-q") quiet = true;
    else if (args[i] === "--no-tailscale-https") tailscaleHttps = false;
  }
  // Preview-only config overlay (#0464). A managed preview child
  // (REPOOS_PREVIEW_CHILD=1, set by PreviewManager) applies the repo's
  // `[preview.*]` overlay by default; every ordinary `repoos serve` resolves
  // the base configuration. `--preview-overrides` forces it on (UI-test
  // previews); `--no-preview-overrides` is the escape hatch back to base.
  const applyPreviewOverrides = resolvePreviewOverrides(args);
  const { host, tailscaleDetected, tailscaleIP } = resolveServeHost(explicitHost);

  let handle;
  try {
    // REPOOS_RELOAD=1 marks a replacement spawned by the auto-reload manager:
    // it retries EADDRINUSE until the old process hands the port over.
    handle = await startServer({
      port,
      host,
      hostExplicit: explicitHost !== undefined,
      previewOverrides: applyPreviewOverrides,
      reloadReplacement: process.env.REPOOS_RELOAD === "1",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (
      msg.includes("EADDRINUSE") ||
      msg.includes("already bound") ||
      msg.includes("already in use")
    ) {
      // The message already names the port (node's EADDRINUSE string or
      // detectConflict's own text).
      console.error(c.red("  " + msg) + c.dim("  ·  pass --port N to use a different one"));
    } else {
      console.error(c.red("  Failed to start server: " + msg));
    }
    process.exitCode = 1;
    return;
  }

  const snap = handle.index.snapshot();
  const rt = isBun()
    ? `Bun ${(process.versions as { bun?: string }).bun ?? ""}`.trim()
    : `Node ${process.versions.node}`;
  const rows: BannerRow[] = [
    { label: "Local", value: c.cyan(c.bold(handle.url)) },
    { label: "Events", value: c.cyan(handle.url + "/api/events") + c.dim("  (SSE)") },
    { label: "Watching", value: `${snap.taskCount} tasks` },
    { label: "Runtime", value: rt },
  ];
  // Report an active preview-only overlay and its effective keys (#0464), so a
  // preview that deliberately differs from the base config is never silent.
  if (handle.previewOverrides?.length) {
    rows.push({ label: "Preview", value: c.yellow(handle.previewOverrides.join(", ")) });
  }
  if (tailscaleDetected) {
    rows.push({
      label: "Tailnet",
      value:
        c.cyan(`http://${tailscaleIP}:${handle.port}`) +
        c.dim("  (all interfaces; ") +
        c.cyan("--host 127.0.0.1") +
        c.dim(" to restrict)"),
    });
  }
  // HTTPS for tailnet devices (a plain-http IP isn't a secure context, so
  // crypto.randomUUID etc. are missing). Skipped for managed previews, which
  // must not touch the machine's `tailscale serve` config.
  let httpsWarning: string | undefined;
  if (tailscaleDetected && tailscaleHttps && process.env.REPOOS_PREVIEW_CHILD !== "1") {
    const https = await ensureTailscaleHttps(handle.port);
    if (https.url) {
      rows.push({
        label: "Tailnet HTTPS",
        value: c.green(c.bold(https.url)) + c.dim("  (secure context)"),
      });
    } else if (https.reason) {
      httpsWarning = https.reason;
    }
  }
  console.log(renderServeBanner(readVersion(), rows, httpsWarning));

  // Fires only now that the server is actually listening (handle.url is a
  // live, bound address) — a caller opening a browser tab any earlier races
  // the server's own startup and shows connection errors until a manual
  // reload.
  opts.onReady?.(handle.url);

  // Live activity log in the terminal, mirroring the SSE stream.
  if (!quiet) {
    handle.index.on((e: RepoEvent) => {
      const t = new Date().toTimeString().slice(0, 8);
      const stamp = c.dim(t + "  ");
      if (e.type === "task.created")
        console.log(stamp + c.green("created ") + c.dim("#" + e.task.id) + " " + e.task.title);
      else if (e.type === "task.updated") {
        const changed = Object.keys(e.prev).join(", ");
        const statusBit =
          e.prev.status !== undefined ? " → " + statusColor(e.task.status)(e.task.status) : "";
        console.log(
          stamp +
            c.cyan("updated ") +
            c.dim("#" + e.task.id) +
            statusBit +
            c.dim("  (" + changed + ")"),
        );
      } else if (e.type === "task.deleted")
        console.log(stamp + c.red("deleted ") + c.dim("#" + e.id));
    });
  }

  let shuttingDown = false;
  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      c.dim(`\n  shutting down after ${signal} (pid ${process.pid}, port ${handle.port})…`),
    );
    await handle.close(`received ${signal}`);
    opts.onShutdown?.();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
