# Releases

Written 2026-09-07. How RepoOS cuts a versioned product release of the repo it
manages, and how prerelease channels (beta / canary / rc) work.

## The one idea

**RepoOS only pushes a git tag. CI builds and publishes.** `cutNewRelease`
(`src/server/release.ts`) commits the version bump, runs the full `repoos
check` gate, pushes the release branch, then pushes an annotated
`v<version>` tag. That's the whole of RepoOS's job — no GitHub client, no npm
publish, nothing that would pull a dependency into the zero-runtime-dependency
core. The tag push triggers `.github/workflows/release.yml`, which packages
`dist/` and creates the GitHub Release. Until that workflow finishes, the
version is tagged but **not downloadable**.

Releases are opt-in. Without a `[release]` block in `repoos.toml` the feature
is off and the "Releases" nav item doesn't appear.

## Configuration

```toml
# repoos.toml
[release]
enabled     = true
provider    = "git-tag"              # the only provider; others rejected
name        = "Publish RepoOS"       # shown on the Releases page
branch      = "main"                 # release must be cut from here
versionFile = "package.json"         # holds the committed semver
tagPrefix   = "v"                    # tag = tagPrefix + version
remote      = "origin"               # receives the branch + tag push
repository  = "repo-os/repoos"       # owner/repo — only used to build links
workflow    = ".github/workflows/release.yml"  # shown as context, never run by RepoOS
```

`repository` and `workflow` are cosmetic: they only build the "GitHub release"
and "CI workflow" links on the page. The functional keys are `branch`,
`versionFile`, `tagPrefix`, and `remote`.

## Cutting a release

From the **Releases** page, click **Cut v\<next\>**. The modal states the
currently-published version and the suggested next one (a patch bump, or the
stable graduation of a prerelease), you type the new version — **just the
number, no `v`** — and hit **Publish v\<x\>**.

The modal also has an **optional release-notes text area**. Type notes by hand,
or click **Generate with AI** to draft them from the commits since the last
release tag (or the full history when there is no previous release) and fill
the text area; the draft is editable before you confirm. Notes are optional end
to end — leaving the field empty cuts the release exactly as before. See
"Release notes" below.

`POST /api/release` kicks off `cutNewRelease` in the background and returns
immediately; the page polls `GET /api/release/run` for progress. The run
moves through these phases:

| phase          | what happens |
| -------------- | ------------ |
| `preparing`    | re-read status; checkpoint safe churn if the tree is dirty (see below) |
| `committing`   | write `version` into `versionFile`, commit as `release: v<x>` — **skipped** if the manifest is already at that version (retry path) |
| `building`     | `bun run build` — so the staleness gate can't trip, and to confirm the tree compiles before any ref moves |
| `checking`     | `repoos check` — the same definition-of-done gate as task close-out (build staleness, full build, tests, UI smoke, fmt/lint) |
| `pushing_main` | `git push <remote> <branch>` |
| `tagging`      | `git tag -a v<x> -m "Release v<x>"` — plus a second `-m` carrying the release notes when any were supplied |
| `pushing_tag`  | `git push <remote> v<x>` — this is what triggers CI |

If any phase fails, the run stops with `state: "failed"`, the phase it failed
in, and the full command output. Nothing after the failure point ran — in
particular, a failure at or before `checking` means **no ref was pushed**. A
failed `pushing_tag` deletes the local tag it just created so a retry starts
clean.

On success: `v<x> pushed. CI is now building the release — it becomes
downloadable once that finishes.`

### Retry / resume

The version bump is a real committed change, so a retry after a transient
failure (e.g. the tag push timed out) is safe: `cutNewRelease` sees the
manifest already at the target version, **skips the commit phase**, and
resumes from `building` → `checking` → push. Just click **Cut** again with the
same version.

### Safe-churn checkpoint

`repoos check` takes minutes, and RepoOS is self-hosted — a routine settings
save (`repoos.toml` is always written whole by the settings API) or a task
bookkeeping write under `work/` can land during that window and flip the tree
dirty, which would otherwise abort an otherwise-ready release. `cutNewRelease`
auto-commits that specific class of churn (`repoos.toml` or anything under the
work dir, nothing else) as `chore: checkpoint bookkeeping/config before
release` rather than failing. Any *other* dirty path still blocks the release.

### Failure → Debugger

A failed run shows a one-line classification of the cause (test timeout, test
failure, TypeScript error, stale build) above the raw log, plus a **Send to
Debugger** button that hands the phase, target tag, commit, and full output to
the Debugger agent and opens its chat. Requires the Debugger agent enabled on
the Agents page.

## Release notes

The cut modal's notes field is optional. Anything typed or generated is sent
with the cut and stored in the **annotated tag's body** — the git-native
release record this provider creates:

```
git tag -a v1.2.3 --cleanup=verbatim -m "Release v1.2.3" -m "<the notes>"
```

RepoOS passes notes as a second `-m` and adds `--cleanup=verbatim` so Markdown
headings survive (git's default message cleanup strips `#`-prefixed lines as
comments). With the field empty, the annotation is the unchanged single
`Release v<x>` line.

`.github/workflows/release.yml` reads the tag's annotation body back with
`git tag -l --format='%(contents:body)' <tag>` and passes it to
`softprops/action-gh-release` as `body_path`, so the notes become the GitHub
release body (prepended to GitHub's auto-generated notes). When no notes were
supplied the extracted body is empty and GitHub's auto-generated notes are used
exactly as before.

**Generate with AI** calls `POST /api/release/notes`, which resolves the enabled
PM agent (falling back to the engineer), collects commit subjects since the last
reachable tag, and runs one `runPrompt` turn. The request never cuts anything:
it returns the draft for the modal to place in the text area, where it stays
editable. On failure the modal shows the error and whatever you already typed is
preserved. The one-shot call is recorded in the `sessions` table
(`sessionType: "release-notes"`, `taskId: null`) like every other LLM call site.

## Prerelease channels: beta / canary / rc

A semver with a `-` identifier is a prerelease. To cut one, type the full
prerelease version in the modal — e.g. `0.6.0-beta.1`, `0.6.0-canary.3`,
`0.6.0-rc.1` — instead of a bare `0.6.0`. The modal preview turns amber and
shows `· prerelease` so it's clear what will happen. Everything downstream
keys off the `-` in the tag:

- **`release.yml`** — the "Determine channel" step sets `prerelease: true` and
  `make_latest: false` on the GitHub Release for any `-`-tagged push. So the
  release is flagged pre-release on GitHub and does **not** take the "Latest"
  badge.
- **`repoos upgrade`** (default, no flag) — calls GitHub's
  `GET /releases/latest`, which **always excludes prereleases** (GitHub's own
  rule, not configurable). So a plain `repoos upgrade` never hands a beta to a
  stable user. That exclusion is the *entire reason* `release.yml` sets the
  prerelease flag.
- **`repoos upgrade --channel beta`** (or `canary`, `rc`) — can't use
  `/releases/latest` (it's filtered), so it lists recent releases and picks
  the newest tag matching `-<channel>.`. This is how a user opts into a
  channel.
- **Releases page** — while the prerelease is the current version, the pill
  reads **Prerelease** (amber) instead of **Published**, and a "last stable ·
  vX" line appears under the lineage. See "The Releases page" below for the
  full logic of what shows when.

There is no branch or config per channel — it's purely the version string you
type. `nextReleaseVersion` graduates a prerelease to its matching stable on
the next cut (`0.6.0-beta.1` → suggested next `0.6.0`).

### Versioning tip

Bump the base version *then* add the prerelease suffix: from stable `0.5.9`,
cut `0.6.0-beta.1`, iterate `-beta.2`, `-rc.1`, then cut stable `0.6.0`.
Prerelease identifiers sort before the matching stable (`0.6.0-rc.1` < `0.6.0`)
and `repoos upgrade`'s "already up to date" check is exact-string, so moving
between channels always looks like a version change.

## `repoos upgrade`

Self-updates a **standalone (curl-installed)** build by downloading the release
tarball and swapping it into place. No-ops with a helpful message for a
package-manager install (`bun update` / `npm update` instead) or a source
checkout (`git pull && bun run build`).

```
repoos upgrade                    # latest stable
repoos upgrade --channel beta     # latest beta   (also: canary, rc)
```

The channel value just has to match the `-<channel>.` in a tag, so any
identifier you actually publish works, not only those three.

## The Releases page

### It shows one release, not a history

The page is **not** a release list. It derives everything from one number —
the committed version in `versionFile` — and shows:

- **the tag for that version**, if it exists (the "last shipped" node), and
- **the suggested next version** (the arrow's target).

Whatever type that current version is — stable or prerelease — is what the
page shows. Cut `v0.6.0-beta.1` and the page's "last shipped" becomes
`v0.6.0-beta.1`; the pill reads **Prerelease** (amber, not the green
**Published**); the suggested next is `v0.6.0` (the stable graduation). Then
cut `v0.6.0` and the page moves on to that — the `v0.6.0-beta.1` tag is still
in `git tag` and on GitHub, but the page no longer mentions it. **The full
history across every channel is the "GitHub release ↗" link, not this page.**

So: a beta/canary/rc shows on the page **only while its version is the one
committed in `package.json`** — i.e. right after you cut it, until you cut
something newer. It's never shown *alongside* a stable release; the page has
room for exactly one "current".

### The "last stable" line

Because a prerelease *is* the current version in that window, and
`git describe` would report it as the nearest tag, the page separately
computes `latestStableTag` (newest `-`-free tag merged into HEAD) and adds a
small **"last stable · vX"** line under the lineage while a prerelease is
current — so you can still see where the real stable line sits.

### States

| pill           | meaning |
| -------------- | ------- |
| **Published**  | the current version has a tag, and it's a stable version — the normal resting state |
| **Prerelease** | same, but the current version carries a `-` identifier |
| **Ready**      | a version is bumped in the manifest but not yet tagged — cut it as-is |
| **Blocked**    | dirty tree, wrong branch, or another blocker — listed under the card |
| **Releasing…** | a run is in progress |

"shipped 2h ago · \<sha\>" comes from the tag's own creation date, so it
survives a server restart (the in-memory run state does not).

## API

| method + path            | purpose |
| ------------------------ | ------- |
| `GET /api/release`       | `ReleaseStatus` — version, tags, blockers, links |
| `GET /api/release/run`   | `ReleaseRun` — `state` / `phase` / `message` / timestamps for the current or most recent run (in-memory, resets on restart) |
| `POST /api/release`      | `{ version, confirmTag, notes? }` → starts a run; `409` if one is already running |
| `POST /api/release/notes`| `{ version? }` → drafts release notes from commits since the last tag and returns `{ notes, sinceTag, commitCount, truncated }`; never cuts a release |

`confirmTag` must exactly equal `tagPrefix + version` — a guard against a
malformed request cutting the wrong tag.

## CI: `release.yml`

Triggered by `push` of a tag matching `v*.*.*` (which also matches
`v1.2.3-beta.1`). Steps: checkout → `bun install --frozen-lockfile` →
`bun run build` → `tar -czf repoos-dist.tar.gz -C dist .` → determine channel
from the tag → read the release notes out of the tag's annotation → 
`softprops/action-gh-release@v2` with `body_path` (the notes), 
`generate_release_notes`, `prerelease`, and `make_latest` set per channel.

RepoOS's `repoos check` already ran (locally, during `cutNewRelease`) before
the tag was pushed, so CI does not re-run the test gate — it only packages and
publishes.

## Notes / gotchas

- **The release is not downloadable when `cutNewRelease` returns.** It returns
  when the tag is pushed; CI then takes a few minutes. Watch the "CI workflow"
  link.
- **`repoos check` runs during the release, on the operator's machine.** On a
  memory-constrained box this is the same flake surface as task close-out. A
  timeout in `checking` is usually that, not a regression — the failure
  headline says so. (Wiring the release path to the remote validator is
  tracked in task #0329.)
- **In-memory run state.** `GET /api/release/run` is a single module-level
  value. After a server restart mid-release the page shows `idle` even though
  the tag may have pushed — check `git tag` / the GitHub releases page.
- **Retry is always safe once the version is committed.** Re-clicking Cut with
  the same version resumes from the build.
