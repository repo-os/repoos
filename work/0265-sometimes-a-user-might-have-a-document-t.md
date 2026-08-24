---
id: "0265"
title: Add upload docs tab for direct file uploads
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-upload-docs-tab-for-direct-file-uplo
created_at: "2026-08-24T07:50:37Z"
updated_at: "2026-08-24T08:04:46Z"
---
## Problem

Users currently have two options for adding documents to the docs folder: have AI interpret and process them, or manually copy-paste content. Neither option supports direct file uploads. Some users want to upload documents as-is without interpretation or manual intervention.

## Desired UX

Users see a new "Upload docs" tab adjacent to the existing manual form tab. The upload tab includes a filepath field (styled consistently with the manual upload tab) and allows users to select and upload files directly to the docs/ folder without any processing or interpretation.

## Acceptance criteria

- [ ] New "Upload docs" tab is visible alongside the manual form tab in the docs UI
- [ ] Filepath field in upload tab matches the styling and behavior of the manual tab's filepath field
- [ ] Users can select files and upload them directly to the docs/ folder
- [ ] Upload succeeds without AI interpretation or modification of the uploaded content
- [ ] Uploaded files appear in the docs/ folder with the specified filepath

## Notes for AI

- Keep the filepath field behavior and styling consistent between the manual upload and upload docs tabs
- This is a direct upload feature—files should be stored as-is without processing
- Determine sensible defaults for filepath handling (e.g., validation, path resolution)
- Assume integration with the existing docs upload infrastructure

## Scope

This task covers adding the UI tab and upload mechanism for direct docs uploads. Processing of existing docs through manual forms or AI interpretation is out of scope.

## Original prompt

Sometimes a user might have a document that they just want to upload directly to the docs/ folder rather than having AI interpret it or copying and pasting into the manual form, so can we add an upload docs tab next to the manual form tab. Btw let's keep the filepath entry field similar to the manual upload tab.

## Activity

- 2026-08-24T07:50:53Z · status draft→inbox, title, area, body
- 2026-08-24T07:51:48Z · status inbox→ready
- 2026-08-24T07:53:06Z · status ready→active, branch
- 2026-08-24T08:04:39Z · status active→review
