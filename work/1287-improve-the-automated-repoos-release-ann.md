---
id: "1287"
title: Polish automated release announcement emails
type: feature
status: review
priority: p2
area: [server, web]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/polish-automated-release-announcement-em
created_at: "2026-11-23T07:50:59Z"
updated_at: "2026-11-23T09:37:30Z"
review_passes: 1
---
## Problem

Automated release announcement emails are hard to skim and look unpolished. Subjects follow `{project} v{version} is out`, which in practice produces awkward lines like **Publish RepoOS v0.5.93 is out** (internal or commit wording leaking into the product name). The body jumps straight into long release notes with no top-level summary, so recipients must read the full changelog to learn what changed. That conflicts with frequent releases: the email should take **15–20 seconds** to scan, with full technical detail available below for those who want it.

## Desired UX

Recipients get a compact, professional announcement in the spirit of a polished GitHub release — informational, not a marketing newsletter.

**Subject:** `RepoOS v{version} released — {headline}`

- Headline is a concise, meaningful phrase from the **most important user-facing** change in the notes.
- Fallback subject with no headline: `RepoOS v{version} released`.
- Never put internal task titles (e.g. **Publish**) or implementation jargon in the subject.

**Header (HTML):** `RepoOS v{version} is here` with the release date directly underneath; minimal branding.

**TL;DR:** 2–3 sentences (~50 words), plain English, grounded in the actual release notes. Benefits and meaningful changes only; no hype or unsupported claims.

**Highlights:** 3–5 bullets — bold feature name, one-sentence explanation. Group related items; no invented features; no duplicate bullets.

**Full release notes:** Complete existing changelog below the summary, with readable paragraphs and bullets. Keep categories (Features, Improvements, Fixes, etc.) when present. Drop redundant section headings such as **Other** when it is the only category.

**Presentation:** Responsive HTML that reads well in Gmail mobile and desktop; dark mode where practical; consistent typography, spacing, and hierarchy. Link to the release page when a URL is available (existing repository/release link logic). Plain-text multipart alternative mirrors the same structure.

**Tone:** Developer-friendly, concise, professional.

## Acceptance criteria

- [ ] Email subject matches `RepoOS v{version} released — {headline}` when a headline can be derived from the notes; falls back to `RepoOS v{version} released` when it cannot.
- [ ] Subject never includes internal task names (e.g. **Publish**) or strings that are not user-facing product copy.
- [ ] HTML header reads `RepoOS v{version} is here` with the release date shown beneath (prerelease label preserved when applicable).
- [ ] TL;DR appears above highlights; at most ~50 words in 2–3 sentences; content is derivable from the release notes only.
- [ ] Highlights section has 3–5 grouped bullets with bold names and one-sentence explanations; no fabricated or duplicated items.
- [ ] Full release notes from `ReleaseHistoryEntry.notes` appear below the summary, formatted for readability; meaningful categories retained; lone **Other** section heading omitted.
- [ ] HTML is responsive and acceptable in Gmail mobile/desktop snapshots or documented checks; dark-mode-friendly styles where practical.
- [ ] Release page / repository link included in HTML and text when `repositoryLinks` supplies one.
- [ ] Plain-text body includes subject line, TL;DR, highlights, full notes, known issues, links, upgrade command, and unsubscribe footer — consistent with today’s `renderReleaseEmail` context fields.
- [ ] TL;DR, headline, and highlights are generated **once per release version** and reused for every recipient (not per-address).
- [ ] Summary generation reuses existing release metadata and notes; does not add redundant LLM calls beyond what the release-notes pipeline already does (prefer deriving from stored notes or extending that pipeline once at cut/publish time).
- [ ] If summary generation fails, email still sends with fallbacks (no headline segment, TL;DR omitted or shortened from notes heuristically, highlights from top bullets) without inventing content.
- [ ] `repoos release email --preview 0.5.93` (and `GET /api/release/email/preview`) render the new layout.
- [ ] Tests updated in `src/ui-app/tests/release-email.test.ts` (and any new unit tests for summary helpers).
- [ ] A checked-in **sample rendered email** for **v0.5.93** (HTML + plain text or snapshot) using notes from `release-history.json` as the fixture.

## Notes for AI

- Primary implementation: `src/server/release-email.ts` (`renderReleaseEmail`, `groupedNotes`, template). Preview/send paths: `src/server/routes/release.ts`, `src/commands/release.ts` (`release email --preview`).
- Release data source: `readReleaseHistory` / `ReleaseHistoryEntry` (`notes`, `date`, `version`, `tag`, `knownIssues`). v0.5.93 fixture notes live in `release-history.json`.
- Prior work: #1071 (feature), #1094 (grouped templates, unsubscribe, links), #1092/#1093 (preview and send-to-self). AI release notes drafting: `draftNotes` / `release-notes-cache.ts` in `src/server/routes/release.ts` — extend or hook there if summaries should be produced at draft time rather than at send time.
- Store per-version email summary fields (headline, tldr, highlights) alongside or inside the existing gitignored `release-emails.json` record so resends and previews stay stable without re-calling an LLM.
- **Assumption:** Product name in subjects/headers uses the configured release display name (`config.release.name` or `projectDisplayName`), which for this repo is **RepoOS**; template copy in the spec uses RepoOS literally but must still work for other projects’ `release.name`.
- Do not break send reliability: release email code must not throw into the cut pipeline (#1071 contract).
- Zero new runtime npm dependencies.
- Keep the Releases UI preview (`ReleasesView.vue`) readable — it shows subject + text preview today; adjust only if the new structure needs a small layout tweak.
- Do not change unsubscribe, publish-wait, or double-send semantics.

## Scope

**In scope:** Subject/header copy, TL;DR and highlights generation and caching, HTML/text template hierarchy, tests, v0.5.93 sample output.

**Out of scope:** Changing who receives mail, publish-when settings, provider configuration, or rewriting how release notes are drafted during cut (except a minimal hook to persist summaries if that is the chosen integration point).

## Related

- #1071, #1094, #1092, #1093 — release email feature and templates
- #1126 — AI-generated release notes pipeline
- `user-docs/configuration.md` (Release emails), `user-docs/cli.md` (`repoos release email --preview`)
- `docs/releases.md`

## Original prompt

Improve the automated RepoOS release announcement emails.

The current emails use awkward subjects like "Publish RepoOS v0.5.93 is out" and display long, unstructured release notes without a summary.

Implement the following changes:

1. Email subject: "RepoOS v{version} released — {headline}"
   
- Generate a concise, meaningful headline based on the most important user-facing change.
- Fallback: "RepoOS v{version} released".
- Never include internal task names like "Publish" in the subject.

2. Email header: "RepoOS v{version} is here"
   
- Display the release date underneath.
- Keep the branding clean and minimal.

3. TL;DR section:
   
- Generate a concise, plain-English summary of the release from its actual release notes.
- Maximum 2–3 sentences (~50 words).
- Focus on benefits and meaningful changes rather than implementation details.
- Avoid marketing hype and unsupported claims.

4. Highlights section:
   
- Extract the 3–5 most important changes.
- Format as short bullets with bold feature names and one-sentence explanations.
- Group related changes instead of repeating individual implementation details.
- Do not invent features or duplicate identical information.

5. Full release notes:
   
- Preserve the complete existing changelog beneath the summary.
- Format with readable paragraphs and bullet points.
- Retain meaningful categories (Features, Improvements, Fixes, etc.).
- Omit redundant headings such as "Other" when it is the only category.

6. Email presentation:
   
- Use a clean, responsive HTML email template that works well in Gmail mobile and desktop.
- Support dark mode where practical.
- Keep typography, spacing, and hierarchy consistent.
- Include a link to the release page if available.
- Include a plain-text email alternative.

7. Generation architecture:
   
- Reuse existing release metadata and changelog generation wherever possible.
- Generate the TL;DR and highlights once per release, not separately for every recipient.
- Avoid adding unnecessary LLM calls if the existing release generation pipeline already uses AI.
- Provide sensible fallbacks if summary generation fails.
- Ensure all generated summaries remain grounded in the actual release notes.

Add or update tests and provide a sample rendered email using v0.5.93 as a fixture.

Keep the overall style professional, developer-friendly, and concise — similar to a polished GitHub release announcement, not a marketing newsletter.

One additional suggestion: since RepoOS releases appear to be frequent, I'd keep these emails compact and informational, rather than overly promotional. A good release email should take 15–20 seconds to skim, with the full technical changelog available for anyone who wants the details.

## Activity

- 2026-11-23T07:50:59Z · created · hello@repoos.org
- 2026-11-23T07:51:19Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
- 2026-11-23T07:52:07Z · status inbox→ready
- 2026-11-23T08:48:20Z · status ready→active, branch
- 2026-11-23T09:06:37Z · body
- 2026-11-23T09:17:31Z · body
- 2026-11-23T09:32:19Z · body
- 2026-11-23T09:36:25Z · status active→review
- 2026-11-23T09:36:26Z · message_queued at 2026-11-23T09:36:26.310Z
- 2026-11-23T09:36:26Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-23T09:37:30Z · note: review pass 1: needs some work
- 2026-11-23T09:37:30Z · message_delivered: 1 message(s)
