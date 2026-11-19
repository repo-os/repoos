# Inputs and Context uploads with large, wrong-type and failing files — November 2026 (#1248)

## Scope and setup

QA pass over file uploads on the **Inputs** page (the New input panel and its
attachment follow-up) and the **Context** page (new doc upload and new skill
upload). Every case used fixtures and mocked responses: in-memory `File`
objects of chosen size and type, and stubbed `fetch` results. No real large
files, no live server, and no binaries were committed under `work/` or
`inputs/`.

Rendering was headless. The New input panel is mounted with the real component
in jsdom against a seeded store, and the markup is injected into headless WebKit
with the built global stylesheet. The regression tests are:

- `src/ui-app/tests/input-upload-guard.test.ts` — validator rules, store
  behaviour (cap, duplicates, failed reads), panel notices, and the server route
  status codes against a real temporary repo.
- `src/ui-app/tests/new-input-uploads-qa-browser.test.ts` — the WebKit audit at
  375, 768 and 1280 px. Every visible element must sit inside the viewport, and
  no button or input may be clipped by a scroll box. Set `QA_SHOTS=<dir>` to
  save a screenshot per fixture and width.

## Results

| Surface / state | 375px | 768px | 1280px | Result |
| --- | --- | --- | --- | --- |
| New input, picks with a long unbroken name, a duplicate and a rejected PDF | Fits; notices wrap | Fits | Fits | Pass |
| New input, failed earlier upload with "Dismiss <file name>" | Was off the left edge (−121 px); fixed | Fits | Fits | Pass after fix |
| Validation: wrong type, empty file, over 10 MB, cap of 12 across a drop | n/a (logic) | n/a | n/a | Pass |
| Server: non-image 400, over-cap 413, missing input 404, valid 201 | n/a (API) | n/a | n/a | Pass |

## Findings and fixes

**1. Rejected files were read and sent anyway.** The New input panel accepted
any file (drag-and-drop bypasses the picker's `accept`), with no type, empty or
size check. A 300 MB PDF was read into memory and uploaded. Now
`src/ui-app/src/lib/upload-guard.ts` rejects each file before it is read and
states the fix in plain English, for example "“spec.pdf” isn’t an image we can
attach. Use PNG, JPEG, GIF, WebP, AVIF or BMP files." The panel shows these in a
dismissable alert.

**2. The 12-file cap could be exceeded.** The store checked the cap before each
`FileReader` finished, so a 15-file drop queued all 15. Each pick now reserves
its slot synchronously. Files past the cap produce a notice.

**3. Duplicate names silently overwrote each other.** Two picks named `shot.png`
were both stored under one name on the server. Duplicates are now renamed
(`shot-2.png`) and the panel says so.

**4. A failed read vanished without a message.** `FileReader.onerror` did
nothing. It now removes the placeholder and says "Couldn’t read “x.png”. Try
adding it again."

**5. Submit could send an unread attachment.** The reserved slot has no data
until the read completes. Submit is now disabled while any pick is still
reading.

**6. The server returned 404 for every failure.** `POST /api/inputs/:id/attachments`
mapped every error to 404 and had no type or size check (the task screenshot
route had both). It now returns 400 for a non-image or empty image, 413 for over
10 MB (the same `MAX_SCREENSHOT_BYTES` as task screenshots), 404 only for a
missing input, and 500 for storage failures. Validation runs before anything
reaches disk.

**7. A long file name pushed a button off-screen at 375 px.** The follow-up
row's "Dismiss <file name>" button sat in a non-wrapping `.btn-row` aligned to
the end, so an unbroken name pushed it past the left edge. The follow-up row now
lets that label wrap (`.ff-upload-followup .btn-row > *` in `style.css`).

## Open items (not fixed here)

- **Context doc upload (`NewDocPanel`) has no size or type limit.** The client
  base64-encodes the whole file, and the server (`src/server/routes/docs.ts`)
  takes `contentBase64` with no cap. Setting a limit is a product decision, so
  it needs a follow-up task before any code changes.
- **Context skill upload (`NewSkillPanel`) reads the file as text with no type
  or size check.** A binary file is read in full. Not verified against the server
  handler in this pass.
- **Task screenshots and PM compose** (`addScreenshots`, `addPmScreenshots` in
  `stores/ui.ts`) share the uncapped-race and missing-check pattern from findings
  2 and 5. They have no notice path, so rejecting silently would be worse than
  the current server error. Needs a follow-up that adds the notices there too.
- **No byte-level progress.** Uploads show the existing "uploading" state with
  an indicator, not a percentage. `api()` uses `fetch`, which has no upload
  progress.
- **No live run.** Nothing here was checked against a running server or a real
  large file. A human should try one 9 MB and one 11 MB real image on a device.
