---
id: "mut66wkh-86r76"
number: "0049"
title: "Currently we save the AI generated release notes, but it's a black box to the user on whether or not"
status: new
type: "other"
created_by: "hello@repoos.org"
created_at: "2026-10-04T01:56:39.137Z"
updated_at: "2026-10-04T01:56:39.137Z"
---

Currently we save the AI generated release notes, but it's a black box to the user on whether or not the already-generated release notes get used again after a failed release like I just had. So Let's just surface a card below the AI release notes generate button which shows the most recently generated AI release notes that were not pushed successfully with a release already and say how old it is (generated x minutes ago), how far behind the current main it is etc (and the actual release notes text) and any other useful info the user may need to quickly decide if they can re-use those release notes to try to cut a new release again (usually it happens after a release cut failed for some reason and the user is just trying again after some minor fix, in my case I only updated the repoos.toml to try the release again on a remote runner)
