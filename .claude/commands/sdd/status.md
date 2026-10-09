---
description: Show the spec board — every spec, its status, and what blocks it
---

# /sdd:status

1. Run `npm run sdd:check` and read its output.
2. Print a compact board grouped by status (draft → shipped), one line per spec:
   `NNNN  title  risk  ACs proven/total  next step`.
3. For each spec with errors, name the single next action that clears them.
4. Flag drafts older than 14 days (`created:`) — finish, split, or abandon them;
   a stale draft is noise in every future search.

Do not change any spec in this command. It is a read.
