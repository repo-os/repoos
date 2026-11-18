# CLI usability QA — November 2026

## Scope and method

Exercised `list`, `show`, `new`, `update`, `start`, `mv`, `done`, `review`, `handoff-status`, `upgrade`, and `restart` with `--help` and representative missing or invalid arguments. The compiled CLI was run from `/tmp/repoos-cli-qa-scratch`, a disposable repository with an empty `work/` directory. Help for all eleven commands exited 0. Missing required arguments for `show`, `new`, `update`, `start`, `mv`, `done`, `review`, and `handoff-status` exited 1 and printed usage. `restart --port nope` exited 1. No mutating command was run against a real board.

One initial exploratory invocation used the linked `repoos` executable before the scratch setup; because it resolves board state to the main checkout from a linked worktree, it printed the main board. It was read-only and made no changes. All subsequent CLI probes used the compiled entry point from the scratch repository.

## Findings and changes

- **`list` silently accepted an unknown status.** `repoos list nonsense` previously treated the unknown filter as no filter and printed the full board with exit 0. It now rejects the input before making a server request or reading board state, prints the available columns (`inbox`, `ready`, `active`, `review`, `done`, `archived`) and usage, and exits 1. A regression test verifies the error, choices, usage, and exit code.
- **`upgrade` silently ignored an invalid channel.** `repoos upgrade --channel invalid` previously returned success on a source install because the parser converted unsupported values to the default stable channel. It now rejects unsupported and missing values, identifies the accepted channels (`beta`, `canary`, `rc`), prints usage, and exits 1. Regression coverage checks both forms.
- **`upgrade` previously accepted repeated channel flags.** A review follow-up found `repoos upgrade --channel beta --channel invalid` used the first value and ignored the invalid second value. Repeated `--channel` flags now fail with an instruction to provide one channel; a regression test covers this ordering.
- **Help and required-argument behavior for the requested set was otherwise consistent in this pass.** Per-command help showed the command usage and exited 0. Missing required arguments in the tested commands printed usage and exited 1. `restart --port nope` identified the bad value and exited 1. This pass did not exhaust every flag combination or every API/server failure state.

## Limits

The scratch CLI run did not start a server, make network calls, or execute successful task mutations. `start`, `done`, `review`, and `handoff-status` were checked for missing-argument handling; server-backed responses for valid IDs depend on a live RepoOS server and were outside this pass. The board itself was not modified.
