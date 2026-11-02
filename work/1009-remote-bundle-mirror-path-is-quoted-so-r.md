---
id: 1009
title: Remote bundle mirror path is quoted so runners never reuse it
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-02T03:09:44Z"
updated_at: "2026-11-02T03:09:44Z"
---
## Problem
Remote validation uploads about 205–210 MB of full Git history on every run even when a runner already has a persistent mirror. The root cause is that remoteMirrorPath returns a path beginning with , then both the mirror probe and validate.sh invocation shell-quote that value. Quoted tildes do not expand: probes look for a literal  relative path, and validate.sh creates  instead of . This was confirmed on thinkpad, bee, and mini: each has a populated mirror under the accidental  directory while the expected  directory is absent. As a result every probe reports an empty mirror and every upload sends full history.

## Acceptance criteria
- Represent remote mirror paths in a form that survives shell argument quoting and resolves to the intended persistent directory on Linux and macOS (prefer an explicit absolute home path or safely expand it in the remote shell).
- Use the same resolved path for mirror probing and for the validate.sh argument; do not rely on shell tilde expansion inside a quoted argument.
- Add focused tests covering command construction/path resolution with spaces or shell metacharacters in home paths, and asserting that probe and runner use the same resolved mirror path.
- Preserve the full-bundle fallback when the mirror is genuinely absent or unusable.
- Document one-time cleanup of the accidental literal-tilde cache only if safe; do not delete remote data automatically as part of validation.
- Verify subsequent runs report an existing mirror and upload only missing commits when a valid base exists.

## Activity

- 2026-11-02T03:09:44Z · created · njachowski@gmail.com
- 2026-11-02T03:09:44Z · needs_input
