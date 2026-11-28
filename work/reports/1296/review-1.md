---
task: "1296"
pass: 1
at: "2026-11-28T01:15:27.661Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/publish-the-android-hub-apk-from-your-ma
state: ok
tree_identity: "2ff821d77:7731416806"
---
## Verdict

`needs some work` — `mobile/scripts/publish-hub-apk.ts` resolves the release APK and verifier to the wrong repo-root paths, so a real publish fails after Gradle succeeds.

## Relevance

`still relevant` — GitHub-release Android downloads are correctly replaced with maintainer R2 publish plus Worker-served URLs; the rest of the slice matches the spec.

## Evidence

None

## Bugs

- **Class: artifact path resolution** — In `mobile/scripts/publish-hub-apk.ts`, `const apk = join(root, "app-release.apk")` looks at the repository root, but `just build-android-release` writes `mobile/app-release.apk` (see `justfile` and `mobile/README.md`). After a successful build the script dies on “Expected release APK was not produced…”.
- **Class: artifact path resolution** — Same file calls `join(root, "scripts/verify-release-apk.ts")`; the only verifier is `mobile/scripts/verify-release-apk.ts` (`justfile` line 729). Even with a fixed APK path, certificate verification would fail before upload.

No further findings of this class were found after grepping: `mobile/scripts/publish-hub-apk.ts`, `justfile` (`build-android-release`, `publish-hub-apk`), `mobile/scripts/verify-release-apk.ts`, `mobile/README.md`, branch `git diff main...HEAD`.

## Edge cases

Credential-refusal tests exit before build; they would not catch these path bugs. Dry-run still runs the full build path, so maintainers hit both failures on first use. Worker, `HubDownloadLink`, wrangler binding, and docs wiring otherwise align with acceptance criteria.

## Suggestions

Re-capture the declared shot with the viewport scrolled to `#android-hub` so “Coming soon” is visible (current PNG is the hero only; highlight may not have landed in frame). After path fixes, a `--dry-run` test that asserts post-build verification without upload would guard regression.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-28T01:14:12.289Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

