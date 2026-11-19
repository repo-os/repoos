# CLI help & error messages QA pass — November 2026 (#1228)

A read-only pass comparing `repoos --help`, each command's `--help`, and the
common error messages against `user-docs/cli.md`, fixing what had drifted.
No server state was changed to gather this: every probe ran against a
nonexistent task id, an invalid flag value, or a GET request.

## Method

1. Enumerated every command the CLI dispatcher accepts (`src/cli/index.ts` and
   the command table in `src/cli/help.ts`) and diffed it against the commands
   documented in `user-docs/cli.md` (both `###` sections and the Control-plane
   table).
2. Ran `repoos <cmd> --help` for each entry and compared the usage line and
   flag list with the documented flags and with the flags the command's own
   parser actually accepts.
3. Exercised the common failure paths (unknown command, unknown flag, missing
   arguments, nonexistent task ids, unknown config key, unknown secrets
   environment, unreachable server) and read the messages as a user would.

## Findings and fixes

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Nine commands appear in `repoos --help` but are absent from `user-docs/cli.md` entirely: `rm`, `watch`, `summary`, `review followup`, `allowlist`, `certify`, `migrate`, `checks timings/slots`, `release email` | Documented each in `user-docs/cli.md` (a `###` section, or a Control-plane table row for the server-backed ones) |
| 2 | `repoos check --help` omitted `--fix` and `--step <name>`, both documented and both accepted by the parser | Usage line and flag summary in `src/cli/help.ts` now list them; a test runs `parseCheckArgs(["--fix", "--step", "tests"])` |
| 3 | `repoos doctor --help` omitted `--model <id>`, which the `--probe` mode accepts and the docs document | Added to the usage line and flags; the pinned-string test in `cli-help-doctor.test.ts` now matches the docs |
| 4 | `repoos api GET /api/<typo>` hit the SPA catch-all, printed `"status": 200` and dumped the whole app shell HTML as an `error` string, and exited 0 | `RepoOsApi.request` now detects an HTML body and returns a one-line plain-English message plus an `htmlResponse` marker; `repoos api` prints the message to stderr and exits 1. Other CLI consumers get the same short message through `requestOk` |
| 5 | `repoos config set bogus.key value` failed with the server's generic `No valid fields to update`, which neither named the key nor the fix | The CLI now rewrites that specific reply to `Unknown setting "bogus.key" — RepoOS has no config field with that name…` pointing at Settings and `repoos config get` |
| 6 | Every unknown project environment answered the bare `Unknown project environment`, with no hint where the real ones are listed | The route answers `No project environment named "<id>". See the Secrets page…` (also used by the bindings PUT path) |
| 7 | Nothing stopped a new command from appearing in `--help` while missing from the docs again | New table-driven test `src/ui-app/tests/cli-help-docs-coverage.test.ts` asserts every command in the help table (`GROUPS`) is documented in `user-docs/cli.md`, so the next drift fails CI |

## Verified unchanged (no action needed)

- Unknown command prints the full help; unknown `new`/`update` flags print the
  generated usage (help and usage share the flag table, so they cannot drift).
- `repoos list bogusstatus` names the bad value and the full status list.
- `repoos new "x" --priority medium` rejects with field, value, and the valid
  values list, and never silently defaults (#docs: validation on every write).
- `repoos mv <id> done` on an unmerged branch explains that the flag flip never
  merges and points at `repoos done <id>` / `--force-not-merged`.
- Server-down messages say `Can't reach the RepoOS server at <url>. Is
  `repoos serve` running?` rather than a raw fetch error.
- Nonexistent task ids say `Task #9999 not found.` (with the `✗` marker on
  server-backed commands).
- `repoos mv <id> <status>` usage lists `draft`, which the parser genuinely
  accepts; it is an internal authoring status and stays as-is.

## Guardrail

`docsMention()` in the coverage test uses a negative-lookahead regex so
`repoos new` is not satisfied by the `repoos new-doc` heading, and two-word
entries (`checks timings`) must match as a unit. The sub-command list
(`review again`, `review followup`, `review keep`, `checks timings`,
`checks slots`) is pinned explicitly.
