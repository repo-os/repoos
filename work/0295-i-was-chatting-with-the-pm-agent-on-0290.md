---
id: "0295"
title: "I was chatting with the PM agent on #0290 and the task ha…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-08-25T11:26:17Z"
updated_at: "2026-08-25T11:26:17Z"
---
I was chatting with the PM agent on #0290 and the task had gone through a few rounds of dev and review already, but I decided I wanted to add some additional scope the task, and the PM helped me to update the task spec, but then it flagged a missing feature to me: ```Now send it back to the developer with a note. Let me check how to move status with a note/activity entry. Let me set it back to active (dev) and check for a note mechanism.

19:18
Checked with bash · completed
Checked with bash · completed
PM
Now I need to add a note to the task for the developer. Let me check if there's a way to append a note via the CLI.

19:18
Checked with bash · completed
PM
There's no dedicated "note" command. The note to the developer is best captured through the activity/body. Since there's no note field exposed in the CLI, I'll append a ## Review notes section to the task body so the developer sees the requested updates inline, and the activity already records the status transition.```

sounds like a good option to have, can you add it as a new task? seems like a generally useful feature to have

## Original prompt

I was chatting with the PM agent on #0290 and the task had gone through a few rounds of dev and review already, but I decided I wanted to add some additional scope the task, and the PM helped me to update the task spec, but then it flagged a missing feature to me: ```Now send it back to the developer with a note. Let me check how to move status with a note/activity entry. Let me set it back to active (dev) and check for a note mechanism.

19:18
Checked with bash · completed
Checked with bash · completed
PM
Now I need to add a note to the task for the developer. Let me check if there's a way to append a note via the CLI.

19:18
Checked with bash · completed
PM
There's no dedicated "note" command. The note to the developer is best captured through the activity/body. Since there's no note field exposed in the CLI, I'll append a ## Review notes section to the task body so the developer sees the requested updates inline, and the activity already records the status transition.```

sounds like a good option to have, can you add it as a new task? seems like a generally useful feature to have

## Activity

- 2026-08-25T11:26:17Z · created · hello@repoos.org
