# Agent process safety (#0675)

Evidence from the first agent-driven project run (opex, story #0008): engineer
agents repeatedly ran machine-wide `pkill -f …` to clean up dev servers they had
started. Those commands matched every process on the laptop with the same name and
killed the owner's long-running servers. Separately, detached `repoos serve`
processes started from agent shells were SIGTERMed within about 15–45 seconds.

## Managed agent turns: process groups

RepoOS spawns each managed agent CLI with its own POSIX process group (`detached:
true` on the spawn). When the turn ends — natural exit, deliberate stop, or
handoff — the runner signals that group so any helper the agent started in the
same tree is torn down without touching unrelated processes elsewhere on the
machine.

If a child daemonizes out of the group (double-fork to PID 1), it can survive the
group reap; the runner logs any PIDs still in the group after SIGKILL as a leak
warning in the task transcript.

Engineer and reviewer prompts, and the default agent instructions in
`repoos.toml`, tell agents never to use `pkill` / `killall`. The runner also
emits a transcript warning when a shell tool call looks like a pattern kill.

## Why detached `repoos serve` from an agent shell dies quickly

The control plane runs a periodic stray-serve reaper (every ~30 seconds, see
`src/server/server.ts` and `parseServeScan` in `src/server/system.ts`). A
`repoos serve` process is classified as:

| Situation | Census kind | Reaped? |
| --- | --- | --- |
| Parent still alive (supervising) | `in-flight` | No |
| Known task preview PID | `known-preview` | No |
| This server's own PID | `control-plane` | No |
| Detached serve, parent dead, same repo root as this server | `stray` | **Yes** (SIGTERM) |
| Detached serve for another repo whose root still exists | `foreign` | No |

An agent that starts `repoos serve` in the background (nohup, `&`, or a new
session) typically leaves the serve process with PPID 1 once the agent CLI exits
or the shell returns. For the same repository root the control plane is serving,
that serve is indistinguishable from an abandoned orphan and is reaped — usually
within one reaper interval (~30s), which matches the ~15–45s observed in the
field run.

Direct `repoos serve` from a managed agent is also blocked at the CLI when
`REPOOS_AGENT=1` (unless preview-child or reload replacement); the stray reaper
is the explanation for serves that were started anyway (bypass, external shell, or
before the guard existed).

## What `repoos service` does differently

`repoos service install` registers the server with launchd (macOS) or systemd
(Linux). The service manager starts `repoos serve` as the service's main process,
not as a child of an agent turn. It is not parented to a short-lived agent shell,
is not in an agent turn process group, and is not classified as a stray orphan of
a finished turn. It survives independently of agent lifecycle.

For local interactive work, a foreground `repoos serve` in a terminal tab you keep
open is equally stable: the shell remains the supervising parent until you stop it.

## Related

- Playbook: `user-docs/running-with-agents.md` § Processes and servers
- Stray census: `docs/previews.md` (preview process groups) and #0216
- Field report: `docs/field-reports/2026-10-05-opex-first-run.md` items 16 and 31
