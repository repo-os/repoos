# ADR 0010: Named project environments and file-backed secrets

## Status

Accepted for the storage foundation.

## Decision

An environment identifier is a user-selected stable name matching `[A-Za-z][A-Za-z0-9_-]{0,63}`. It is configuration metadata, never a branch, worktree, filename convention, or `NODE_ENV` value. A registry explicitly maps each environment to an ordered list of source identifiers and repository-relative files. No recursive discovery or implicit filename mapping is permitted.

Sources are read in listed order; later sources override earlier values. Repeated assignments within one file are errors, since their meaning is ambiguous. `.env.example` mappings contribute key names only and never values. Expected keys are the union of example keys; effective values come only from the registered secret sources.

Until a project opts into this registry, the existing root `.env` startup loader remains authoritative and unchanged: already-present process values win, and its historical minimal parsing behavior is preserved. Named project values are a separate data plane. They must never be copied into RepoOS provider, auth, or infrastructure process settings. Those credentials retain their fixed names and dedicated storage paths.

Visibility is metadata attached by the consumer contract: server-only is the default. A binding stored in local `.repoos/environment-bindings.json` selects one named environment and an explicit list of granted keys. Values are read only for child-process construction and are never installed into the RepoOS server's `process.env`. A granted key missing from the selected environment is removed from the child's inherited environment; there is no fallback to another environment. No implicit inheritance or branch access is granted. The grant constrains RepoOS injection but is not a security sandbox for an unrestricted local agent.

## Storage safety

Only explicitly registered, repository-relative, gitignored files may be written. Tracked destinations, path traversal, symlinks, unsupported dotenv syntax, duplicate keys, and multiline values are rejected. Writes preserve comments and unrelated lines, use quoted one-line values where needed, require the caller's previously observed content hash, and replace the file atomically with mode `0600`.

## Consequences

Management APIs and process bindings can build on a stable contract without changing legacy startup behavior. Source precedence is visible and deterministic. The minimal parser intentionally does not implement shell expansion or every dotenv dialect; unsupported forms require an explicit future design.
