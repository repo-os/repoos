# User-docs accuracy QA (pass 2) — November 2026

Second pass over `user-docs/`, scoped to what changed in the product since
v0.5.89 (released 2026-11-17). The first pass
(`docs/qa/2026-11-user-docs-accuracy.md`) had covered the Hub apps, releases,
remote runners, `remoteValidation.*`, `[[check.steps]]` and the check setting;
this pass verified the rest of the manual against the current CLI (`repoos
--help` v0.5.91 and per-command `--help`), `getConfigSchema()` defaults, and the
current UI labels, tabs and routes.

## Method

- Extracted every documented config key/row from `user-docs/configuration.md`
  and compared each schema-keyed default against `getConfigSchema()`
  programmatically (167 keys). Also diffed the schema and `DEFAULT_CONFIG`
  between the v0.5.89 tag and this worktree to find what changed since the
  baseline; both post-baseline schema additions
  (`remoteValidation.command`, `remoteValidation.requiredTools`) are already
  documented.
- Ran every documented `repoos` subcommand's `--help` and checked flags against
  the docs (`check`, `secrets`, `story`, `schedule`, `dev`, `tunnel`, `agents`,
  `allowlist`, `override`, `review`, `runners`).
- Grepped the docs for every route (`/agents?tab=…`, `/settings?tab=…`),
  page name ("Work Queue"), drawer sub-tab ("UI changes" / "Code changes"),
  Settings tab and section name, and verified each against
  `nav.ts`, `router.ts`, `settings-location.ts`, `SettingsView.vue`,
  `TaskDrawer.vue` and `AgentsView.vue`.
- Verified lifecycle claims against the code: pipeline stage names and the
  10-minute Merged window (`src/core/pipeline-view.ts`), the 45s git-watch
  backstop (`src/ui-app/src/stores/repo.ts`), `sessionMaxAge` (30 days, <300
  read as days), scaffold layout in `src/commands/init.ts` (including init no
  longer auto-opening the browser — no doc claimed it), the supervisor-aware
  update-restart notice (#1185) in `ReleaseUpdateNotification.vue`, and the
  engineering-report draft path/word limits in `src/server/agents.ts`.

## Changes made

- `user-docs/agents.md`: the "Supported coding agents" table said "a driver
  for eight CLIs" and listed eight. The engine registry in
  `src/server/agents.ts` and the Detected Coding Agents tab now support
  **eleven**: added `crush`, `pi` and `muse` rows with their real capabilities
  (plain-text headless runs for crush, strict JSONL + session resume for pi,
  `muse exec --json` JSONL stream + UUID resume for muse). This drift predates
  v0.5.89 (the CLIs landed Sep–Nov 2026) but the text contradicted the current
  UI, so it was fixed.
- `src/cli/help.ts`: the `repoos secrets` usage line in `repoos --help`
  omitted the real `bindings` subcommand (the CLI reference already documented
  it). The help now reads
  `secrets <list|add|replace|delete> <environment> [KEY] | bind <consumer> <environment> [KEY …] | bindings`.
  Verified against this worktree's build (`bun dist/cli/index.js secrets --help`).

## Verified without changes (highlights)

- `user-docs/cli.md`: every subcommand, flag and API route cross-checked —
  restart (`--root`, supervisor recognition), `servers --tailscale` (HTTP
  discovery, fallback sources), hold/unhold, `review keep/again/followup`,
  `verify`, `handoff-status`, secrets, bundle, shots. Matches v0.5.91.
- `user-docs/configuration.md`: all 167 schema-keyed rows match current
  defaults (`maxActiveTasks` 3, `localChecks.*`, `pressureGuard.*`,
  `activityAnimation*`, `storage.provider` default `local`, `retryOtherHosts`
  conditional default). The two keys added since v0.5.89 were already
  documented. Older drift (ntfy) predates the baseline.
- `user-docs/getting-started.md`: install methods, update banner/Restart now
  behavior (#1185), init scaffold layout, starter seeding, `--new` flags, the
  pty fallback script (the launch prompt still exists), docs import/scaffold.
- `user-docs/concepts.md`: "Work Queue" page title, Pipeline⇄Board toggle, six
  stage columns (Coding/Checks/Handoff/Review/Close-out/Merged), 10-minute
  Merged window, archiving rules, canary digit, 45-second git-watch backstop.
- `user-docs/authentication.md`, `native-auth.md`: auth-on guardrails,
  Resend/Google setup, session semantics, dev backdoor limits (env-var only,
  ignored in production), `telegram.provisioningUrl` consistency.
- `user-docs/notifications.md`, `telegram.md`: bell sections, attention feed
  contract, Settings → Notifications (incl. ntfy/Telegram cards),
  "Settings → Authentication & Users" section label still exists in
  `AuthSettingsPanel.vue`.
- `user-docs/review-and-close-out.md`: `review keep`, `review followup`,
  `verify`, close-out notices match the CLI.
- `user-docs/running-with-agents.md`: override rejection rules (HTTP 400),
  `uiVerification.viewportWidths` default `[1024, 375]`, auto-approve policy
  keys (`approval.autoApprove.*`), driver-brief contents.
- `user-docs/ai-agents.md`, `agent-skill.md`, `troubleshooting.md`,
  `dev-tooling.md`, `existing-repo.md`, `tunnels.md`, `dev-targets.md`,
  `built-in-agents.md` (six scanners + Debugger neighbour),
  `engineering-reports.md` (draft path, sections, word limits): spot-verified
  claims against code; no stale statements found.

## Re-verification after crash recovery

The engineer session crashed before handoff; the resumed session re-verified
the report's load-bearing claims independently rather than taking them on
faith:

- Re-ran the configuration cross-check: all 167 `getConfigSchema()` fields and
  every configuration-table row still resolve, and the two post-v0.5.89 schema
  additions (`remoteValidation.command`, `remoteValidation.requiredTools`) are
  documented with the right type, default and restart tier.
- Re-captured `--help` for every command from this worktree's build and
  re-checked the flags quoted in `user-docs/*.md` fenced blocks. The `secrets`
  block in `user-docs/cli.md` matches the corrected help line; `check --fix` /
  `--step` and `doctor --yes` are real in code (`src/commands/check.ts`,
  `src/commands/doctor.ts`) even though the banner omits them — the docs are
  more complete than the banner, not stale.
- Confirmed the "eleven CLIs" count against the engine registry in
  `src/server/agents.ts` (`opencode, claude, copilot, qwen, codex, kiro,
  cursor, antigravity, crush, pi, muse`) and against `KNOWN_AGENTS` in
  `src/core/detect.ts`; the compatibility table in
  `user-docs/coding-harness-compatibility.md` matches
  `src/core/agent-compatibility.json` row for row.
- Confirmed the UI labels quoted by docs against `nav.ts`,
  `settings-location.ts`, `SettingsView.vue`, `AuthSettingsPanel.vue`
  ("Authentication & Users"), `AgentsView.vue` ("Build Your Team",
  "Scheduled Tasks", "Reminders") and `TelegramSettingsPanel.vue`
  ("Send a test message" section, "Send test" button).

## QA notes

No new code bug was uncovered; the only code change is the one-line CLI help
completion above (the docs were right, `--help` was stale). Docs-only
otherwise; no device-specific live test was performed.
