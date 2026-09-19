---
id: "0453"
title: Add a redacted support bundle for failed setups
type: feature
status: ready
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
cli_override: opencode
model_override: default
created_at: "2026-09-19T16:43:47Z"
updated_at: "2026-09-19T22:36:05Z"
---
## Outcome

When RepoOS fails on an unfamiliar real-world project, let the user create a small, inspectable, redacted diagnostic artifact they can attach to an issue or share with support—without exposing source code, prompts, task content, credentials, or their raw environment.

## Desired UX

Provide a local command such as `repoos support bundle` and an equivalent UI entry point after a failed readiness/setup/check path. Before creating the archive, show exactly what categories will be included and where the resulting file will be written. Never upload it automatically.

## Default bundle contents

Include only structured, redacted diagnostic information that is useful to reproduce setup failures:

- [ ] RepoOS version/build metadata, platform/runtime versions, and a timestamp.
- [ ] Sanitized `repoos doctor --json` findings once #0451 exists.
- [ ] Effective configuration *shape* and non-sensitive feature flags/schema version, with all secret values and unsafe free-form fields removed.
- [ ] Agent/tool detection summary and versions, check-plan summary, and the classified result of the latest relevant check/init/doctor operation.
- [ ] Server/health/lifecycle diagnostics and bounded recent error context when locally available, with file contents excluded.
- [ ] A machine-readable manifest listing every included file, collection time, and redaction rules/version.

## Privacy and safety requirements

- [ ] Never include `.env`, environment values, provider/API tokens, passwords, cookies, SSH keys, auth/session material, raw prompts, agent transcripts, task bodies, source code, diffs, attachments, or unredacted logs.
- [ ] Redact known secret formats and sensitive key names defensively even in otherwise permitted diagnostic strings. Treat a redaction miss as a blocker, not a best-effort warning.
- [ ] Minimize paths: remove usernames/home directories and project-specific absolute paths unless the user explicitly opts into an inspectable, documented exception.
- [ ] Default output stays on the local machine; opening a browser, copying to clipboard, network upload, or issue creation all require an explicit separate user action.
- [ ] Do not alter the project, service state, credentials, or Git state while collecting diagnostics.
- [ ] Provide `--dry-run`/preview output and a clear way to inspect the archive contents before sharing.

## Implementation notes

Use a versioned, structured report as the source of truth and package it only after redaction. Avoid archiving arbitrary log directories or configuration files wholesale. Prefer allowlists of individual fields over denylisting files.

The command should still create a useful bundle if a server is down, a provider CLI is missing, or repoos.toml cannot parse. Each omitted category must state why it was unavailable.

## Acceptance criteria

- An engineer can diagnose common init/config/tool/check/lifecycle failures from the bundle without asking the user to paste broad logs or secrets.
- Adversarial tests prove representative API keys, bearer tokens, private paths, dotenv values, and prompt/source snippets cannot appear in the archive or manifest.
- The user can enumerate every bundled file before sharing it.
- The feature works offline and does not require support infrastructure.
- `repoos check` passes.

## Dependencies

Consume the structured doctor output from #0451 where available. Coordinate with #0448 for the authoritative secret/environment inventory, but do not make documentation text itself the redaction mechanism.

## Original prompt

P2 — Add a redacted support bundle for failed real-world setups.

## Activity

- 2026-09-19T16:43:47Z · created · unknown
- 2026-09-19T22:15:06Z · status inbox→ready
- 2026-09-19T22:36:05Z · cli_override, model_override
