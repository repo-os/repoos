# RepoOS Hub release runbook

This is the release contract for the native **RepoOS Hub** for Mac. Read it
before changing its Xcode product name, distribution workflow, or public
installation copy.

## Artifact contract

- The user-facing app bundle is **`RepoOS Hub.app`**. The Xcode project,
  scheme, Swift module, and bundle identifier remain `RepoOSHub` and
  `org.repoos.hub`.
- The GitHub Release asset is **`RepoOSHub.dmg`**, containing `RepoOS Hub.app`
  and an **Applications** alias on a volume named `RepoOS Hub`. Its saved
  Finder layout has the branded background, installation copy, and app →
  Applications arrangement expected of a normal drag-to-install Mac app.
- The layout comes from `macos/dmg-settings.py`, rendered by the release-only,
  pinned `dmgbuild` tool. It writes the DMG metadata directly; do not replace
  it with Finder or AppleScript automation. That is nondeterministic in CI and
  can disrupt an interactive Mac session.
- `.github/workflows/macos-hub.yml` builds/tests on Mac changes and uploads the
  DMG on version tags. It must compile `AppIcon.icns` into the release bundle
  and inject the tag version into the app bundle; both are release checks.
- The DMG is currently ad-hoc signed and not notarized; documentation must not
  imply Developer ID signing or a warning-free first launch.

## Signing and notarization credentials

This section is the secret contract for the Developer ID signing and
notarization work in #0577–#0579. It defines credential names, formats, and
maintainer procedures only. **It does not mean the repository secrets exist or
that releases are signed today**: provisioning is a human-only operation, and
until #0578/#0579 land the DMG remains ad-hoc signed and not notarized.

All values are **repository Actions secrets** (Settings → Secrets and variables
→ Actions → New repository secret), never repository variables or committed
files. GitHub lets you replace a secret but never display its saved value; keep
the source credentials in the team password manager.

### Secret contract

| Secret | Used for | Expected format |
| --- | --- | --- |
| `MACOS_CERTIFICATE` | Signing | One line of standard Base64 (RFC 4648) of a password-protected PKCS#12 `.p12` that contains the **Developer ID Application certificate and its private key**. No PEM headers, `data:` prefix, or line breaks. CI decodes it back to a `.p12` in a temporary directory. |
| `MACOS_CERTIFICATE_PASSWORD` | Signing | The exact password chosen when exporting that `.p12`, as plain text (not Base64). Never the Apple ID password. |
| `APPLE_TEAM_ID` | Signing and notarization | The 10-character alphanumeric Team ID from the Apple Developer account's Membership details. It is the value in parentheses in a `Developer ID Application: … (XXXXXXXXXX)` identity. |
| `APPLE_ID` | Notarization, app-specific-password path | The Apple ID email address of the developer-account user that submits for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization, app-specific-password path | An app-specific password generated for that Apple ID (four groups of four lowercase letters separated by hyphens), not the Apple ID password. |
| `APPLE_API_KEY` | Notarization, API-key path | The **entire contents** of the `AuthKey_<KEY_ID>.p8` private-key file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Not a file path. |
| `APPLE_API_KEY_ID` | Notarization, API-key path | The 10-character alphanumeric App Store Connect API **Key ID**, also part of the downloaded filename. |
| `APPLE_API_ISSUER_ID` | Notarization, API-key path | The App Store Connect API **Issuer ID**, a UUID shown above the Team Keys list. |

There is deliberately **no `APPLE_API_KEY_PATH` secret**. The API-key path
materializes the `.p8` at runtime from `APPLE_API_KEY` in `$RUNNER_TEMP`, passes
that path to `notarytool`, and deletes it in the same job. A `.p8` file is never
provisioned as a path or committed.

### Choose exactly one notarization path

Use **`APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` by default**. Use the API-key
trio only when an App Store Connect API key for this team already exists (for
example, another release already uses one); do not create a key just to avoid
the app-specific-password flow.

To keep the documented choice unambiguous when provisioning:

- Configure **one complete set only**. Do not add both.
- Treat each set as a unit: a partial API-key trio or a missing member of the
  Apple ID pair is a configuration error, not permission to fall back.
- The workflow contract is deterministic: when all three of `APPLE_API_KEY`,
  `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER_ID` are present it uses the API-key
  path; otherwise it requires both `APPLE_ID` and
  `APPLE_APP_SPECIFIC_PASSWORD`. If both complete sets are present, the API-key
  path takes precedence, but that state is unsupported — remove the unused
  set.
- Record the choice in the provisioning PR or task as
  `notarization: app-specific password` or
  `notarization: App Store Connect API key`. Do not record values. If you
  switch paths later, remove the old set and record the switch.

### Provision the Developer ID certificate

This requires Apple Developer Program access and the **Account Holder** role,
which Apple requires to create Developer ID certificates, plus repository
administration to write Actions secrets. Use a dedicated key, not a personal
signing identity you also use elsewhere.

1. On a maintainer-controlled Mac, open **Keychain Access → Certificate
   Assistant → Request a Certificate From a Certificate Authority…**.
2. Enter the Apple ID email and a descriptive common name such as
   `RepoOS Hub Developer ID`. Choose **Saved to disk**, and under key-pair
   information choose **RSA, 2048 bits**. Save the `.certSigningRequest` outside
   the repository (an encrypted disk image or `$TMPDIR` is fine). The matching
   private key stays in your login keychain until the certificate is issued.
3. In the [Apple Developer portal](https://developer.apple.com/account/resources/certificates),
   open **Certificates, Identifiers & Profiles → Certificates**, click **+**,
   choose **Software → Developer ID**, then **Developer ID Application** (not
   Developer ID Installer). Upload the `.certSigningRequest`, continue, and
   download the `.cer`.
4. Double-click the downloaded `.cer` to install it in your login keychain.
   In **My Certificates**, expand the certificate and confirm the private key is
   nested under it. Verify locally:
   ```sh
   security find-identity -v -p codesigning
   ```
   The output must include `Developer ID Application: <name> (<TEAM_ID>)`.
5. Read `APPLE_TEAM_ID` from the [Membership details](https://developer.apple.com/account)
   page (10 characters). It must match the value in parentheses above.
6. Export the pair: select the certificate **and** its private key in Keychain
   Access, choose **File → Export Items…**, select **Personal Information
   Exchange (.p12)**, save outside the repository, and set a strong unique
   password. Do not leave the export password blank. That password is
   `MACOS_CERTIFICATE_PASSWORD`; the export contains both the certificate and
   private key, not just a public `.cer`.
7. Base64-encode the export as **one line** and copy it:
   ```sh
   base64 -i DeveloperID.p12 | tr -d '\n' | pbcopy
   ```
   If you need to check that something was produced, use
   `base64 -i DeveloperID.p12 | tr -d '\n' | wc -c` — never print the blob.
8. In GitHub, open **Settings → Secrets and variables → Actions** and add these
   repository secrets with exactly these names:
   - `MACOS_CERTIFICATE` — paste the single-line Base64 value.
   - `MACOS_CERTIFICATE_PASSWORD` — paste the export password as plain text.
   - `APPLE_TEAM_ID` — paste the 10-character Team ID.
9. Clear the clipboard (`pbcopy < /dev/null`) and follow
   [Secure cleanup](#secure-cleanup-of-temporary-files) for the `.p12`, `.cer`,
   and CSR.
10. Verify the external setup by checking that the secret *names* exist (never
    their values) and, once #0578 is available, running its non-publishing
    signing workflow.

The `MACOS_CERTIFICATE` export must be renewed before its certificate expires;
see [Rotate the Developer ID certificate](#rotate-the-developer-id-certificate).

### Provision notarization credentials

Choose one path as described above. `APPLE_TEAM_ID` is shared by both.

#### Recommended: Apple ID app-specific password

1. Sign in at [appleid.apple.com](https://appleid.apple.com) with the Apple ID
   that belongs to the developer team. Two-factor authentication is required.
2. Open **Sign-In and Security → App-Specific Passwords → +**, label it
   `RepoOS Hub notarization`, and copy the generated value once.
3. Add repository secrets `APPLE_ID` (the email) and
   `APPLE_APP_SPECIFIC_PASSWORD` (the generated value). Do not add an API-key
   secret.
4. Store the app-specific password in the team password manager; it is shown
   only once.

#### Optional: App Store Connect API key

1. In [App Store Connect](https://appstoreconnect.apple.com), open **Users and
   Access → Integrations → App Store Connect API → Team Keys** and click **+**.
2. Name it `RepoOS Hub notarization`, give it access to this team (the
   **Developer** role is sufficient for notarization; **Admin** also works), and
   generate the key. Use a **Team Key**, not an Individual Key.
3. Record the **Key ID** (10 characters) and the **Issuer ID** (UUID) shown
   above the keys list. Download `AuthKey_<KEY_ID>.p8` immediately — Apple lets
   you download it only once.
4. Add repository secrets:
   - `APPLE_API_KEY` — the full PEM text of the `.p8`, including header and
     footer lines. Open the file in a text editor and copy all of it; do not
     paste a path.
   - `APPLE_API_KEY_ID` — the Key ID.
   - `APPLE_API_ISSUER_ID` — the Issuer ID.
   Do not add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, or
   `APPLE_API_KEY_PATH`.
5. Delete the downloaded `.p8` using
   [Secure cleanup](#secure-cleanup-of-temporary-files) after the secrets are
   saved.

### What the dependent workflows consume

The signing workflow (#0578) decodes `MACOS_CERTIFICATE` into a temporary
`.p12`, imports it with `MACOS_CERTIFICATE_PASSWORD` into a temporary keychain,
and uses `APPLE_TEAM_ID` as the development team. It removes the temporary
keychain and `.p12` in an `always()` cleanup step.

The notarization workflow (#0579) submits the signed DMG with exactly one
authentication set:

```sh
# App-specific-password path
xcrun notarytool submit RepoOSHub.dmg \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait --timeout 1800 --output-format json

# API-key path: materialize the key only for this job
KEY="$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8"
printf '%s\n' "$APPLE_API_KEY" > "$KEY"
xcrun notarytool submit RepoOSHub.dmg \
  --key "$KEY" \
  --key-id "$APPLE_API_KEY_ID" \
  --issuer "$APPLE_API_ISSUER_ID" \
  --wait --timeout 1800 --output-format json
rm -P "$KEY"
```

These names and meanings are the contract those tasks must consume. They must
not invent aliases such as `APPLE_ID_PASSWORD`, `MACOS_CERTIFICATE_BASE64`, or
`APPLE_API_KEY_PATH`. The materialized `.p8` must be deleted in an `always()` or
trap cleanup path, not only after a successful submission.

### Rotate the Developer ID certificate

Developer ID certificates expire; sign updates with a new certificate before
that happens. Check **Keychain Access → Get Info → Not After**, or pipe
`security find-certificate -c "Developer ID Application" -p` into
`openssl x509 -noout -enddate`, and schedule the rotation at least 90 days
before expiry.
Rotating credentials does **not** invalidate already-notarized releases: the
notarization ticket is bound to the released artifact, not to the credential
used to submit it.

1. **Create the replacement first.** Generate a new CSR/private key and obtain
   a new Developer ID Application certificate as in
   [Provision the Developer ID certificate](#provision-the-developer-id-certificate),
   steps 1–6. Keep the outgoing certificate valid and installed; do not revoke
   it yet.
2. **Pause releases.** No release or signed dry-run may start while the
   certificate and password secrets are inconsistent.
3. **Update the pair together.** Replace `MACOS_CERTIFICATE` first, then
   `MACOS_CERTIFICATE_PASSWORD` immediately with the new export password.
   `APPLE_TEAM_ID` normally stays the same.
4. **Re-verify with the new value.** Confirm the `.p12` contains both the
   certificate and private key, and `security find-identity -v -p codesigning`
   shows the new identity with the expected Team ID. When #0578 provides a
   non-publishing workflow, run it and confirm the signed artifact reports the
   new certificate (`codesign -dv --verbose=4 "RepoOS Hub.app"`).
5. **Retire the old certificate safely.** For routine expiry rotation, do not
   revoke the outgoing certificate — let it expire. Apple notes that revoking a
   Developer ID certificate can prevent apps already signed with it from
   installing or launching, so revoke only for a compromised private key or an
   explicit policy requirement. If revocation is necessary, re-sign and
   republish the current release with the replacement certificate.
6. **Clean up** the old `.p12`, `.cer`, CSR, and any exported copies per
   [Secure cleanup](#secure-cleanup-of-temporary-files).

### Rotate notarization credentials

App-specific passwords and API keys have no fixed expiry; rotate them at least
annually, when a maintainer with access leaves, or immediately if exposed.
Rotation never invalidates releases already notarized with the old credential.

**App-specific password**

1. Create a new app-specific password with a new label in Apple ID
   **Sign-In and Security → App-Specific Passwords**. Keep the old one valid for
   now.
2. Pause releases, then replace `APPLE_APP_SPECIFIC_PASSWORD`. `APPLE_ID` and
   `APPLE_TEAM_ID` stay unchanged.
3. Re-verify with the non-publishing notarization workflow from #0579 when it is
   available; confirm a submission is accepted (or inspect `notarytool history`
   with the same credentials).
4. Revoke the old app-specific password only after verification succeeds, then
   delete its password-manager entry.
5. Clean up any copied value and clear the clipboard.

**App Store Connect API key**

1. Generate a replacement **Team Key** and download the new `.p8` once. Keep the
   old key active until verification finishes.
2. Pause releases, then update the trio in this order: `APPLE_API_KEY` (new
   PEM), `APPLE_API_KEY_ID` (new Key ID), and `APPLE_API_ISSUER_ID` (unchanged
   unless App Store Connect shows a new Issuer ID). The workflow derives the
   runtime filename from `APPLE_API_KEY_ID`, so no path secret changes.
3. Re-verify with the non-publishing notarization workflow from #0579 when it is
   available. The submission must authenticate with the new key before you
   revoke the old one.
4. Revoke the old key in **Users and Access → Integrations → App Store Connect
   API → Team Keys** only after verification.
5. Delete every downloaded `.p8` and any copied PEM text with the cleanup steps
   below.

### Secure cleanup of temporary files

Never put a `.p12`, `.p8`, `.cer`, CSR, password, or Base64 blob in the
repository, a task, chat, a commit, a PR, or a log. Prefer working on an
encrypted disk image. After provisioning or rotation:

```sh
pbcopy < /dev/null                 # clear the clipboard
rm -Pf DeveloperID.p12 RepoOSHub.certSigningRequest RepoOSHub.cer
find . -maxdepth 1 -name 'AuthKey_*.p8' -delete
```

Then empty the Trash, remove any Downloads/AirDrop/Mail copies, and remove any
temporary keychain created for the operation. `rm -P` is best-effort on APFS
and SSDs; for higher assurance, create the temporary files inside an encrypted
disk image and erase the image. Do not rely on deleting a file whose contents
were already synced to cloud storage.

## Release checklist

1. Build the Mac Release configuration and verify `RepoOS Hub.app` exists.
2. Merge to `main`, then cut a new patch tag; do not rewrite a failed release
   tag to repair a DMG upload.
3. Confirm the macOS Hub workflow attached `RepoOSHub.dmg`, then inspect it for
   `RepoOS Hub.app`, its branded Finder icon, Applications alias, background,
   and saved app → Applications layout.
4. The release workflow publishes npm before dispatching `repo-os/homebrew-tap`.
   It must wait for the versioned npm tarball: npm can accept a publish before
   the tarball is publicly downloadable.
5. Confirm the tap updates `Formula/repoos.rb`, then test `brew update && brew
   upgrade repo-os/tap/repoos`.

## Failure triage

- The **Build and test native Hub** job runs `xcodebuild test` with
  `CODE_SIGNING_ALLOWED=NO` (see `.github/workflows/macos-hub.yml`). A single
  red test fails the whole job and can surface a release warning even when the
  DMG upload job succeeds.
- **`HubFindBarContainerTests.testHidingFindBarReturnsFocusToThePage`** failed
  on every CI run from 2026-10-19 through v0.5.75 (for example run
  41769376401). The GitHub log only named the test; the underlying failure was
  XCTest’s memory checker (`XCTMemoryChecker`) after the test body: the case
  hosted a real `WKWebView` in an `NSWindow` without the teardown pattern other
  Hub window tests use (`isReleasedWhenClosed = false`, `orderOut`, nil
  `contentView`, a short main-run-loop drain). That abort looked like an instant
  (0.000 s) failure on CI. The fix keeps the original strict check that
  `hideFindInterface` makes the web view first responder (`window.firstResponder
  === webView`, matching the production `makeFirstResponder` call), verifies
  the find field held focus first (field editor delegate or find-bar subtree),
  settles key-window focus before presenting the bar, polls through the async
  handoff, and tears the window down safely so XCTest's memory checker does not
  abort at scope exit.
- **`LocalServerDiscoveryTests`** still compiled with Swift 6 concurrency
  warnings (`NSLock` and a captured `var` in `onUpdate`); those were cleaned up
  with `OSAllocatedUnfairLock` so a future strict mode does not turn warnings
  into errors. They were not failing the job while only the find-bar test was
  red.

- A built `RepoOS Hub.app` with a missing DMG usually means the workflow path
  still names the old bundle; fix the path and release a new patch version.
- A generic Finder icon means the release bundle is missing `AppIcon.icns`.
  Do not ship it: make the AppIcon catalog use default macOS slots, not only
  light/dark appearance variants, then confirm the workflow's icon check.
- A tap 404 for the npm tarball is registry propagation, not a formula checksum
  failure. Retry only after the tarball is public and retain the release wait.
- A Gatekeeper warning is currently expected. Revisit docs only when signing or
  notarization policy changes.
