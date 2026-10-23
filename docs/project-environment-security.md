# Project environment security boundaries

Project environments keep application credentials separate from RepoOS's own
provider, authentication, and infrastructure credentials. The registry maps
named environments to explicit files; RepoOS never scans `.env*` files or
infers an environment from a branch, worktree, or `NODE_ENV`.

## What the controls enforce

- The secret API and UI return metadata only. Saved values are write-only
  through RepoOS. Admins manage values; signed-in members can inspect metadata.
- Mutations require an admin session and reject a mismatched `Origin`. Responses
  use `Cache-Control: no-store`. Audits record the actor, environment, key name,
  and action, never the value.
- Writes require a gitignored, untracked, safe source path and an expected
  content hash. Writes preserve unrelated lines and replace atomically.
- Bindings grant named keys to one local consumer. Invalid, missing, or stale
  environment selections fail closed. Registered project keys are removed from
  the child's inherited environment before grants are applied, so absent grants
  cannot fall back to an ambient production value.
- Deployment bindings are local intent metadata. Deployment pushes git refs;
  RepoOS does not transfer project values to a provider.

## What they do not enforce

The dotenv files contain ordinary plaintext, not ciphertext. Mode `0600`,
atomic writes, and tracked-file refusal reduce accidental exposure; they do not
protect against the file owner, an administrator, backups, malware, or another
local process with read access. RepoOS agents and commands run with the user's
OS permissions. A process with unrestricted access may read other files, use
ambient credentials not managed as project keys, or access the network.

Names with `VITE_`, `NEXT_PUBLIC_`, and `PUBLIC_` prefixes are labeled public
because build tools may embed them in client assets. The label warns about
intended visibility; it is not a runtime sandbox. Other names default to
server-only metadata, which is not a sandbox guarantee either.

## Integration review

Keep value-bearing sentinels in tests fake and unique. Check route responses,
error bodies, audit/log output, support bundles, activity/transcript surfaces,
task/config files, and screenshot fixtures. Test simultaneous consumers,
missing selected values, production bindings, malformed or hand-edited binding
files, and tracked/symlinked sources. Security coverage belongs in executable
tests alongside each boundary, not in this description alone.
