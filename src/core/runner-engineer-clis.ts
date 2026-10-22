/**
 * Remote runner engineer CLI check/setup (#0915).
 *
 * Each tailnet host may declare which headless engineer CLIs it should run
 * (`engineers = ["opencode", "codex", "cursor"]` on a
 * `[[remoteValidation.tailscaleHosts]]` row). RepoOS probes installed /
 * version / signed-in state over SSH using each CLI's own safe status
 * commands — never reading credential files — and redacts secret-shaped
 * output before it reaches logs, the Runners tab, or `repoos runners check`.
 *
 * OpenCode's `auth list` is intentionally avoided: it fails with "Could not
 * resolve npm bin" on several installs; `opencode models` is the probe instead
 * (see docs/remote-validation.md).
 */
import { KNOWN_AGENTS, parseAuthState } from "./detect.js";
import { redactText } from "./redact.js";
import type { RemoteValidationConfig, RemoteValidationHost } from "./types.js";
import { remoteHostUser } from "./remote-hosts.js";

/** Stable ids used in config and CLI flags. */
export const RUNNER_ENGINEER_CLI_IDS = ["opencode", "codex", "cursor"] as const;
export type RunnerEngineerCliId = (typeof RUNNER_ENGINEER_CLI_IDS)[number];

export type RunnerEngineerAuthState = "signed-in" | "not-signed-in" | "unknown";

export interface RunnerEngineerCliSpec {
  id: RunnerEngineerCliId;
  binary: string;
  installCommand: string;
  loginCommand: string;
}

const SPECS: Record<RunnerEngineerCliId, RunnerEngineerCliSpec> = {
  opencode: {
    id: "opencode",
    binary: "opencode",
    installCommand: "npm install -g opencode-ai",
    loginCommand: "opencode auth login",
  },
  codex: {
    id: "codex",
    binary: "codex",
    installCommand: "npm install -g @openai/codex",
    loginCommand: "codex login",
  },
  cursor: {
    id: "cursor",
    binary: "cursor-agent",
    installCommand: "curl https://cursor.com/install -fsS | bash",
    loginCommand: "cursor-agent login",
  },
};

export function runnerEngineerCliSpec(id: string): RunnerEngineerCliSpec | null {
  const norm = normalizeRunnerEngineerCliId(id);
  return norm ? SPECS[norm] : null;
}

/** Accept `cursor` / `cursor-agent` / `opencode` / `codex`. */
export function normalizeRunnerEngineerCliId(raw: string): RunnerEngineerCliId | null {
  const s = raw.trim().toLowerCase();
  if (s === "cursor-agent" || s === "cursor") return "cursor";
  if (s === "opencode" || s === "opencode2") return "opencode";
  if (s === "codex") return "codex";
  return (RUNNER_ENGINEER_CLI_IDS as readonly string[]).includes(s)
    ? (s as RunnerEngineerCliId)
    : null;
}

/** Declared engineer CLIs for a host row (empty when unset). */
export function declaredEngineerClis(host: RemoteValidationHost): RunnerEngineerCliId[] {
  const raw = host.engineers;
  if (!raw?.length) return [];
  const out: RunnerEngineerCliId[] = [];
  for (const entry of raw) {
    const id = normalizeRunnerEngineerCliId(String(entry));
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export interface RunnerEngineerCliCell {
  cli: RunnerEngineerCliId;
  declared: boolean;
  installed: boolean;
  version: string | null;
  auth: RunnerEngineerAuthState;
  /** Provider names or a short reason — never secrets. */
  detail: string | null;
  /** Copyable fix (install or login line). */
  fix: string | null;
  ok: boolean;
}

export interface RunnerEngineerHostReport {
  host: string;
  user: string;
  cells: RunnerEngineerCliCell[];
  /** True when every declared cell is green. */
  ok: boolean;
  checkedAt?: string;
}

/** Printed first by the remote probe so tests can recognise output. */
export const RUNNER_ENGINEER_CLI_PROBE_TOKEN = "__REPOOS_ENGINEER_CLI__";

/** One JSON line per CLI after the token line. */
export interface RunnerEngineerProbeLine {
  cli: RunnerEngineerCliId;
  installed: boolean;
  version?: string | null;
  auth: RunnerEngineerAuthState;
  detail?: string | null;
}

/** Redact secrets from probe output before display or persistence. */
export function redactRunnerEngineerProbeOutput(text: string): string {
  return redactText(text);
}

export function parseRunnerEngineerProbeOutput(text: string): RunnerEngineerProbeLine[] {
  const redacted = redactRunnerEngineerProbeOutput(text);
  const lines = redacted.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === RUNNER_ENGINEER_CLI_PROBE_TOKEN);
  if (start < 0) return [];
  const out: RunnerEngineerProbeLine[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      const row = JSON.parse(line) as RunnerEngineerProbeLine;
      const cli = normalizeRunnerEngineerCliId(row.cli);
      if (!cli) continue;
      const auth =
        row.auth === "signed-in" || row.auth === "not-signed-in" || row.auth === "unknown"
          ? row.auth
          : "unknown";
      out.push({
        cli,
        installed: row.installed === true,
        version: typeof row.version === "string" ? row.version : null,
        auth,
        detail: typeof row.detail === "string" ? row.detail : null,
      });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

function cellFromProbe(
  cli: RunnerEngineerCliId,
  declared: boolean,
  probe: RunnerEngineerProbeLine | undefined,
): RunnerEngineerCliCell {
  const spec = SPECS[cli];
  if (!probe) {
    return {
      cli,
      declared,
      installed: false,
      version: null,
      auth: "unknown",
      detail: declared ? "probe returned no data" : null,
      fix: declared ? spec.installCommand : null,
      ok: !declared,
    };
  }
  const installed = probe.installed;
  const auth = probe.auth;
  const signedOk = auth === "signed-in";
  const ok = !declared || (installed && signedOk);
  let fix: string | null = null;
  if (declared && !installed) fix = spec.installCommand;
  else if (declared && installed && !signedOk) fix = spec.loginCommand;

  return {
    cli,
    declared,
    installed,
    version: probe.version ?? null,
    auth,
    detail: probe.detail ?? null,
    fix,
    ok,
  };
}

/** Merge declared CLIs with probe lines into a host report. */
export function buildRunnerEngineerHostReport(
  host: RemoteValidationHost,
  rv: RemoteValidationConfig | undefined,
  probeLines: RunnerEngineerProbeLine[],
  checkedAt?: string,
): RunnerEngineerHostReport {
  const declared = declaredEngineerClis(host);
  const byCli = new Map(probeLines.map((p) => [p.cli, p]));
  const cells: RunnerEngineerCliCell[] = [];
  const seen = new Set<RunnerEngineerCliId>();

  for (const cli of declared) {
    seen.add(cli);
    cells.push(cellFromProbe(cli, true, byCli.get(cli)));
  }
  for (const line of probeLines) {
    if (seen.has(line.cli)) continue;
    cells.push(cellFromProbe(line.cli, false, line));
  }

  const ok = declared.length === 0 || declared.every((id) => cells.find((c) => c.cli === id)?.ok);
  return {
    host: host.host,
    user: rv ? remoteHostUser(rv, host) : host.user ?? "root",
    cells,
    ok,
    checkedAt,
  };
}

/** CLIs on a host that are declared and fully ready (for #0913 placement). */
export function hostAdvertisedEngineerClis(report: RunnerEngineerHostReport): RunnerEngineerCliId[] {
  return report.cells.filter((c) => c.declared && c.ok).map((c) => c.cli);
}

/**
 * Remote shell script: one JSON object per requested CLI on stdout after the
 * token line. Safe to run non-interactively over SSH.
 */
const PROBE_EMIT_HELPER = [
  "__repoos_ec_print() {",
  '  REPOOS_EC_CLI="$1" REPOOS_EC_INST="$2" REPOOS_EC_AUTH="$3" REPOOS_EC_VER="$4" REPOOS_EC_DETAIL="$5"',
  "  bun -e 'const o={cli:process.env.REPOOS_EC_CLI,installed:process.env.REPOOS_EC_INST===\"1\",version:process.env.REPOOS_EC_VER||null,auth:process.env.REPOOS_EC_AUTH,detail:process.env.REPOOS_EC_DETAIL||null};console.log(JSON.stringify(o));' 2>/dev/null ||",
  "  node -e 'const o={cli:process.env.REPOOS_EC_CLI,installed:process.env.REPOOS_EC_INST===\"1\",version:process.env.REPOOS_EC_VER||null,auth:process.env.REPOOS_EC_AUTH,detail:process.env.REPOOS_EC_DETAIL||null};console.log(JSON.stringify(o));'",
  "}",
].join("\n");

export function runnerEngineerProbeCommand(clis: RunnerEngineerCliId[]): string {
  const uniq = [...new Set(clis)];
  const parts: string[] = [PROBE_EMIT_HELPER, `printf '%s\\n' ${shellQuote(RUNNER_ENGINEER_CLI_PROBE_TOKEN)}`];
  for (const cli of uniq) {
    parts.push(probeCliFragment(cli));
  }
  return parts.join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function probeCliFragment(cli: RunnerEngineerCliId): string {
  const spec = SPECS[cli];
  const bin = spec.binary;
  switch (cli) {
    case "opencode":
      return [
        `if ! command -v ${bin} >/dev/null 2>&1; then`,
        `__repoos_ec_print ${cli} 0 unknown "" "not on PATH"`,
        "else",
        `_ver=$(${bin} --version 2>/dev/null | head -n1)`,
        `_models=$(${bin} models 2>&1 | head -n15)`,
        `if printf '%s' "$_models" | grep -qiE 'not signed in|authentication required|auth login'; then`,
        `__repoos_ec_print ${cli} 1 not-signed-in "$_ver" "models probe: not signed in"`,
        `elif printf '%s' "$_models" | grep -q '/'; then`,
        `_prov=$(printf '%s\\n' "$_models" | awk '{print $1}' | grep '/' | cut -d/ -f1 | sort -u | head -n3 | tr '\\n' ',' | sed 's/,$//')`,
        `__repoos_ec_print ${cli} 1 signed-in "$_ver" "$_prov"`,
        "else",
        `__repoos_ec_print ${cli} 1 unknown "$_ver" "models probe inconclusive"`,
        "fi",
        "fi",
      ].join("\n");
    case "codex":
      return [
        `if ! command -v ${bin} >/dev/null 2>&1; then`,
        `__repoos_ec_print ${cli} 0 unknown "" "not on PATH"`,
        "else",
        `_ver=$(${bin} --version 2>/dev/null | head -n1)`,
        `_st=$(${bin} login status 2>&1 | head -n5)`,
        `if printf '%s' "$_st" | grep -qiE 'logged in|signed in|authenticated'; then`,
        `__repoos_ec_print ${cli} 1 signed-in "$_ver" "chatgpt"`,
        `elif printf '%s' "$_st" | grep -qiE 'not logged|not signed|login'; then`,
        `__repoos_ec_print ${cli} 1 not-signed-in "$_ver" "login status: not signed in"`,
        "else",
        `__repoos_ec_print ${cli} 1 unknown "$_ver" "login status failed"`,
        "fi",
        "fi",
      ].join("\n");
    case "cursor":
      return [
        `if ! command -v ${bin} >/dev/null 2>&1; then`,
        `__repoos_ec_print ${cli} 0 unknown "" "not on PATH"`,
        "else",
        `_ver=$(${bin} --version 2>/dev/null | head -n1)`,
        `_json=$(${bin} status --format json 2>/dev/null | head -c 4000)`,
        `if printf '%s' "$_json" | grep -q '"isAuthenticated":true'; then`,
        `_acct=$(printf '%s' "$_json" | sed -n 's/.*"account":"\\([^"]*\\)".*/\\1/p' | head -n1)`,
        `__repoos_ec_print ${cli} 1 signed-in "$_ver" "$_acct"`,
        `elif printf '%s' "$_json" | grep -qiE '"isAuthenticated":false|not authenticated|unauthenticated'; then`,
        `__repoos_ec_print ${cli} 1 not-signed-in "$_ver" "cursor-agent status"`,
        "else",
        `__repoos_ec_print ${cli} 1 unknown "$_ver" "status probe failed"`,
        "fi",
        "fi",
      ].join("\n");
    default:
      return `__repoos_ec_print ${cli} 0 unknown "" "unsupported"`;
  }
}

/** Install missing declared CLIs on a host (idempotent shell). */
export function runnerEngineerSetupCommand(clis: RunnerEngineerCliId[]): string {
  const uniq = [...new Set(clis)];
  const parts: string[] = ["set -e"];
  for (const cli of uniq) {
    const spec = SPECS[cli];
    parts.push(
      `if ! command -v ${spec.binary} >/dev/null 2>&1; then`,
      `  echo "==> installing ${cli} (${spec.installCommand})"`,
      `  ${spec.installCommand}`,
      "else",
      `  echo "==> ${cli}: already installed ($(${spec.binary} --version 2>/dev/null | head -n1))"`,
      "fi",
    );
  }
  return parts.join("\n");
}

export function runnerEngineerLoginSshCommand(
  rv: RemoteValidationConfig,
  host: RemoteValidationHost,
  cli: RunnerEngineerCliId,
): string {
  const spec = SPECS[cli];
  const user = remoteHostUser(rv, host);
  return `ssh -t ${user}@${host.host} ${shellQuote(spec.loginCommand)}`;
}

/** Map runner engineer id to Agents-page known agent (for version hints). */
export function knownAgentForRunnerCli(id: RunnerEngineerCliId): (typeof KNOWN_AGENTS)[number] | undefined {
  const map: Record<RunnerEngineerCliId, string> = {
    opencode: "opencode",
    codex: "codex",
    cursor: "cursor",
  };
  return KNOWN_AGENTS.find((a) => a.id === map[id]);
}

/** Parse cursor JSON auth locally (shared with remote node one-liner semantics). */
export function parseCursorAuthJson(text: string): { auth: RunnerEngineerAuthState; detail: string | null } {
  const auth = parseAuthState(text);
  if (auth === true) {
    try {
      const j = JSON.parse(text.trim()) as Record<string, unknown>;
      const detail =
        typeof j.account === "string"
          ? j.account
          : typeof j.email === "string"
            ? j.email
            : "authenticated";
      return { auth: "signed-in", detail };
    } catch {
      return { auth: "signed-in", detail: "authenticated" };
    }
  }
  if (auth === false) return { auth: "not-signed-in", detail: "cursor-agent status" };
  return { auth: "unknown", detail: "status probe failed" };
}
