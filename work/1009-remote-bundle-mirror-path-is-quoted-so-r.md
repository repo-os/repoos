---
id: 1009
title: Remote bundle mirror path is quoted so runners never reuse it
type: bug
status: ready
hold: true
hold_reason: Direct main hotfix in progress; do not dispatch a task engineer
hold_at: "2026-11-02T03:23:50.142Z"
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-02T03:09:44Z"
updated_at: "2026-11-02T03:23:50Z"
---
## Problem
Remote validation uploads about 205–210 MB of full Git history on every run even when runners already contain a persistent mirror. The path builder returns a path beginning with tilde, but both the mirror probe and validate.sh invocation shell-quote that value. Quoted tildes do not expand: the probe looks for a literal tilde-relative path, and validate.sh creates a directory under the runner home named tilde instead of using the hidden cache directory. This was confirmed read-only on thinkpad, bee, and mini: each contains populated mirrors under the accidental home/tilde/.repoos-cache directory while the expected home/.repoos-cache directory is absent. So every probe reports an empty mirror and every upload sends full history.

## Acceptance criteria
- Represent remote mirror paths in a form that survives shell argument quoting and resolves to the intended persistent directory on Linux and macOS, preferably an explicit absolute home path or safe remote-shell expansion.
- Use the same resolved path for probing and the validate.sh argument; do not rely on tilde expansion inside a quoted argument.
- Add focused tests for path resolution and shell command construction, including homes with spaces or shell metacharacters, and verify probe and runner receive the same resolved path.
- Preserve the full-bundle fallback when the mirror is genuinely absent or unusable.
- Document safe one-time cleanup of accidental literal-tilde cache directories, if warranted. Do not delete runner data automatically during validation.
- Verify subsequent runs find the persistent mirror and upload only missing commits when a valid base exists.

## Notes for AI
Inspect remoteMirrorPath, mirrorProbeCommand, validate.sh invocation construction, scripts/remote-runner/validate.sh, and tests covering mirror upload. The related prior work is #0717 and #0917; #1001 fixes the changed-test base ref and is already done. Evidence: on 2026-11-02, all three configured Tailscale runners had populated mirrors under home/tilde/.repoos-cache/repoos-746fff46.git, while the intended home/.repoos-cache path was absent. Recent logs repeatedly say full bundle (mirror empty), including #0999, #1000, and #1007.

## Activity

- 2026-11-02T03:09:44Z · created · njachowski@gmail.com
- 2026-11-02T03:09:44Z · needs_input
- 2026-11-02T03:09:59Z · needs_input, body: Problem (added 1, removed 1); Acceptance criteria (added 5, removed 5); Notes for AI (added)
- 2026-11-02T03:15:03Z · status inbox→ready
- 2026-11-02T03:23:50Z · held, held-reason, held-at
