---
id: "1287"
title: Improve the automated RepoOS release announcement emails.
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-11-23T07:50:59Z"
updated_at: "2026-11-23T07:50:59Z"
---
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
